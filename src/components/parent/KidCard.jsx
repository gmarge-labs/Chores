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

const BUBBLES = [
  { w:22, h:22, left:"12%",  top:"42%",    anim:"bub1", dur:"4s",   delay:"0s" },
  { w:16, h:16, right:"16%", top:"24%",    anim:"bub2", dur:"4.3s", delay:"0.3s" },
  { w:20, h:20, right:"24%", bottom:"18%", anim:"bub3", dur:"4.5s", delay:"0.6s" },
  { w:14, h:14, left:"34%",  bottom:"12%", anim:"bub4", dur:"4.1s", delay:"0.9s" },
  { w:18, h:18, right:"8%",  bottom:"46%", anim:"bub5", dur:"4.4s", delay:"1.2s" },
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
        {BUBBLES.map((b, i) => (
          <span key={i} style={{
            position: 'absolute',
            width: b.w + 'px',
            height: b.h + 'px',
            borderRadius: '50%',
            background: `radial-gradient(circle at 28% 24%, rgba(255,255,255,0.82), transparent 20%), linear-gradient(145deg, ${accent.light}, ${accent.deep})`,
            boxShadow: `0 0 8px 3px rgba(255,255,255,0.45), 0 0 16px 6px ${accent.light}66`,
            animation: `${b.anim} ${b.dur} ease-in-out ${b.delay} infinite`,
            ...(b.left   && { left:   b.left }),
            ...(b.right  && { right:  b.right }),
            ...(b.top    && { top:    b.top }),
            ...(b.bottom && { bottom: b.bottom }),
          }} />
        ))}
      </span>

      <div className="kid-card-top">
        <div className="avatar-btn" onClick={e => { e.stopPropagation(); setShowPicker(p => !p); }}>
          <div className="kid-avatar">
            <span className="avatar-shimmer" aria-hidden="true" />
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
                style={{ background: `linear-gradient(145deg, ${c.light}, ${c.deep})` }}
                onClick={e => handleColorPick(e, c)}
              />
            ))}
          </div>
        </div>
      )}

      <div className="pill-row">
        <span className="pill score-pill">
          <span className="score-sparkles" aria-hidden="true" />
          <span className="score-val">{kid.points} points</span>
        </span>
        <span className="pill dollar-pill">${money}</span>
      </div>
    </div>
  );
}
