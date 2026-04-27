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
  { key: "rookie",   emoji: "🌱", name: "Rookie Hero",   color: "rgba(160,200,120,0.25)", border: "rgba(160,200,120,0.5)" },
  { key: "rising",   emoji: "⚡", name: "Rising Hero",   color: "rgba(240,192,64,0.25)",  border: "rgba(240,192,64,0.5)"  },
  { key: "champion", emoji: "🔥", name: "Champion Hero", color: "rgba(240,122,69,0.25)",  border: "rgba(240,122,69,0.5)"  },
  { key: "legend",   emoji: "💫", name: "Legend Hero",   color: "rgba(126,96,223,0.25)",  border: "rgba(126,96,223,0.5)"  },
  { key: "ultimate", emoji: "👑", name: "Ultimate Hero", color: "rgba(230,168,0,0.25)",   border: "rgba(230,168,0,0.5)"   },
];

const MOCK_KIDS = [
  { id: "k1", name: "Simra",  accentColour: "#f07a45" },
  { id: "k2", name: "Rayyan", accentColour: "#3f84db" },
  { id: "k3", name: "Jinan",  accentColour: "#2f9f8f" },
];

const TABS = [
  { id: "profile",  emoji: "✏️",  label: "Edit Profile"  },
  { id: "bonus",    emoji: "🎁",  label: "Bonus Points"  },
  { id: "rewards",  emoji: "🛍️", label: "Rewards Store" },
  { id: "journey",  emoji: "🏆",  label: "Hero Journey"  },
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
  const [showPinForm, setShowPinForm] = useState(false);

  // Add Kid / Delete
  const [showAddKid, setShowAddKid] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [newKidName, setNewKidName] = useState("");
  const [newKidColour, setNewKidColour] = useState(ACCENT_COLORS[0].deep);
  const [newKidPin, setNewKidPin] = useState("");

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
    { id: "r1", name: "Stay up late",      points: 50  },
    { id: "r2", name: "Playdate",           points: 100 },
    { id: "r3", name: "Screen time bonus",  points: 30  },
  ]);
  const [newRewardName, setNewRewardName] = useState("");
  const [newRewardPoints, setNewRewardPoints] = useState("");
  const [selectedRewardId, setSelectedRewardId] = useState(null);
  const [rewardLibrary, setRewardLibrary] = useState([]);
  const [saveRewardToLib, setSaveRewardToLib] = useState(true);
  const [editingReward, setEditingReward] = useState(null);
  const [pointsPerDollar, setPointsPerDollar] = useState(20);
  const [dollarValue, setDollarValue] = useState(1);

  // Hero Journey
  const [heroThresholds, setHeroThresholds] = useState({
    rookie: 0, rising: 100, champion: 250, legend: 500, ultimate: 1000
  });

  const selectedKid = kids.find(k => k.id === selectedKidId);
  const accent = ACCENT_COLORS.find(c => c.deep === selectedKid?.accentColour) || ACCENT_COLORS[0];

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={e => e.stopPropagation()}>
        <span className="settings-sparkle top-right" aria-hidden="true">✦</span>
        <span className="settings-sparkle top-left"  aria-hidden="true">✦</span>
        <div className="settings-modal-header">
          <h2 className="settings-modal-title">Settings</h2>
          <button className="settings-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="settings-tab-bar">
          {TABS.map(t => (
            <button key={t.id} className={`settings-tab-btn${activeTab === t.id ? " active" : ""}`}
              onClick={() => setActiveTab(t.id)}>
              <span>{t.emoji}</span> {t.label}
            </button>
          ))}
        </div>
        <div className="settings-tab-content" key={activeTab}>

          {/* ── Edit Profile ── */}
          {activeTab === "profile" && (
            <>
              <div className="settings-section">
                <h3 className="settings-section-title">✨ Kid Profiles</h3>
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
                        onClick={() => { setSelectedKidId(k.id); setKidColour(k.accentColour); setPinError(""); setShowPinForm(false); }}>
                        <span className="settings-kid-chip-avatar"
                          style={{ background: `linear-gradient(145deg, ${liveAc.light}, ${liveAc.deep})`, transition: "background 0.3s" }}>
                          {k.name[0]}
                        </span>
                        {k.name}
                      </button>
                    );
                  })}
                </div>
                <div className="settings-colour-swatches settings-colour-swatches--full">
                  {ACCENT_COLORS.map(c => (
                    <button key={c.name}
                      className={`settings-colour-swatch-lg${kidColour === c.deep ? " active" : ""}`}
                      style={{ background: `linear-gradient(145deg, ${c.light}, ${c.deep})` }}
                      title={c.name}
                      onClick={() => setKidColour(c.deep)} />
                  ))}
                </div>
                {!showPinForm ? (
                  <div className="settings-ep-action-row">
                    <button className="settings-lib-toggle-btn"
                      onClick={() => { setShowPinForm(true); setPin(""); setConfirmPin(""); setPinError(""); }}>
                      🔒 Reset PIN
                    </button>
                    <button className="settings-modal-save" style={{ padding:"9px 20px", fontSize:"0.95rem" }}
                      onClick={() => setShowAddKid(true)}>
                      👶 Add a Kid ✦
                    </button>
                    <button className="settings-modal-save" style={{ padding:"9px 20px", fontSize:"0.95rem" }}
                      onClick={() => setShowDeleteConfirm(true)}>
                      🗑️ Delete Kid / Family
                    </button>
                  </div>
                ) : (
                  <div className="settings-ep-row" style={{ alignItems:"flex-end" }}>
                    <div className="settings-field" style={{ flex:1 }}>
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
                    <div className="settings-field" style={{ flex:1 }}>
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
                    <button className="settings-lib-toggle-btn" style={{ alignSelf:"flex-end", marginBottom:"2px" }}
                      onClick={() => setShowPinForm(false)}>✕</button>
                  </div>
                )}
                {pinError && <p className="settings-error">{pinError}</p>}
              </div>

              {showAddKid && (
                <div className="settings-pin-overlay"
                  onClick={e => { if (e.target === e.currentTarget) { setShowAddKid(false); setNewKidName(""); setNewKidPin(""); }}}>
                  <div className="settings-pin-overlay-card">
                    <h3 className="settings-section-title" style={{ marginBottom:"16px" }}>👶 Add a Kid</h3>
                    <div className="settings-field">
                      <label className="settings-label">Name</label>
                      <input className="settings-input" type="text" placeholder="Kid name" maxLength={20} autoFocus
                        value={newKidName} onChange={e => setNewKidName(e.target.value)} />
                    </div>
                    <div className="settings-field">
                      <label className="settings-label">Colour</label>
                      <div style={{ display:"flex", gap:"8px", flexWrap:"wrap" }}>
                        {ACCENT_COLORS.map(c => (
                          <button key={c.name}
                            className={"settings-colour-swatch-lg" + (newKidColour === c.deep ? " active" : "")}
                            style={{ background:"linear-gradient(145deg," + c.light + "," + c.deep + ")" }}
                            onClick={() => setNewKidColour(c.deep)} />
                        ))}
                      </div>
                    </div>
                    <div className="settings-field">
                      <label className="settings-label">PIN</label>
                      <div className="settings-pin-dots">
                        {[0,1,2,3].map(i => (
                          <span key={i}
                            className={"settings-pin-dot" + (i < newKidPin.length ? " filled" : "")}
                            style={{ "--dot-color": newKidColour }} />
                        ))}
                        <input className="settings-pin-hidden" type="password" inputMode="numeric" maxLength={4}
                          value={newKidPin} onChange={e => setNewKidPin(e.target.value.replace(/[^0-9]/g, ""))} />
                      </div>
                    </div>
                    <div style={{ display:"flex", gap:"10px", justifyContent:"flex-end", marginTop:"8px" }}>
                      <button className="settings-lib-toggle-btn"
                        onClick={() => { setShowAddKid(false); setNewKidName(""); setNewKidPin(""); }}>
                        Cancel
                      </button>
                      <button className="settings-modal-save"
                        onClick={() => {
                          if (newKidName.trim().length < 1 || newKidPin.length !== 4) return;
                          setKids(prev => [...prev, {
                            id: "k" + Date.now(),
                            name: newKidName.trim(),
                            accentColour: newKidColour,
                            pin: newKidPin
                          }]);
                          setShowAddKid(false); setNewKidName(""); setNewKidPin("");
                        }}>
                        Add Kid ✦
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {showDeleteConfirm && (
                <div className="settings-pin-overlay"
                  onClick={e => { if (e.target === e.currentTarget) setShowDeleteConfirm(false); }}>
                  <div className="settings-pin-overlay-card">
                    <h3 className="settings-section-title" style={{ marginBottom:"8px" }}>
                      🗑️ Delete {kids.find(k => k.id === selectedKidId)?.name || "Kid"}?
                    </h3>
                    <p style={{ fontFamily:"Nunito,sans-serif", fontSize:"0.9rem", color:"rgba(47,36,25,0.7)", marginBottom:"16px", lineHeight:"1.5" }}>
                      This will permanently delete this kid and all their data. This cannot be undone.
                    </p>
                    <div style={{ display:"flex", gap:"10px", justifyContent:"flex-end" }}>
                      <button className="settings-lib-toggle-btn" onClick={() => setShowDeleteConfirm(false)}>
                        Cancel
                      </button>
                      <button className="settings-modal-save"
                        style={{ background:"linear-gradient(145deg,#e07070,#c04040)" }}
                        onClick={() => {
                          const remaining = kids.filter(k => k.id !== selectedKidId);
                          setKids(remaining);
                          setSelectedKidId(remaining[0]?.id || null);
                          setShowDeleteConfirm(false);
                        }}>
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Bonus Points ── */}
          {activeTab === "bonus" && (
            <div className="settings-bonus-single">
              <div className="settings-section settings-bonus-right-tile">
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
                  <div className="settings-field" style={{ flex:1 }}>
                    <label className="settings-label">Reason</label>
                    <input className="settings-input" type="text" placeholder="e.g. Good behaviour" maxLength={60}
                      value={bonusReason} onChange={e => setBonusReason(e.target.value)} style={{ width:"100%" }} />
                  </div>
                  <div className="settings-field" style={{ width:"80px", flexShrink:0 }}>
                    <label className="settings-label">Pts</label>
                    <input className="settings-input" type="number" placeholder="000" min="1"
                      value={bonusPoints}
                      onChange={e => setBonusPoints(e.target.value.replace(/\D/g,"").slice(0,3))}
                      style={{ textAlign:"center", width:"100%" }} />
                  </div>
                </div>
                <div className="settings-bonus-footer">
                  <div className="settings-notify-toggle-row">
                    <button className={`settings-toggle-btn${notifyKids ? " on" : ""}`}
                      onClick={() => setNotifyKids(p => !p)}>
                      <span className="settings-toggle-knob" />
                    </button>
                    <span className="settings-toggle-label">{notifyKids ? "Notify kids" : "Silent"}</span>
                  </div>
                  <div style={{ display:"flex", gap:"10px", alignItems:"center", marginLeft:"auto" }}>
                    {bonusAdded && <span className="settings-bonus-confirm">🎉 Added!</span>}
                    <button className="settings-lib-toggle-btn" style={{ width:"auto" }}
                      onClick={() => setShowBonusLibrary(p => !p)}>
                      ☰ Pick from library {bonusLibrary.length > 0 ? `(${bonusLibrary.length})` : ""}
                    </button>
                    <button className="settings-modal-save" style={{ width:"auto" }}
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
                {showBonusLibrary && (
                  <div className="settings-bonus-library">
                    {bonusLibrary.length === 0
                      ? <p className="settings-hero-desc">No saved bonuses yet.</p>
                      : bonusLibrary.map((b, i) => (
                        <button key={i} className="settings-bonus-lib-item"
                          onClick={() => { setBonusReason(b.reason); setBonusPoints(String(b.points)); setShowBonusLibrary(false); }}>
                          <span className="settings-reward-name">{b.reason}</span>
                          <span className="settings-reward-pts">{b.points} pts</span>
                        </button>
                      ))
                    }
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Rewards Store ── */}
          {activeTab === "rewards" && (
            <div className="settings-rewards-two-col">
              <div className="settings-section settings-section--compact settings-rewards-left-tile">
                <h3 className="settings-section-title">💵 Conversion Rate</h3>
                <div className="settings-rate-row" style={{ justifyContent:"center" }}>
                  <span className="settings-rate-pts-label">Pts</span>
                  <input className="settings-input" type="number" min="1"
                    value={pointsPerDollar} onChange={e => setPointsPerDollar(Number(e.target.value) || "")}
                    style={{ width:"60px", textAlign:"center" }} />
                  <span className="settings-rate-equals">=</span>
                  <span className="settings-rate-dollar-bold">$</span>
                  <input className="settings-input" type="number" min="1"
                    value={dollarValue} onChange={e => setDollarValue(Number(e.target.value) || "")}
                    style={{ width:"60px", textAlign:"center" }} />
                </div>
              </div>
              <div className="settings-section settings-section--compact settings-rewards-right-tile">
                <h3 className="settings-section-title">🛍️ Rewards Store</h3>
                <div style={{ display:"flex", flexDirection:"row", alignItems:"flex-end", gap:"10px", width:"100%" }}>
                  <div style={{ flex:1, minWidth:0, display:"flex", flexDirection:"column", gap:"4px" }}>
                    <label className="settings-label">Reward name</label>
                    <input className="settings-input" type="text" placeholder="e.g. Reward name..."
                      maxLength={40} value={newRewardName} onChange={e => setNewRewardName(e.target.value)}
                      style={{ width:"100%" }} />
                  </div>
                  <div style={{ width:"70px", flexShrink:0, display:"flex", flexDirection:"column", gap:"4px" }}>
                    <label className="settings-label">Pts</label>
                    <input className="settings-input" type="number" placeholder="Pts" min="1"
                      value={newRewardPoints}
                      onChange={e => setNewRewardPoints(e.target.value.replace(/\D/g,"").slice(0,3))}
                      style={{ textAlign:"center", width:"70px" }} />
                  </div>
                  <div style={{ flexShrink:0, alignSelf:"flex-end" }}>
                    <button className="settings-modal-save" style={{ padding:"9px 20px", whiteSpace:"nowrap" }}
                      onClick={() => {
                        if (!newRewardName.trim() || !newRewardPoints) return;
                        const r = { id: "r"+Date.now(), name: newRewardName.trim(), points: Number(newRewardPoints) };
                        setRewards(prev => [...prev, r]);
                        if (saveRewardToLib) setRewardLibrary(prev => [r, ...prev].slice(0,30));
                        setNewRewardName(""); setNewRewardPoints("");
                      }}>Add ✦</button>
                  </div>
                </div>
                <div className="settings-rewards-toggle-row" style={{ justifyContent:"flex-start" }}>
                  <button className={`settings-toggle-btn${saveRewardToLib ? " on" : ""}`}
                    onClick={() => setSaveRewardToLib(p => !p)}>
                    <span className="settings-toggle-knob" />
                  </button>
                  <span className="settings-toggle-label" style={{ fontSize:"0.82rem" }}>
                    {saveRewardToLib ? "Save to library" : "Don't save"}
                  </span>
                </div>
                <div className="settings-rewards-divider" />
                <div className="settings-field">
                  <label className="settings-label">📚 Library {rewardLibrary.length > 0 ? `(${rewardLibrary.length})` : ""}</label>
                  {rewardLibrary.length === 0 ? (
                    <div className="settings-rewards-empty-compact">
                      <span>🛍️ No saved rewards yet</span>
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
                            <button className="settings-reward-edit-btn" onClick={() => setEditingReward({ ...r })}>✏️</button>
                            <button className="settings-reward-del-btn"
                              onClick={() => { setRewardLibrary(prev => prev.filter(x => x.id !== r.id)); setSelectedRewardId(null); }}>🗑️</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Hero Journey ── */}
          {activeTab === "journey" && (
            <div className="settings-section settings-section--hero">
              <h3 className="settings-section-title">🏆 Hero Journey</h3>
              <div className="settings-hero-levels-grid">
                {HERO_LEVELS.map((l, i) => (
                  <React.Fragment key={l.key}>
                    <div className="settings-hero-level-card"
                      style={{ background: l.color, borderColor: l.border }}>
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
        </div>

        <div className="settings-modal-footer"
          style={{ "--tab-accent": ACCENT_COLORS.find(c=>c.deep===kidColour)?.deep||"#f07a45", "--tab-light": ACCENT_COLORS.find(c=>c.deep===kidColour)?.light||"#ff9d57" }}>
          <button className="settings-modal-cancel" onClick={onClose}>Cancel</button>
          <button className="settings-modal-save"
            onClick={() => { setSaved(true); setTimeout(() => setSaved(false), 2000); onClose(); }}>
            Save changes
          </button>
        </div>
      </div>
    </div>
  );
}
