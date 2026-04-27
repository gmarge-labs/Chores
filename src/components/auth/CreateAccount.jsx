import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { doc, setDoc, collection } from "firebase/firestore";
import { auth, db } from "../../firebase/config";
import { useAuth } from "../../context/AuthContext";
import { useFamily } from "../../context/FamilyContext";
import RainbowTitle from "../shared/RainbowTitle";
import Button from "../shared/Button";
import "./CreateAccount.css";

const WEAK_PINS = ["0000","1111","2222","3333","4444","5555","6666","7777","8888","9999",
  "1234","4321","1212","0101","1122","1100","0011","2580","0852","1357","7531"];

function generateId(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2,10)}-${Math.random().toString(36).slice(2,10)}`;
}

function hashPin(pin) {
  // Simple consistent hash matching existing app
  let h = 0;
  for (let i = 0; i < pin.length; i++) {
    h = (Math.imul(31, h) + pin.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(16).padStart(8, "0");
}

const STEPS = ["familyName","parentName","parentEmail","parentPin","confirmPin","kids"];

export default function CreateAccount() {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const { loadFamily } = useFamily();

  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState({
    familyName: "", parentName: "", parentEmail: "",
    parentPin: "", confirmPin: "",
    kids: [{ name: "", pin: "" }]
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [touched, setTouched] = useState(false);

  const set = (field, val) => {
    setDraft(d => ({ ...d, [field]: val }));
    setError("");
    setTouched(false);
  };

  const setKid = (i, field, val) => {
    setDraft(d => {
      const kids = [...d.kids];
      kids[i] = { ...kids[i], [field]: val };
      return { ...d, kids };
    });
    setError("");
    setTouched(false);
  };

  const validate = () => {
    if (step === 0) {
      if (!draft.familyName.trim()) return "Please enter your family name.";
    }
    if (step === 1) {
      if (!draft.parentName.trim()) return "Please enter your name.";
    }
    if (step === 2) {
      if (!draft.parentEmail.trim()) return "Please enter your email.";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(draft.parentEmail)) return "Please enter a valid email.";
    }
    if (step === 3) {
      if (!draft.parentPin.trim()) return "Please enter a PIN.";
      if (!/^\d{4,8}$/.test(draft.parentPin)) return "PIN must be 4–8 digits.";
      if (WEAK_PINS.includes(draft.parentPin)) return "That PIN is too easy to guess. Try something less predictable.";
    }
    if (step === 4) {
      if (!draft.confirmPin.trim()) return "Please confirm your PIN.";
      if (draft.confirmPin !== draft.parentPin) return "PINs don't match. Please try again.";
    }
    if (step === 5) {
      const filled = draft.kids.filter(k => k.name.trim());
      if (filled.length === 0) return "Please add at least one child.";
      for (const k of filled) {
        if (!k.pin || !/^\d{4}$/.test(k.pin)) return `${k.name || "Each child"} needs a 4-digit PIN.`;
      }
    }
    return "";
  };

  const next = () => {
    setTouched(true);
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setTouched(false);
    if (step < STEPS.length - 1) setStep(s => s + 1);
    else handleSubmit();
  };

  const handleSubmit = async () => {
    setLoading(true);
    try {
      const familyId = generateId("family");
      const email = draft.parentEmail.toLowerCase().trim();

      // Create Firebase auth user
      const cred = await createUserWithEmailAndPassword(
        auth,
        email,
        `choreheroes::${email}::${draft.parentPin}`
      );

      // Create family doc
      const kidDocs = draft.kids.filter(k => k.name.trim()).map(k => ({
        id: generateId("kid"),
        name: k.name.trim(),
        kidPin: k.pin,
        points: 0,
        pointsPerDollarReward: 20,
        dollarRewardValue: 1,
        celebrationThreshold: 100,
        lastCelebratedThreshold: 0,
        due: [], awaiting: [], completed: [],
        taskTemplates: [], rewards: [],
        bonusPenalty: [], missedDaysInARow: 0,
      }));

      await setDoc(doc(db, "families", familyId), {
        id: familyId,
        familyName: draft.familyName.trim(),
        parentName: draft.parentName.trim(),
        parentEmail: email,
        parentEmailLower: email,
        parentPin: draft.parentPin,
        isPro: false,
        proTier: null,
        trialStartDate: new Date().toISOString(),
        kidIds: kidDocs.map(k => k.id),
        createdAt: new Date().toISOString(),
      });

      // Create kid docs
      for (const kid of kidDocs) {
        await setDoc(doc(db, "families", familyId, "kids", kid.id), kid);
      }

      // Load family into context and set session
      await loadFamily(familyId);
      setSession({ role: "parent", familyId });
      navigate("/family");
    } catch (e) {
      if (e.code === "auth/email-already-in-use") {
        setError("An account with this email already exists. Please log in instead.");
      } else if (e.code === "auth/weak-password") {
        setError("That PIN is too weak. Please choose a stronger one.");
      } else if (e.code === "auth/invalid-email") {
        setError("That email address looks invalid.");
      } else if (e.code === "auth/network-request-failed") {
        setError("Network error. Please check your connection and try again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
      setTouched(true);
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const stepTitles = [
    "What's your family name?",
    "What's your name?",
    "Your email address",
    "Create a parent PIN",
    "Confirm your PIN",
    "Add your children",
  ];

  const stepHints = [
    "e.g. The Smiths",
    "Your first name is fine",
    "Used to log in",
    "4–8 digits, not too obvious",
    "Type your PIN again",
    "You can add more later in settings",
  ];

  return (
    <div className="create-page">
      <div className="create-content">
        <RainbowTitle subtitle="Create account" size="sm" />

        {/* Progress dots */}
        <div className="create-progress">
          {STEPS.map((_, i) => (
            <div key={i} className={`progress-dot ${i <= step ? "progress-dot--active" : ""}`} />
          ))}
        </div>

        <div className="glass-card create-card">
          <h2 className="create-step-title">{stepTitles[step]}</h2>
          <p className="create-step-hint">{stepHints[step]}</p>

          {step < 5 && (
            <div className="create-field">
              {step === 3 || step === 4 ? (
                <input
                  className={`ch-input ${touched && error ? "error" : ""}`}
                  type="password"
                  inputMode="numeric"
                  placeholder={step === 3 ? "Enter PIN" : "Confirm PIN"}
                  value={step === 3 ? draft.parentPin : draft.confirmPin}
                  onChange={e => set(step === 3 ? "parentPin" : "confirmPin", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && next()}
                  autoFocus
                />
              ) : step === 2 ? (
                <input
                  className={`ch-input ${touched && error ? "error" : ""}`}
                  type="email"
                  placeholder="email@example.com"
                  value={draft.parentEmail}
                  onChange={e => set("parentEmail", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && next()}
                  autoFocus
                />
              ) : (
                <input
                  className={`ch-input ${touched && error ? "error" : ""}`}
                  type="text"
                  placeholder={step === 0 ? "e.g. The Smiths" : "Your first name"}
                  value={step === 0 ? draft.familyName : draft.parentName}
                  onChange={e => set(step === 0 ? "familyName" : "parentName", e.target.value)}
                  onKeyDown={e => e.key === "Enter" && next()}
                  autoFocus
                />
              )}
            </div>
          )}

          {step === 5 && (
            <div className="kids-list">
              {draft.kids.map((kid, i) => (
                <div key={i} className="kid-row">
                  <input
                    className="ch-input"
                    type="text"
                    placeholder={`Child ${i + 1} name`}
                    value={kid.name}
                    onChange={e => setKid(i, "name", e.target.value)}
                  />
                  <input
                    className="ch-input"
                    type="password"
                    inputMode="numeric"
                    placeholder="4-digit PIN"
                    maxLength={4}
                    value={kid.pin}
                    onChange={e => setKid(i, "pin", e.target.value)}
                  />
                </div>
              ))}
              {draft.kids.length < 8 && (
                <button
                  className="add-child-btn"
                  onClick={() => setDraft(d => ({ ...d, kids: [...d.kids, { name: "", pin: "" }] }))}
                >
                  + Add another child
                </button>
              )}
            </div>
          )}

          {/* Error only shows after user clicks Next */}
          {touched && error && <p className="ch-error">{error}</p>}

          <div className="create-actions">
            <Button
              variant="primary"
              size="lg"
              fullWidth
              onClick={next}
              loading={loading}
            >
              {step === 5 ? "Create account" : "Next →"}
            </Button>

            {step > 0 && (
              <Button variant="ghost" size="md" fullWidth onClick={() => { setStep(s => s - 1); setError(""); setTouched(false); }}>
                ← Back
              </Button>
            )}

            {step === 0 && (
              <Button variant="ghost" size="md" fullWidth onClick={() => navigate("/login")}>
                Already have an account? Log in
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
