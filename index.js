const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const TIER1_PRICE_ID = "price_1TO5E9Rt74M3AjXKT7mRnvyE";  // Live $4.99/mo
const TIER2_PRICE_ID = "price_1TO5JPRt74M3AjXK2gfE7BXv";  // Live $9.99/mo w/ HA

async function announceToHA(webhookUrl, message) {
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    console.log("HA webhook response: " + response.status);
  } catch (err) {
    console.error("HA webhook error:", err.message);
  }
}

async function getFamilyAnnouncementConfig(familyId) {
  const familySnap = await db.collection("families").doc(familyId).get();
  if (!familySnap.exists) return null;

  const family = familySnap.data() || {};
  if (!family.haWebhookUrl) return null;
  if (family.proTier !== "tier2") return null;

  return {
    webhookUrl: family.haWebhookUrl,
  };
}

function buildTaskMap(tasks) {
  return new Map(
    (Array.isArray(tasks) ? tasks : [])
      .filter((task) => task && (task.id || task.templateId))
      .map((task) => [task.id || task.templateId, task])
  );
}

function findNewAdjustment(beforeEntries, afterEntries, type) {
  const beforeKeys = new Set(
    (Array.isArray(beforeEntries) ? beforeEntries : [])
      .filter((entry) => (entry?.type || "").toLowerCase() === type)
      .map((entry) => JSON.stringify([
        entry.type || "",
        entry.createdAt || "",
        entry.value || "",
        entry.reason || "",
        entry.title || "",
        entry.dateKey || "",
      ]))
  );

  return (Array.isArray(afterEntries) ? afterEntries : []).find((entry) => {
    if ((entry?.type || "").toLowerCase() !== type) return false;
    const key = JSON.stringify([
      entry.type || "",
      entry.createdAt || "",
      entry.value || "",
      entry.reason || "",
      entry.title || "",
      entry.dateKey || "",
    ]);
    return !beforeKeys.has(key);
  }) || null;
}

// ── Stripe webhook handler ────────────────────────────────────
exports.stripeWebhook = onRequest(
  { secrets: ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"] },
  async (req, res) => {
    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    const sig = req.headers["stripe-signature"];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature error:", err.message);
      return res.status(400).send("Webhook Error: " + err.message);
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const ownerUid = session.metadata?.ownerUid;
      const priceId = session.metadata?.priceId;

      if (!ownerUid) {
        console.error("No ownerUid in session metadata");
        return res.status(400).send("Missing ownerUid");
      }

      const tier = priceId === TIER2_PRICE_ID ? "tier2" : "tier1";

      // Fetch the subscription to get the period end date
      let subscriptionEndsAt = null;
      if (session.subscription) {
        try {
          const subscription = await stripe.subscriptions.retrieve(session.subscription);
          subscriptionEndsAt = new Date(subscription.current_period_end * 1000).toISOString();
        } catch(e) {
          console.warn("Could not fetch subscription period:", e.message);
        }
      }

      const snap = await db.collection("families")
        .where("ownerUid", "==", ownerUid)
        .limit(1)
        .get();

      if (!snap.empty) {
        await snap.docs[0].ref.update({
          isPro: true,
          proTier: tier,
          stripeCustomerId: session.customer,
          stripeSubscriptionId: session.subscription,
          subscribedAt: new Date().toISOString(),
          subscriptionEndsAt: subscriptionEndsAt,
        });
        console.log("Family upgraded to " + tier + ": " + ownerUid);
      }
    }

    // When subscription renews, update the period end date
    if (event.type === "invoice.payment_succeeded") {
      const invoice = event.data.object;
      if (invoice.billing_reason === "subscription_cycle" && invoice.subscription) {
        try {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
          const customerId = invoice.customer;
          const snap = await db.collection("families")
            .where("stripeCustomerId", "==", customerId)
            .limit(1)
            .get();
          if (!snap.empty) {
            await snap.docs[0].ref.update({
              subscriptionEndsAt: new Date(subscription.current_period_end * 1000).toISOString(),
            });
            console.log("Subscription renewed for: " + customerId);
          }
        } catch(e) {
          console.warn("Could not update renewal period:", e.message);
        }
      }
    }

    if (event.type === "customer.subscription.deleted" ||
        event.type === "customer.subscription.paused") {
      const subscription = event.data.object;
      const customerId = subscription.customer;

      const snap = await db.collection("families")
        .where("stripeCustomerId", "==", customerId)
        .limit(1)
        .get();

      if (!snap.empty) {
        await snap.docs[0].ref.update({
          isPro: false,
          proTier: null,
          stripeSubscriptionId: null,
        });
        console.log("Family subscription cancelled/paused: " + customerId);
      }
    }

    // Handle failed payments - downgrade after grace period
    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object;
      const customerId = invoice.customer;
      // Only downgrade if this is a recurring payment (not first payment)
      if (invoice.billing_reason !== "subscription_create") {
        const snap = await db.collection("families")
          .where("stripeCustomerId", "==", customerId)
          .limit(1)
          .get();
        if (!snap.empty) {
          console.warn("Payment failed for customer: " + customerId);
          // Don't downgrade immediately - Stripe will retry. Log for monitoring.
        }
      }
    }

    res.json({ received: true });
  }
);

// ── Stripe checkout session creator ──────────────────────────
exports.createCheckoutSession = onRequest(
  { secrets: ["STRIPE_SECRET_KEY"], cors: true },
  async (req, res) => {
    if (req.method !== "POST") return res.status(405).send("Method not allowed");

    const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
    const { ownerUid, priceId, successUrl, cancelUrl } = req.body;

    if (!ownerUid || !priceId) {
      return res.status(400).json({ error: "Missing ownerUid or priceId" });
    }

    try {
      // Look up family email for Stripe customer pre-fill
      const familySnap = await db.collection("families").where("ownerUid", "==", ownerUid).limit(1).get();
      const familyEmail = familySnap.empty ? undefined : familySnap.docs[0].data().parentEmail;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        customer_creation: "always",
        customer_email: familyEmail,
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { ownerUid, priceId },
        success_url: successUrl || "https://choreheroes.app?subscribed=true",
        cancel_url: cancelUrl || "https://choreheroes.app?cancelled=true",
      });
      res.json({ url: session.url });
    } catch (err) {
      console.error("Checkout session error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

// ── Task done / bonus / penalty announcements ─────────────────
exports.onTaskDone = onDocumentUpdated("families/{familyId}/kids/{kidId}", async (event) => {
  const beforeKid = event.data.before.data() || {};
  const afterKid = event.data.after.data() || {};
  const familyId = event.params.familyId;

  const familyConfig = await getFamilyAnnouncementConfig(familyId);
  if (!familyConfig) return null;

  const beforeDue = buildTaskMap(beforeKid.due);
  const beforeAwaiting = buildTaskMap(beforeKid.awaiting);
  const beforeCompleted = buildTaskMap(beforeKid.completed);
  const afterAwaiting = buildTaskMap(afterKid.awaiting);
  const afterCompleted = buildTaskMap(afterKid.completed);
  const kidName = afterKid.name || beforeKid.name || "kiddo";

  // Task moved from due → awaiting (kid marked done, awaiting parent approval)
  for (const [taskId, afterTask] of afterAwaiting.entries()) {
    if (beforeAwaiting.has(taskId)) continue;
    if (!beforeDue.has(taskId)) continue;

    const message = "Heads up! " + kidName + " just finished " + afterTask.title + " and is sitting there patiently waiting for her task to be approved!";
    await announceToHA(familyConfig.webhookUrl, message);
  }

  // Task moved from awaiting → completed (parent approved)
  for (const [taskId, afterTask] of afterCompleted.entries()) {
    if (beforeCompleted.has(taskId)) continue;

    if (beforeAwaiting.has(taskId)) {
      const message = "Woohoo " + kidName + "! You just completed " + afterTask.title + " and bagged " + afterTask.points + " points! Keep that energy going!";
      await announceToHA(familyConfig.webhookUrl, message);
    }
  }

  // Bonus awarded
  const afterBonus = findNewAdjustment(beforeKid.bonusPenalty, afterKid.bonusPenalty, "bonus");
  if (afterBonus && afterBonus.value && afterBonus.value !== "+0 points") {
    const message = kidName + ", you legend! Someone thinks you deserve a bonus of " + afterBonus.value + " and honestly, I also think you do. Keep shining!";
    await announceToHA(familyConfig.webhookUrl, message);
  }

  // Penalty given
  const afterPenalty = findNewAdjustment(beforeKid.bonusPenalty, afterKid.bonusPenalty, "penalty");
  if (afterPenalty && afterPenalty.value && afterPenalty.value !== "-0 points") {
    const message = "Uh oh " + kidName + "... a penalty of " + afterPenalty.value + " just landed on your account. You nutty nutty nutty little munchichi! Do better next time OKAY!";
    await announceToHA(familyConfig.webhookUrl, message);
  }

  return null;
});

// Convert "5:30 PM" / "11:00 AM" to "05:30" / "11:00" (24hr HH:MM)
function to24hr(timeStr) {
  if (!timeStr) return null;
  // Already in HH:MM format
  if (/^\d{2}:\d{2}$/.test(timeStr)) return timeStr;
  // Parse "5:30 PM" or "11:00 AM"
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let h = parseInt(match[1], 10);
  const m = match[2];
  const period = match[3].toUpperCase();
  if (period === "AM" && h === 12) h = 0;
  if (period === "PM" && h !== 12) h += 12;
  return h.toString().padStart(2, "0") + ":" + m;
}

// ── Task reminders (every minute) ────────────────────────────
exports.taskReminders = onSchedule("every 1 minutes", async () => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const currentTime = hours + ":" + minutes;

  const snapshot = await db.collection("families").where("proTier", "==", "tier2").get();

  for (const doc of snapshot.docs) {
    const family = doc.data();
    const webhookUrl = family.haWebhookUrl;
    if (!webhookUrl) continue;

    const kidsSnap = await doc.ref.collection("kids").get();
    for (const kidDoc of kidsSnap.docs) {
      const kid = kidDoc.data() || {};
      const dueTasks = Array.isArray(kid.due) ? kid.due : [];
      for (const task of dueTasks) {
        if (task && to24hr(task.time) === currentTime) {
          const message = "Hey " + (kid.name || "kiddo") + "! Just a nudge — you really need to " + task.title + ". Knock it out and grab those " + task.points + " points!";
          await announceToHA(webhookUrl, message);
        }
      }
    }
  }

  return null;
});

// ── Error reporting ───────────────────────────────────────────
exports.logError = onRequest(
  { cors: true },
  async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).send("Method not allowed"); return; }

    const { message, source, stack, userAgent, familyId, timestamp } = req.body;
    if (!message) { res.status(400).json({ error: "Missing message" }); return; }

    const errorBody = [
      "<h2>ChoreHeroes App Error</h2>",
      "<p><strong>Time:</strong> " + (timestamp || new Date().toISOString()) + "</p>",
      "<p><strong>Message:</strong> " + (message || "unknown") + "</p>",
      "<p><strong>Source:</strong> " + (source || "unknown") + "</p>",
      "<p><strong>Family:</strong> " + (familyId || "not logged in") + "</p>",
      "<p><strong>Browser:</strong> " + (userAgent || "unknown") + "</p>",
      "<pre style=\"background:#f5f5f5;padding:12px;border-radius:4px;font-size:12px;\">" + (stack || "no stack trace") + "</pre>",
    ].join("\n");

    try {
      await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": "Bearer re_YX49WM2k_2k9buzfhoFc31fa4JJ6XQTC6",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: "errors@choreheroes.app",
          to: "heilleys@gmail.com",
          subject: "🚨 ChoreHeroes Error: " + (message || "unknown").substring(0, 80),
          html: errorBody,
        }),
      });
      console.log("Error report sent:", message?.substring(0, 100));
      res.json({ ok: true });
    } catch(err) {
      console.error("Failed to send error report:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

exports.createPortalSession = require("./createPortalSession").createPortalSession;
