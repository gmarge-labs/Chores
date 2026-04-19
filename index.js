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
exports.onTaskDone = onDocumentUpdated("families/{familyId}", async (event) => {
  const before = event.data.before.data();
  const after = event.data.after.data();
  const webhookUrl = after.haWebhookUrl;
  if (!webhookUrl) return null;
  if (after.proTier !== "tier2") return null;

  const beforeKids = before.kids || [];
  const afterKids = after.kids || [];

  for (const afterKid of afterKids) {
    const beforeKid = beforeKids.find((k) => k.id === afterKid.id);
    if (!beforeKid) continue;

    const beforeInstances = beforeKid.taskInstances || [];
    const afterInstances = afterKid.taskInstances || [];

    for (const afterTask of afterInstances) {
      const beforeTask = beforeInstances.find((t) => t.id === afterTask.id);
      if (!beforeTask) continue;

      if (beforeTask.status !== "done" && afterTask.status === "done") {
        const message = "Woohoo " + afterKid.name + "! You just " + afterTask.title + " and bagged " + afterTask.points + " points! Keep that energy going!";
        await announceToHA(webhookUrl, message);
      }

      if (beforeTask.status === "due" && afterTask.status === "pending") {
        const message = "Heads up! " + afterKid.name + " just finished " + afterTask.title + " and is sitting there patiently waiting for her task to be approved!";
        await announceToHA(webhookUrl, message);
      }
    }

    const beforeBonus = (beforeKid.adjustments || []).find((a) => a.type === "bonus");
    const afterBonus = (afterKid.adjustments || []).find((a) => a.type === "bonus");
    if (afterBonus && beforeBonus &&
        afterBonus.createdAt !== beforeBonus.createdAt &&
        afterBonus.value && afterBonus.value !== "+0 points") {
      const message = afterKid.name + ", you legend! Someone thinks you deserve a bonus of " + afterBonus.value + " and honestly, I also think you do. Keep shining!";
      await announceToHA(webhookUrl, message);
    }

    const beforePenalty = (beforeKid.adjustments || []).find((a) => a.type === "penalty");
    const afterPenalty = (afterKid.adjustments || []).find((a) => a.type === "penalty");
    if (afterPenalty && beforePenalty &&
        afterPenalty.createdAt !== beforePenalty.createdAt &&
        afterPenalty.value && afterPenalty.value !== "-0 points") {
      const message = "Uh oh " + afterKid.name + "... a penalty of " + afterPenalty.value + " just landed on your account. You nutty nutty nutty little munchichi! Do better next time OKAY!";
      await announceToHA(webhookUrl, message);
    }
  }

  return null;
});

// ── Task reminders (every minute) ────────────────────────────
exports.taskReminders = onSchedule("every 1 minutes", async () => {
  const now = new Date();
  const hours = now.getHours().toString().padStart(2, "0");
  const minutes = now.getMinutes().toString().padStart(2, "0");
  const currentTime = hours + ":" + minutes;

  const snapshot = await db.collection("families").get();

  for (const doc of snapshot.docs) {
    const family = doc.data();
    const webhookUrl = family.haWebhookUrl;
    if (!webhookUrl) continue;
    if (family.proTier !== "tier2") continue;

    const kids = family.kids || [];
    for (const kid of kids) {
      const instances = kid.taskInstances || [];
      for (const task of instances) {
        if (task.status === "due" && task.time === currentTime) {
          const message = "Hey " + kid.name + "! Just a nudge — you really need to " + task.title + ". Knock it out and grab those " + task.points + " points!";
          await announceToHA(webhookUrl, message);
        }
      }
    }
  }

  return null;
});
exports.createPortalSession = require("./createPortalSession").createPortalSession;
