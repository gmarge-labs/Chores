const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const fetch = require("node-fetch");

admin.initializeApp();
const db = admin.firestore();

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const TIER1_PRICE_ID = "price_1TNmlH2NkhDmsnu9Bi89HjTg";
const TIER2_PRICE_ID = "price_1TNmqb2NkhDmsnu9TgCMw25u";

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
      .filter((task) => task && task.id)
      .map((task) => [task.id, task])
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
        });
        console.log("Family upgraded to " + tier + ": " + ownerUid);
      }
    }

    if (event.type === "customer.subscription.deleted") {
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
        console.log("Family subscription cancelled: " + customerId);
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
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        line_items: [{ price: priceId, quantity: 1 }],
        metadata: { ownerUid, priceId },
        success_url: successUrl || "https://gmarge-labs.github.io/Chores?subscribed=true",
        cancel_url: cancelUrl || "https://gmarge-labs.github.io/Chores?cancelled=true",
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

  for (const [taskId, afterTask] of afterAwaiting.entries()) {
    if (beforeAwaiting.has(taskId)) continue;
    if (!beforeDue.has(taskId)) continue;

    const message = "Heads up! " + kidName + " just finished " + afterTask.title + " and is sitting there patiently waiting for her task to be approved!";
    await announceToHA(familyConfig.webhookUrl, message);
  }

  for (const [taskId, afterTask] of afterCompleted.entries()) {
    if (beforeCompleted.has(taskId)) continue;

    if (beforeAwaiting.has(taskId)) {
      const message = "Woohoo " + kidName + "! You just " + afterTask.title + " and bagged " + afterTask.points + " points! Keep that energy going!";
      await announceToHA(familyConfig.webhookUrl, message);
    }
  }

  const afterBonus = findNewAdjustment(beforeKid.bonusPenalty, afterKid.bonusPenalty, "bonus");
  if (afterBonus && afterBonus.value && afterBonus.value !== "+0 points") {
    const message = kidName + ", you legend! Someone thinks you deserve a bonus of " + afterBonus.value + " and honestly, I also think you do. Keep shining!";
    await announceToHA(familyConfig.webhookUrl, message);
  }

  const afterPenalty = findNewAdjustment(beforeKid.bonusPenalty, afterKid.bonusPenalty, "penalty");
  if (afterPenalty && afterPenalty.value && afterPenalty.value !== "-0 points") {
    const message = "Uh oh " + kidName + "... a penalty of " + afterPenalty.value + " just landed on your account. You nutty nutty nutty little munchichi! Do better next time OKAY!";
    await announceToHA(familyConfig.webhookUrl, message);
  }

  return null;
});

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
        if (task && task.time === currentTime) {
          const message = "Hey " + (kid.name || "kiddo") + "! Just a nudge — you really need to " + task.title + ". Knock it out and grab those " + task.points + " points!";
          await announceToHA(webhookUrl, message);
        }
      }
    }
  }

  return null;
});
exports.createPortalSession = require("./createPortalSession").createPortalSession;
