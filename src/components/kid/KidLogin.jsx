import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import Background from "../shared/Background";
import RainbowTitle from "../shared/RainbowTitle";
import "./KidLogin.css";

const MOCK_KIDS = [
  { id: "k1", name: "Simra",  accentColour: "#f07a45", accentLight: "#ff9d57", pin: "1234" },
  { id: "k2", name: "Rayyan", accentColour: "#3f84db", accentLight: "#8fc4ff", pin: "5678" },
  { id: "k3", name: "Jinan",  accentColour: "#2f9f8f", accentLight: "#4fc7b5", pin: "9012" },
];

export default function KidLogin() {
  const navigate = useNavigate();
  const { setSession } = useAuth();
  const [selectedKid, setSelectedKid] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [shake, setShake] = useState(false);

  const handleKidSelect = (kid) => {
    setSelectedKid(kid);
    setPin("");
    setError("");
  };

  const handlePinInput = (digit) => {
    if (pin.length >= 4) return;
    const newPin = pin + digit;
    setPin(newPin);
    if (newPin.length === 4) {
      setTimeout(() => {
        if (newPin === selectedKid.pin) {
          setSession({ role: "kid", kidId: selectedKid.id });
          navigate("/kid");
        } else {
          setShake(true);
          setError("Wrong PIN, try again!");
          setTimeout(() => { setPin(""); setShake(false); setError(""); }, 1200);
        }
      }, 200);
    }
  };

  const handleBackspace = () => setPin(p => p.slice(0, -1));

  return (
    <div className="kid-login-page">
      <Background />

      <div className="kid-login-header">
        <RainbowTitle size="md" />
      </div>

      {!selectedKid ? (
        /* Step 1 — pick your avatar */
        <div className="kid-login-content">
          <p className="kid-login-prompt">Who are you?</p>
          <div className="kid-avatar-grid">
            {MOCK_KIDS.map(kid => (
              <button
                key={kid.id}
                className="kid-avatar-tile"
                style={{ '--accent': kid.accentColour, '--accent-light': kid.accentLight }}
                onClick={() => handleKidSelect(kid)}
              >
                <span className="tile-bubbles" aria-hidden="true">
                  <span/><span/><span/><span/><span/>
                </span>
                <div className="kid-avatar-circle">
                  <span className="avatar-shimmer" aria-hidden="true"/>
                  <span className="avatar-letter">{kid.name[0]}</span>
                </div>
                <h2 className="kid-avatar-name">{kid.name}</h2>
              </button>
            ))}
          </div>
        </div>
      ) : (
        /* Step 2 — enter PIN */
        <div className="kid-login-content">
          <div
            className="kid-pin-card"
            style={{ '--accent': selectedKid.accentColour, '--accent-light': selectedKid.accentLight }}
          >
            <span className="tile-bubbles" aria-hidden="true">
              <span/><span/><span/><span/><span/>
            </span>

            <div className="kid-pin-left">
              <div className="kid-pin-avatar">
                <span className="avatar-shimmer" aria-hidden="true"/>
                <span className="avatar-letter">{selectedKid.name[0]}</span>
              </div>
              <h2 className="kid-pin-name">{selectedKid.name}</h2>
            </div>
            <p className="kid-pin-prompt">Enter your PIN</p>

            {/* PIN dots */}
            <div className={`pin-dots${shake ? " shake" : ""}`}>
              {[0,1,2,3].map(i => (
                <span key={i} className={`pin-dot${i < pin.length ? " filled" : ""}`}/>
              ))}
            </div>

            {error && <p className="pin-error">{error}</p>}

            {/* Number pad */}
            <div className="pin-pad">
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button key={n} className="pin-btn" onClick={() => handlePinInput(String(n))}>{n}</button>
              ))}
              <button className="pin-btn pin-btn--back" onClick={() => handleKidSelect(null)}>←</button>
              <button className="pin-btn" onClick={() => handlePinInput("0")}>0</button>
              <button className="pin-btn pin-btn--del" onClick={handleBackspace}>⌫</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
