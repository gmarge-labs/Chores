import React, { useState } from "react";
import "./SettingsModal.css";

const ACCENT_COLORS = [
  { name: "Orange", light: "#ff9d57", deep: "#f07a45" },
  { name: "Blue",   light: "#8fc4ff", deep: "#3f84db" },
  { name: "Teal",   light: "#4fc7b5", deep: "#2f9f8f" },
  { name: "Purple", light: "#b99cff", deep: "#7e60df" },
  { name: "Pink",   light: "#ff8db7", deep: "#c22f7e" },
  { name: "Yellow", light: "#ffd97a", deep: "#e6a800" },
];

const HERO_LEVELS = [
  { key: "rookie",   emoji: "🌱", name: "Rookie Hero",    color: "rgba(160,200,120,0.25)", border: "rgba(160,200,120,0.5)" },
  { key: "rising",   emoji: "⚡", name: "Rising Hero",   color: "rgba(240,192,64,0.25)",  border: "rgba(240,192,64,0.5)" },
  { key: "champion", emoji: "🔥", name: "Champion Hero", color: "rgba(240,122,69,0.25)",  border: "rgba(240,122,69,0.5)" },
  { key: "legend",   emoji: "💫", name: "Legend Hero",   color: "rgba(126,96,223,0.25)",  border: "rgba(126,96,223,0.5)" },
  { key: "ultimate", emoji: "👑", name: "Ultimate Hero", color: "rgba(230,168,0,0.25)",   border: "rgba(230,168,0,0.5)" },
];

const MOCK_KIDS = [
  { id: "k1", name: "Simra",  accentColour: "#f07a45" },
  { id: "k2", name: "Rayyan", accentColour: "#3f84db" },
  { id: "k3", name: "Jinan",  accentColour: "#2f9f8f" },
];

const TABS = [
  { id: "profile",  emoji: "✏️", label: "Edit Profile" },
  { id: "bonus",    emoji: "🎁", label: "Bonus Points" },
  { id: "rewards",  emoji: "🛍️", label: "Rewards Store" },
  { id: "journey",  emoji: "🏆", label: "Hero Journey" },
  { id: "family",   emoji: "👨‍👩‍👧", label: "Family" },
];

export default function SettingsModal({ onClose }) {
  const [activeTab, setActiveTab] = useState("profile");
  const [kids, setKids] = useState(MOCK_KIDS);
  const [saved, setSaved] = useState(false);

  // Edit Profile
  const [selectedKidId, setSelectedKidId] = useState(MOCK_KIDS[0].id);
  const [kidColour, setKidColour] = useState(MOCK_KIDS[0].accentColour);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [pinError, setPinError] = useState("");

  // Bonus Points
  const [bonusKids, setBonusKids] = useState([]);
  const [bonusReason, setBonusReason] = useState("");
  const [bonusPoints, setBonusPoints] = useState("");
  const [notifyKids, setNotifyKids] = useState(true);
  const [bonusAdded, setBonusAdded] = useState(false);
  const [bonusLibrary, setBonusLibrary] = useState([]);
  const [showBonusLibrary, setShowBonusLibrary] = useState(false);

  // Rewards Store
  const [rewards, setRewards] = useState([
    { id: "r1", name: "Stay up late", points: 50 },
    { id: "r2", name: "Playdate", points: 100 },
    { id: "r3", name: "Screen time bonus", points: 30 },
  ]);
  const [newRewardName, setNewRewardName] = useState("");
  const [selectedRewardId, setSelectedRewardId] = useState(null);
  const [rewardLibrary, setRewardLibrary] = useState([]);
  const [saveRewardToLib, setSaveRewardToLib] = useState(true);
  const [editingReward, setEditingReward] = useState(null);
  const [newRewardPoints, setNewRewardPoints] = useState("");

  // Hero Journey
  const [heroThresholds, setHeroThresholds] = useState({ rookie: 0, rising: 100, champion: 250, legend: 500, ultimate: 1000 });

  // Family
  const [newKidName, setNewKidName] = useState("");
  const [newKidPin, setNewKidPin] = useState("");
  const [newKidColour, setNewKidColour] = useState("#f07a45");
  const [pointsPerDollar, setPointsPerDollar] = useState(20);
  const [dollarValue, setDollarValue] = useState(1);
  const [selectedDeleteKids, setSelectedDeleteKids] = useState([]);
  const [showDeleteFamily, setShowDeleteFamily] = useState(false);
  const [deleteFamilyConfirm, setDeleteFamilyConfirm] = useState("");

  const selectedKid = kids.find(k => k.id === selectedKidId);
  const accent = ACCENT_COLORS.find(c => c.deep === selectedKid?.accentColour) || ACCENT_COLORS[0];

  const handleSave = () => {
    if (pin && pin.length !== 4) { setPinError("PIN must be 4 digits"); return; }
    if (pin && pin !== confirmPin) { setPinError("PINs don't match"); return; }
    setPinError("");
    setPin(""); setConfirmPin("");
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <span className="settings-sparkle top-right" aria-hidden="true">✦</span>
        <span className="settings-sparkle top-left" aria-hidden="true">✦</span>

        <div className="settings-modal-header">
          <h2 className="settings-modal-title">Settings</h2>
          <button className="settings-modal-close" onClick={onClose}>✕</button>
        </div>

        {/* Tab bar */}
        <div className="settings-tab-bar">
          {TABS.map(t => (
            <button key={t.id}
              className={`settings-tab-btn${activeTab === t.id ? " active" : ""}`}
              onClick={() => setActiveTab(t.id)}>
              <span>{t.emoji}</span> {t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="settings-tab-content" key={activeTab}>

          {/* ── Edit Profile ── */}
          {activeTab === "profile" && (
            <div className="settings-profile-two-tiles">

              {/* Tile 1: Kid selector + Theme colour */}
              <div className="settings-section">
                <h3 className="settings-section-title">🎨 Theme Colour</h3>
                <div className="settings-field">
                  <label className="settings-label">Select kid</label>
                  <div className="settings-kid-chips">
                    {kids.map(k => {
                      const ac = ACCENT_COLORS.find(c => c.deep === k.accentColour) || ACCENT_COLORS[0];
                      const isSelected = selectedKidId === k.id;
                      const liveColour = isSelected ? kidColour : k.accentColour;
                      const liveAc = ACCENT_COLORS.find(c => c.deep === liveColour) || ac;
                      return (
                        <button key={k.id}
                          className={`settings-kid-chip-btn${isSelected ? " active" : ""}`}
                          style={{ "--tab-accent": liveAc.deep, "--tab-light": liveAc.light }}
                          onClick={() => { setSelectedKidId(k.id); setKidColour(k.accentColour); setPinError(""); }}>
                          <span className="settings-kid-chip-avatar"
                            style={{ background: `linear-gradient(145deg, ${liveAc.light}, ${liveAc.deep})`, transition: "background 0.3s" }}>
                            {k.name[0]}
                          </span>
                          {k.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-label">Pick colour</label>
                  <div className="settings-colour-swatches">
                    {ACCENT_COLORS.map(c => (
                      <button key={c.name}
                        className={`settings-colour-swatch-lg${kidColour === c.deep ? " active" : ""}`}
                        style={{ background: `linear-gradient(145deg, ${c.light}, ${c.deep})` }}
                        title={c.name}
                        onClick={() => setKidColour(c.deep)} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Tile 2: Change PIN */}
              <div className="settings-section">
                <h3 className="settings-section-title">🔒 Change PIN</h3>
                <div className="settings-field">
                  <label className="settings-label">Select kid</label>
                  <div className="settings-kid-chips">
                    {kids.map(k => {
                      const ac = ACCENT_COLORS.find(c => c.deep === k.accentColour) || ACCENT_COLORS[0];
                      const isSelected = selectedKidId === k.id;
                      const liveColour = isSelected ? kidColour : k.accentColour;
                      const liveAc = ACCENT_COLORS.find(c => c.deep === liveColour) || ac;
                      return (
                        <button key={k.id}
                          className={`settings-kid-chip-btn${isSelected ? " active" : ""}`}
                          style={{ "--tab-accent": liveAc.deep, "--tab-light": liveAc.light }}
                          onClick={() => { setSelectedKidId(k.id); setKidColour(k.accentColour); setPinError(""); }}>
                          <span className="settings-kid-chip-avatar"
                            style={{ background: `linear-gradient(145deg, ${liveAc.light}, ${liveAc.deep})`, transition: "background 0.3s" }}>
                            {k.name[0]}
                          </span>
                          {k.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-label">New PIN</label>
                  <div className="settings-pin-dots">
                    {[0,1,2,3].map(i => (
                      <span key={i} className={`settings-pin-dot${i < pin.length ? " filled" : ""}`}
                        style={{ "--dot-color": kidColour }} />
                    ))}
                    <input className="settings-pin-hidden" type="password" inputMode="numeric" maxLength={4}
                      value={pin} onChange={e => { setPin(e.target.value.replace(/\D/g,"")); setPinError(""); }} />
                  </div>
                </div>
                <div className="settings-field">
                  <label className="settings-label">Confirm PIN</label>
                  <div className="settings-pin-dots">
                    {[0,1,2,3].map(i => (
                      <span key={i} className={`settings-pin-dot${i < confirmPin.length ? " filled" : ""}`}
                        style={{ "--dot-color": kidColour }} />
                    ))}
                    <input className="settings-pin-hidden" type="password" inputMode="numeric" maxLength={4}
                      value={confirmPin} onChange={e => { setConfirmPin(e.target.value.replace(/\D/g,"")); setPinError(""); }} />
                  </div>
                </div>
                {pinError && <p className="settings-error">{pinError}</p>}
              </div>

            </div>
          )}

          {/* ── Bonus Points ── */}
          {activeTab === "bonus" && (
            <div className="settings-profile-two-tiles">

              {/* Left tile: Assign + Reason/Points */}
              <div className="settings-section">
                <h3 className="settings-section-title">🎁 Bonus Points</h3>
                <div className="settings-field">
                  <label className="settings-label">Assign to</label>
                  <div className="settings-bonus-kids">
                    {kids.map(k => {
                      const ac = ACCENT_COLORS.find(c => c.deep === k.accentColour) || ACCENT_COLORS[0];
                      const checked = bonusKids.includes(k.id);
                      return (
                        <label key={k.id}
                          className={`settings-bonus-kid-chip${checked ? " active" : ""}`}
                          style={{ "--tab-accent": ac.deep, "--tab-light": ac.light }}>
                          <span className={`settings-bonus-checkbox${checked ? " checked" : ""}`}
                            style={{ borderColor: checked ? ac.deep : undefined, background: checked ? ac.deep : undefined }}>
                            {checked && <span className="settings-bonus-check">✓</span>}
                          </span>
                          <span className="settings-kid-tab-avatar"
                            style={{ background: `linear-gradient(145deg, ${ac.light}, ${ac.deep})` }}>{k.name[0]}</span>
                          {k.name}
                          <input type="checkbox" style={{ display:"none" }} checked={checked}
                            onChange={() => setBonusKids(p => p.includes(k.id) ? p.filter(id => id !== k.id) : [...p, k.id])} />
                        </label>
                      );
                    })}
                  </div>
                </div>
                <div className="settings-reason-points-row">
                  <div className="settings-field" style={{ flex: 1 }}>
                    <label className="settings-label">Reason</label>
                    <input className="settings-input" type="text" placeholder="e.g. Good behaviour" maxLength={60}
                      value={bonusReason} onChange={e => setBonusReason(e.target.value)} />
                  </div>
                  <div className="settings-field" style={{ width: "80px", flexShrink: 0 }}>
                    <label className="settings-label">Pts</label>
                    <input className="settings-input" type="number" placeholder="000" min="1" max="999"
                      value={bonusPoints}
                      onChange={e => setBonusPoints(e.target.value.replace(/\D/g,"").slice(0,3))}
                      style={{ textAlign:"center" }} />
                  </div>
                </div>
              </div>

              {/* Right tile: Notify + Library + Add */}
              <div className="settings-section">
                <h3 className="settings-section-title">⚙️ Award Settings</h3>
                <div className="settings-field">
                  <label className="settings-label">Notify kids when rewarded</label>
                  <div className="settings-notify-toggle-row">
                    <button className={`settings-toggle-btn${notifyKids ? " on" : ""}`}
                      onClick={() => setNotifyKids(p => !p)}>
                      <span className="settings-toggle-knob" />
                    </button>
                    <span className="settings-toggle-label">{notifyKids ? "On — kids will be notified" : "Off — silent award"}</span>
                  </div>
                </div>

                <div className="settings-field">
                  <div className="settings-assign-header">
                    <label className="settings-label">Bonus library</label>
                    <button className="settings-lib-toggle-btn" onClick={() => setShowBonusLibrary(p => !p)}>
                      {showBonusLibrary ? "Hide" : "Show"} {bonusLibrary.length > 0 ? `(${bonusLibrary.length})` : ""}
                    </button>
                  </div>
                  {showBonusLibrary && bonusLibrary.length > 0 && (
                    <div className="settings-bonus-library">
                      {bonusLibrary.map((b, i) => (
                        <button key={i} className="settings-bonus-lib-item"
                          onClick={() => { setBonusReason(b.reason); setBonusPoints(String(b.points)); setShowBonusLibrary(false); }}>
                          <span className="settings-reward-name">{b.reason}</span>
                          <span className="settings-reward-pts">{b.points} pts</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {showBonusLibrary && bonusLibrary.length === 0 && (
                    <p className="settings-hero-desc">No saved bonuses yet — add one to build your library.</p>
                  )}
                  {!showBonusLibrary && bonusLibrary.length === 0 && (
                    <p className="settings-hero-desc">Your bonus library is empty. Added bonuses are saved here automatically.</p>
                  )}
                </div>

                <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "10px", alignItems: "center" }}>
                  {bonusAdded && <div className="settings-bonus-confirm">🎉 Bonus added successfully!</div>}
                  <button className="settings-modal-save"
                    style={{ "--tab-accent": "#f07a45", "--tab-light": "#ff9d57", padding: "10px 40px" }}
                    onClick={() => {
                      if (!bonusReason.trim() || !bonusPoints) return;
                      setBonusLibrary(prev => {
                        const updated = [{ reason: bonusReason.trim(), points: Number(bonusPoints) }, ...prev.filter(b => b.reason !== bonusReason.trim())];
                        return updated.slice(0, 30);
                      });
                      setBonusPoints(""); setBonusReason(""); setBonusKids([]);
                      setBonusAdded(true); setTimeout(() => setBonusAdded(false), 2000);
                    }}>
                    Add Bonus ✦
                  </button>
                </div>
              </div>

            </div>
          )}

                                                  {/* ── Rewards Store ── */}
          {activeTab === "rewards" && (
            <div className="settings-section settings-section--compact">
              <h3 className="settings-section-title">🛍️ Rewards Store</h3>

              {/* Name + Pts + Add all in one row */}
              <div className="settings-rewards-input-row">
                <div className="settings-field" style={{ flex: 1 }}>
                  <label className="settings-label">Reward name</label>
                  <input className="settings-input" type="text" placeholder="e.g. Stay up late"
                    maxLength={40} value={newRewardName} onChange={e => setNewRewardName(e.target.value)} />
                </div>
                <div className="settings-field" style={{ width: "74px", flexShrink: 0 }}>
                  <label className="settings-label">Pts</label>
                  <input className="settings-input" type="number" placeholder="000" min="1"
                    value={newRewardPoints}
                    onChange={e => setNewRewardPoints(e.target.value.replace(/\D/g,"").slice(0,3))}
                    style={{ textAlign:"center" }} />
                </div>
                <div className="settings-field" style={{ flexShrink: 0, alignSelf: "flex-end" }}>
                  <button className="settings-modal-save"
                    style={{ "--tab-accent": "#f07a45", "--tab-light": "#ff9d57", padding: "9px 20px", whiteSpace:"nowrap" }}
                    onClick={() => {
                      if (!newRewardName.trim() || !newRewardPoints) return;
                      const r = { id: "r"+Date.now(), name: newRewardName.trim(), points: Number(newRewardPoints) };
                      setRewards(prev => [...prev, r]);
                      if (saveRewardToLib) setRewardLibrary(prev => [r, ...prev].slice(0,30));
                      setNewRewardName(""); setNewRewardPoints("");
                    }}>Add ✦</button>
                </div>
              </div>

              {/* Save to library toggle — compact */}
              <div className="settings-rewards-toggle-row">
                <button className={`settings-toggle-btn${saveRewardToLib ? " on" : ""}`}
                  style={{ transform: "scale(0.85)", transformOrigin: "left center" }}
                  onClick={() => setSaveRewardToLib(p => !p)}>
                  <span className="settings-toggle-knob" />
                </button>
                <span className="settings-toggle-label" style={{ fontSize: "0.82rem" }}>
                  {saveRewardToLib ? "Save to library" : "Don't save"}
                </span>
              </div>

              <div className="settings-rewards-divider" />

              {/* Library — compact fixed height */}
              <div className="settings-field">
                <label className="settings-label">📚 Library {rewardLibrary.length > 0 ? `(${rewardLibrary.length})` : ""}</label>
                {rewardLibrary.length === 0 ? (
                  <div className="settings-rewards-empty-compact">
                    <span>🛍️ No saved rewards yet — add one above</span>
                  </div>
                ) : (
                  <div className="settings-rewards-lib-list settings-rewards-lib-list--compact">
                    {rewardLibrary.map(r => (
                      <div key={r.id}
                        className={`settings-rewards-lib-item${selectedRewardId === r.id ? " active" : ""}`}
                        onClick={() => { setSelectedRewardId(r.id === selectedRewardId ? null : r.id); setEditingReward(null); }}>
                        <span className="settings-reward-detail-name">{r.name}</span>
                        <span className="settings-reward-detail-pts">⭐ {r.points}</span>
                        <div className="settings-reward-lib-actions" onClick={e => e.stopPropagation()}>
                          <button className="settings-reward-edit-btn"
                            onClick={() => setEditingReward({ ...r })}>✏️</button>
                          <button className="settings-reward-del-btn"
                            onClick={() => { setRewardLibrary(prev => prev.filter(x => x.id !== r.id)); setSelectedRewardId(null); }}>
                            🗑️
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Inline edit — compact */}
              {editingReward && (
                <div className="settings-rewards-input-row">
                  <div className="settings-field" style={{ flex: 1 }}>
                    <label className="settings-label">Edit name</label>
                    <input className="settings-input" type="text" maxLength={40}
                      value={editingReward.name}
                      onChange={e => setEditingReward(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div className="settings-field" style={{ width: "74px", flexShrink: 0 }}>
                    <label className="settings-label">Pts</label>
                    <input className="settings-input" type="number" min="1"
                      value={editingReward.points}
                      onChange={e => setEditingReward(p => ({ ...p, points: Number(e.target.value) || 0 }))}
                      style={{ textAlign:"center" }} />
                  </div>
                  <div style={{ display:"flex", gap:"6px", alignSelf:"flex-end" }}>
                    <button className="settings-modal-save"
                      style={{ "--tab-accent": "#f07a45", "--tab-light": "#ff9d57", padding: "9px 16px" }}
                      onClick={() => {
                        setRewardLibrary(prev => prev.map(r => r.id === editingReward.id ? editingReward : r));
                        setEditingReward(null);
                      }}>Save</button>
                    <button className="settings-reward-del-btn"
                      style={{ background:"rgba(255,255,255,0.45)", color:"rgba(47,36,25,0.7)", borderColor:"rgba(47,36,25,0.15)", padding:"9px 12px" }}
                      onClick={() => setEditingReward(null)}>✕</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Hero Journey ── */}
          {activeTab === "journey" && (
            <div className="settings-section settings-section--hero">
              <h3 className="settings-section-title">🏆 Hero Journey</h3>
              <div className="settings-hero-levels-grid">
                {HERO_LEVELS.map((l, i) => (
                  <React.Fragment key={l.key}>
                    <div className="settings-hero-level-card" style={{ background: l.color, borderColor: l.border }}>
                      <span className="settings-hero-emoji-lg">{l.emoji}</span>
                      <span className="settings-hero-name-lg">{l.name}</span>
                      <div className="settings-hero-pts-row">
                        <input className="settings-hero-input-lg" type="number" min="0"
                          value={heroThresholds[l.key]}
                          onChange={e => setHeroThresholds(prev => ({ ...prev, [l.key]: Number(e.target.value) || 0 }))} />
                        <span className="settings-hero-pts">pts</span>
                      </div>
                    </div>
                    {i < HERO_LEVELS.length - 1 && (
                      <span className="settings-hero-arrow">→</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {/* ── Family ── */}
          {activeTab === "family" && (
            <>
              <div className="settings-profile-two-tiles">
                <div className="settings-section">
                  <h3 className="settings-section-title">💵 Dollar Rate</h3>
                  <p className="settings-hero-desc">Set how many points equal one dollar reward</p>
                  <div className="settings-field">
                    <label className="settings-label">Points = Dollars</label>
                    <div className="settings-rate-row">
                      <input className="settings-input" type="number" min="1" placeholder="Points"
                        value={pointsPerDollar} onChange={e => setPointsPerDollar(Number(e.target.value) || "")}
                        style={{ width: "100px", textAlign: "center" }} />
                      <span className="settings-rate-equals">=</span>
                      <span className="settings-rate-dollar">$</span>
                      <input className="settings-input" type="number" min="1" placeholder="Dollars"
                        value={dollarValue} onChange={e => setDollarValue(Number(e.target.value) || "")}
                        style={{ width: "100px", textAlign: "center" }} />
                    </div>
                  </div>
                </div>

                <div className="settings-section">
                  <h3 className="settings-section-title">➕ Add a Kid</h3>
                <div className="settings-add-kid-grid">
                  <div className="settings-field">
                    <label className="settings-label">Name</label>
                    <input className="settings-input" type="text" placeholder="Kid's name" maxLength={30}
                      value={newKidName} onChange={e => setNewKidName(e.target.value)} />
                  </div>
                  <div className="settings-field">
                    <label className="settings-label">PIN</label>
                    <input className="settings-input" type="password" inputMode="numeric" maxLength={4} placeholder="4 digits"
                      value={newKidPin} onChange={e => setNewKidPin(e.target.value.replace(/\D/g,""))} />
                  </div>
                  <div className="settings-field">
                    <label className="settings-label">Theme colour</label>
                    <div className="settings-colour-swatches">
                      {ACCENT_COLORS.map(c => (
                        <button key={c.name} className={`settings-colour-swatch-lg${newKidColour === c.deep ? " active" : ""}`}
                          style={{ background: `linear-gradient(145deg, ${c.light}, ${c.deep})` }}
                          onClick={() => setNewKidColour(c.deep)} />
                      ))}
                    </div>
                  </div>
                </div>
                  <div className="settings-add-kid-footer">
                    <button className="settings-modal-save"
                      style={{ "--tab-accent": "#f07a45", "--tab-light": "#ff9d57" }}
                      onClick={() => { setNewKidName(""); setNewKidPin(""); }}>
                      Add Kid ✦
                    </button>
                  </div>
                </div>
              </div>

              <div className="settings-section settings-section--danger">
                <h3 className="settings-section-title">⚠️ Delete Accounts</h3>
                <div className="settings-field">
                  <label className="settings-label">Select kids to delete</label>
                  <div className="settings-delete-kids-row">
                    {kids.map(k => {
                      const ac = ACCENT_COLORS.find(c => c.deep === k.accentColour) || ACCENT_COLORS[0];
                      return (
                        <label key={k.id} className="settings-delete-kid-chip">
                          <input type="checkbox" className="settings-delete-checkbox"
                            checked={selectedDeleteKids.includes(k.id)}
                            onChange={() => setSelectedDeleteKids(p => p.includes(k.id) ? p.filter(id => id !== k.id) : [...p, k.id])} />
                          <span className="settings-kid-tab-avatar" style={{ background: `linear-gradient(145deg, ${ac.light}, ${ac.deep})` }}>{k.name[0]}</span>
                          {k.name}
                        </label>
                      );
                    })}
                  </div>
                  <button className="settings-delete-btn" style={{ marginTop: "8px" }}
                    onClick={() => alert("Not wired to Firestore yet")}>
                    Delete selected kid(s)
                  </button>
                </div>
                <div className="settings-divider" />
                <div className="settings-field">
                  <label className="settings-label" style={{ color: "#cc3333" }}>Delete entire family account</label>
                  <p className="settings-hero-desc">This permanently deletes all data. Cannot be undone.</p>
                  {!showDeleteFamily ? (
                    <button className="settings-delete-btn" onClick={() => setShowDeleteFamily(true)}>
                      Delete entire family account
                    </button>
                  ) : (
                    <div className="settings-confirm-row">
                      <label className="settings-label">Type DELETE to confirm</label>
                      <input className="settings-input" type="text" placeholder="DELETE" style={{ width: "200px" }}
                        value={deleteFamilyConfirm} onChange={e => setDeleteFamilyConfirm(e.target.value)} />
                      <div className="settings-confirm-btns">
                        <button className="settings-confirm-yes"
                          disabled={deleteFamilyConfirm !== "DELETE"}
                          style={{ opacity: deleteFamilyConfirm !== "DELETE" ? 0.4 : 1 }}
                          onClick={() => alert("Not wired to Firestore yet")}>
                          Permanently Delete
                        </button>
                        <button className="settings-confirm-no" onClick={() => { setShowDeleteFamily(false); setDeleteFamilyConfirm(""); }}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}

        </div>

        <div className="settings-modal-footer" style={{ "--tab-accent": ACCENT_COLORS.find(c=>c.deep===kidColour)?.deep||"#f07a45", "--tab-light": ACCENT_COLORS.find(c=>c.deep===kidColour)?.light||"#ff9d57" }}>
          <button className="settings-modal-cancel" onClick={onClose}>Cancel</button>
          <button className="settings-modal-save" onClick={handleSave}>
            {saved ? "✓ Saved!" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
