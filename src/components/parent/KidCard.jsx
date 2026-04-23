import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useFamily } from "../../context/FamilyContext";
import "./KidCard.css";

const ACCENT_COLORS = [
  { name: "Orange", light: "#ff9d57", deep: "#f07a45" },
  { name: "Blue",   light: "#8fc4ff", deep: "#3f84db" },
  { name: "Teal",   light: "#4fc7b5", deep: "#2f9f8f" },
  { name: "Purple", light: "#b99cff", deep: "#7e60df" },
  { name: "Pink",   light: "#ff8db7", deep: "#c22f7e" },
  { name: "Yellow", light: "#ffd97a", deep: "#e6a800" },
];

export default function KidCard({ kid, familyId }) {
  const { setSession } = useAuth();
  const { updateKid } = useFamily();
  const navigate = useNavigate();
  const [showPicker, setShowPicker] = useState(false);

  const accent = ACCENT_COLORS.find(c => c.deep === kid.accentColour) || ACCENT_COLORS[0];
  const money = Math.floor((kid.points / (kid.pointsPerDollarReward || 20)) * (kid.dollarRewardValue || 1));

  const handleColorPick = async (e, color) => {
    e.stopPropagation();
    await updateKid(familyId, kid.id, { accentColour: color.deep });
    setShowPicker(false);
  };

  const handleOpen = () => {
    if (showPicker) { setShowPicker(false); return; }
    setSession(s => ({ ...s, viewingKidId: kid.id }));
    navigate(`/kid-detail/${kid.id}`);
  };

  return (
    <div
      className="kid-card"
      style={{ '--accent': accent.deep, '--accent-light': accent.light }}
      onClick={handleOpen}
    >
      <span className="tile-bubbles" aria-hidden="true">
        <span/><span/><span/><span/><span/>
      </span>

      <div className="kid-card-top">
        <div
          className="avatar-btn"
          onClick={e => { e.stopPropagation(); setShowPicker(p => !p); }}
        >
          <div className="kid-avatar">
            <span className="avatar-shimmer" aria-hidden="true"/>
            <span className="avatar-letter">{kid.name[0].toUpperCase()}</span>
          </div>
        </div>
        <h2 className="kid-name">{kid.name}</h2>
        {kid.awaiting?.length > 0 && <span className="pending-badge">{kid.awaiting.length}</span>}
      </div>

      {showPicker && (
        <div className="color-picker" onClick={e => e.stopPropagation()}>
          <p className="color-picker-label">Choose {kid.name}'s colour</p>
          <div className="color-swatches">
            {ACCENT_COLORS.map(c => (
              <div
                key={c.name}
                className={`color-swatch${c.deep === accent.deep ? " active" : ""}`}
                style={{ background: `linear-gradient(145deg,${c.light},${c.deep})` }}
                onClick={e => handleColorPick(e, c)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="pill-row">
        <span className="pill score-pill">
          <span className="score-sparkles" aria-hidden="true"/>
          <span className="score-val">{kid.points} points</span>
        </span>
        <span className="pill dollar-pill">${money}</span>
      </div>
    </div>
  );
}
