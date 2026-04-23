import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword } from "firebase/auth";
import { collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";
import { useFamily } from "../../context/FamilyContext";
import RainbowTitle from "../shared/RainbowTitle";
import Button from "../shared/Button";
import "./Login.css";

export default function Login() {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const { loadFamily } = useFamily();

  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const validate = () => {
    if (!email.trim()) return "Please enter your email.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Please enter a valid email.";
    if (!pin.trim()) return "Please enter your PIN.";
    return "";
  };

  const handleLogin = async () => {
    setTouched(true);
    const err = validate();
    if (err) { setError(err); return; }

    setLoading(true);
    setError("");

    try {
      const emailLower = email.toLowerCase().trim();
      const password = `choreheroes::${emailLower}::${pin}`;
      const cred = await signInWithEmailAndPassword(auth, emailLower, password);

      // Find family by email
      const q = query(
        collection(db, "families"),
        where("parentEmailLower", "==", emailLower)
      );
      const snap = await getDocs(q);
      if (snap.empty) throw new Error("Family not found.");

      const familyId = snap.docs[0].id;
      await loadFamily(familyId);
      setSession({ role: "parent", familyId });
      navigate("/family");
    } catch (e) {
      if (e.code === "auth/invalid-credential" || e.code === "auth/wrong-password") {
        setError("Incorrect email or PIN. Please try again.");
      } else if (e.code === "auth/user-not-found") {
        setError("No account found with that email.");
      } else if (e.code === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.");
      } else {
        setError(e.message || "Something went wrong.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-content">
        <RainbowTitle subtitle="Welcome back" size="sm" />

        <div className="glass-card login-card">
          <h2 className="login-title">Parent login</h2>

          <div className="login-fields">
            <input
              className={`ch-input ${touched && !email.trim() ? "error" : ""}`}
              type="email"
              placeholder="Email address"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(""); setTouched(false); }}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              autoFocus
            />
            <input
              className={`ch-input ${touched && !pin.trim() ? "error" : ""}`}
              type="password"
              inputMode="numeric"
              placeholder="Parent PIN"
              value={pin}
              onChange={e => { setPin(e.target.value); setError(""); setTouched(false); }}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
            />
          </div>

          {touched && error && <p className="ch-error">{error}</p>}

          <div className="login-actions">
            <Button
              variant="success"
              size="lg"
              fullWidth
              onClick={handleLogin}
              loading={loading}
            >
              Log in
            </Button>
            <Button variant="ghost" size="md" fullWidth onClick={() => navigate("/")}>
              ← Back
            </Button>
            <Button variant="ghost" size="md" fullWidth onClick={() => navigate("/create")}>
              New here? Create account
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
