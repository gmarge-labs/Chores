import { useState } from "react";
import "./SettingsPanel.css";

const ACCENT_COLORS = [
  { name: "Orange", light: "#ff9d57", deep: "#f07a45" },
  { name: "Blue",   light: "#8fc4ff", deep: "#3f84db" },
  { name: "Teal",   light: "#4fc7b5", deep: "#2f9f8f" },
  { name: "Purple", light: "#b99cff", deep: "#7e60df" },
  { name: "Pink",   light: "#ff8db7", deep: "#c22f7e" },
  { name: "Yellow", light: "#ffd97a", deep: "#e6a800" },
];

export default function SettingsPanel({ kid, accent, onUpdate }) {
  const [name, setName] = useState(kid.name);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pointsPerDollar, setPointsPerDollar] = useState(kid.pointsPerDollarReward || 20);
  const [dollarValue, setDollarValue] = useState(kid.dollarRewardValue || 1);
  const [saved, setSaved] = useState(false);
  const [pinError, setPinError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSave = () => {
    if (pin && pin.length !== 4) { setPinError("PIN must be exactly 4 digits"); return; }
    if (pin && pin !== confirmPin) { setPinError("PINs don't match"); return; }
    setPinError("");
    onUpdate({ name: name.trim() || kid.name, pointsPerDollarReward: pointsPerDollar, dollarRewardValue: dollarValue });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="settings-panel">

      {/* Kid identity */}
      <section className="settings-section">
        <h3 className="settings-section-title">👤 Profile</h3>
        <div className="settings-field">
          <label className="settings-label">Name</label>
          <input
            className="settings-input"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={30}
            placeholder={kid.name}
          />
        </div>

        {/* Accent colour */}
        <div className="settings-field">
          <label className="settings-label">Theme colour</label>
          <div className="settings-colour-row">
            {ACCENT_COLORS.map(c => (
              <button
                key={c.name}
                className={`settings-colour-swatch${c.deep === kid.accentColour ? " active" : ""}`}
                style={{ background: `linear-gradient(145deg, ${c.light}, ${c.deep})` }}
                onClick={() => onUpdate({ accentColour: c.deep })}
                title={c.name}
              />
            ))}
          </div>
        </div>
      </section>

      {/* PIN */}
      <section className="settings-section">
        <h3 className="settings-section-title">🔒 Change PIN</h3>
        <div className="settings-field">
          <label className="settings-label">New PIN</label>
          <input
            className="settings-input"
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="4 digits"
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/,'')); setPinError(""); }}
          />
        </div>
        <div className="settings-field">
          <label className="settings-label">Confirm PIN</label>
          <input
            className="settings-input"
            type="password"
            inputMode="numeric"
            maxLength={4}
            placeholder="Repeat PIN"
            value={confirmPin}
            onChange={e => { setConfirmPin(e.target.value.replace(/\D/,'')); setPinError(""); }}
          />
        </div>
        {pinError && <p className="settings-error">{pinError}</p>}
      </section>

      {/* Rewards */}
      <section className="settings-section">
        <h3 className="settings-section-title">💰 Rewards</h3>
        <div className="settings-field">
          <label className="settings-label">Points per $1</label>
          <div className="settings-pill-row">
            {[10,15,20,25,30,50,100].map(v => (
              <button
                key={v}
                className={`settings-pill-btn${pointsPerDollar === v ? " active" : ""}`}
                onClick={() => setPointsPerDollar(v)}
              >{v}</button>
            ))}
          </div>
        </div>
        <div className="settings-field">
          <label className="settings-label">Dollar reward value</label>
          <div className="settings-pill-row">
            {[1,2,5,10].map(v => (
              <button
                key={v}
                className={`settings-pill-btn${dollarValue === v ? " active" : ""}`}
                onClick={() => setDollarValue(v)}
              >${v}</button>
            ))}
          </div>
        </div>
      </section>

      {/* Save */}
      <div className="settings-actions">
        <button className="settings-save-btn" onClick={handleSave}>
          {saved ? "✓ Saved!" : "Save changes"}
        </button>
      </div>

      {/* Danger zone */}
      <section className="settings-section settings-section--danger">
        <h3 className="settings-section-title">⚠️ Danger zone</h3>
        {!showDeleteConfirm ? (
          <button className="settings-delete-btn" onClick={() => setShowDeleteConfirm(true)}>
            Remove {kid.name} from family
          </button>
        ) : (
          <div className="settings-confirm-row">
            <p className="settings-confirm-text">Are you sure? This cannot be undone.</p>
            <div className="settings-confirm-btns">
              <button className="settings-confirm-yes" onClick={() => alert("Delete not wired to Firestore yet")}>Yes, remove</button>
              <button className="settings-confirm-no" onClick={() => setShowDeleteConfirm(false)}>Cancel</button>
            </div>
          </div>
        )}
      </section>

    </div>
  );
}
