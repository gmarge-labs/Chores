const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const Stripe = require("stripe");

exports.createPortalSession = onRequest(
  { secrets: ["STRIPE_SECRET_KEY"], cors: true },
  async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST") { res.status(405).send("Method not allowed"); return; }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2023-10-16" });
    const { ownerUid, returnUrl } = req.body;

    if (!ownerUid) {
      res.status(400).json({ error: "Missing ownerUid" });
      return;
    }

    try {
      const snap = await admin.firestore()
        .collection("families")
        .where("ownerUid", "==", ownerUid)
        .limit(1)
        .get();

      if (snap.empty) {
        res.status(404).json({ error: "Family not found" });
        return;
      }

      const family = snap.docs[0].data();

      if (!family.stripeCustomerId) {
        res.status(400).json({ error: "No billing account found for this family" });
        return;
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: family.stripeCustomerId,
        return_url: returnUrl || "https://choreheroes.app",
      });

      res.json({ url: session.url });
    } catch (err) {
      console.error("Portal session error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);
