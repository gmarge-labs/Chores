const functions = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Stripe = require("stripe");

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");

exports.cancelSubscription = functions.onRequest(
  { secrets: [STRIPE_SECRET_KEY] },
  async (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.set("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }

    const { ownerUid } = req.body;
    if (!ownerUid) {
      res.status(400).json({ error: "Missing ownerUid" });
      return;
    }

    const stripe = new Stripe(STRIPE_SECRET_KEY.value(), { apiVersion: "2023-10-16" });

    const snap = await admin.firestore()
      .collection("families")
      .where("ownerUid", "==", ownerUid)
      .limit(1)
      .get();

    if (snap.empty) {
      res.status(404).json({ error: "Family not found" });
      return;
    }

    const familyData = snap.docs[0].data();
    const stripeSubscriptionId = familyData.stripeSubscriptionId;

    if (stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(stripeSubscriptionId);
      } catch(e) {
        console.warn("Stripe cancellation failed:", e.message);
      }
    }

    // Mark as cancelled in Firestore
    await snap.docs[0].ref.update({ isPro: false, proTier: null, stripeSubscriptionId: null });

    res.json({ ok: true });
  }
);
