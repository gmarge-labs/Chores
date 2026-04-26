import React, { useState } from "react";
import "./ReportsModal.css";

const MOCK_DATA = {
  k1: { name: "Simra", accent: "#f07a45", accentLight: "#ff9d57",
    today: { earned:45, spent:50, chores:[{name:"Make bed",pts:10,done:true},{name:"Do dishes",pts:15,done:true},{name:"Tidy room",pts:20,done:false}], rewards:[{name:"Stay up late",pts:50}] },
    week:  { earned:210, spent:130, chores:[{name:"Make bed",pts:10,done:true},{name:"Do dishes",pts:15,done:true},{name:"Vacuum",pts:25,done:true},{name:"Homework",pts:30,done:false}], rewards:[{name:"Stay up late",pts:50},{name:"Movie night",pts:80}] },
    month: { earned:780, spent:190, chores:[{name:"Make bed",pts:10,done:true},{name:"Do dishes",pts:15,done:true},{name:"Vacuum",pts:25,done:true},{name:"Homework",pts:30,done:true},{name:"Laundry",pts:40,done:false}], rewards:[{name:"Stay up late",pts:50},{name:"Movie night",pts:80},{name:"Extra screen time",pts:60}] },
  },
  k2: { name: "Rayyan", accent: "#3f84db", accentLight: "#8fc4ff",
    today: { earned:30, spent:0, chores:[{name:"Make bed",pts:10,done:true},{name:"Read book",pts:20,done:true},{name:"Set table",pts:10,done:false}], rewards:[] },
    week:  { earned:150, spent:70, chores:[{name:"Make bed",pts:10,done:true},{name:"Read book",pts:20,done:true},{name:"Set table",pts:10,done:true},{name:"Feed pet",pts:15,done:false}], rewards:[{name:"Game time",pts:70}] },
    month: { earned:620, spent:120, chores:[{name:"Make bed",pts:10,done:true},{name:"Read book",pts:20,done:true},{name:"Set table",pts:10,done:true},{name:"Feed pet",pts:15,done:true},{name:"Clean desk",pts:20,done:false}], rewards:[{name:"Game time",pts:70},{name:"Stay up late",pts:50}] },
  },
  k3: { name: "Jinan", accent: "#2f9f8f", accentLight: "#4fc7b5",
    today: { earned:20, spent:0, chores:[{name:"Make bed",pts:10,done:true},{name:"Brush teeth",pts:5,done:true},{name:"Pack bag",pts:10,done:false}], rewards:[] },
    week:  { earned:95, spent:0, chores:[{name:"Make bed",pts:10,done:true},{name:"Brush teeth",pts:5,done:true},{name:"Pack bag",pts:10,done:true},{name:"Water plants",pts:15,done:false}], rewards:[] },
    month: { earned:410, spent:120, chores:[{name:"Make bed",pts:10,done:true},{name:"Brush teeth",pts:5,done:true},{name:"Pack bag",pts:10,done:true},{name:"Water plants",pts:15,done:true},{name:"Help cook",pts:25,done:false}], rewards:[{name:"Toy store trip",pts:120}] },
  },
};

const PERIODS = [{id:"today",label:"Today"},{id:"week",label:"This Week"},{id:"month",label:"This Month"}];

export default function ReportsModal({ onClose }) {
  const [period, setPeriod] = useState("week");
  const [selectedKid, setSelectedKid] = useState(null);
  const kids = Object.entries(MOCK_DATA).map(([id,d]) => ({id,...d}));
  const kid = selectedKid ? MOCK_DATA[selectedKid] : null;
  const pd = kid ? kid[period] : null;
  const net = pd ? pd.earned - pd.spent : 0;

  return (
    <div className="reports-overlay" onClick={e => { if(e.target===e.currentTarget) onClose(); }}>
      <div className="reports-modal">

        {/* Header */}
        <div className="reports-header">
          <h2 className="reports-title">✨ Reports</h2>
          <button className="reports-close" onClick={onClose}>×</button>
        </div>

        {/* Period switcher */}
        <div className="reports-period-bar">
          {PERIODS.map(p => (
            <button key={p.id} className={`reports-period-btn${period===p.id?" active":""}`} onClick={() => setPeriod(p.id)}>{p.label}</button>
          ))}
        </div>

        {/* Summary view */}
        {!selectedKid && (
          <div className="reports-summary-grid">
            {kids.map(k => {
              const d = k[period];
              const done = d.chores.filter(c=>c.done).length;
              const total = d.chores.length;
              const pct = Math.round((done/total)*100);
              return (
                <button key={k.id} className="reports-kid-card"
                  style={{"--kid-accent":k.accent,"--kid-light":k.accentLight}}
                  onClick={() => setSelectedKid(k.id)}>
                  <div className="reports-kid-card-top">
                    <div className="reports-kid-avatar">{k.name[0]}</div>
                    <span className="reports-kid-name">{k.name}</span>
                    <span className="reports-kid-arrow">›</span>
                  </div>
                  <div className="reports-hero-pts">
                    <span className="reports-hero-num">{d.earned}</span>
                    <span className="reports-hero-label">pts</span>
                  </div>
                  <div className="reports-kid-stats">
                    <div className="reports-stat-pill reports-stat-pill--green">✅ {done}/{total} chores</div>
                    <div className="reports-stat-pill reports-stat-pill--red">🎁 {d.rewards.length} redeemed</div>
                  </div>
                  <div className="reports-progress-track">
                    <div className="reports-progress-fill" style={{width:`${pct}%`}} />
                  </div>
                  <span className="reports-progress-label">{pct}% chores complete</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Drill-down view */}
        {selectedKid && kid && pd && (
          <div className="reports-detail">
            <div className="reports-detail-hero" style={{"--kid-accent":kid.accent,"--kid-light":kid.accentLight}}>
              <button className="reports-back-btn" onClick={() => setSelectedKid(null)}>‹ Back</button>
              <div className="reports-kid-avatar reports-kid-avatar--lg">{kid.name[0]}</div>
              <div className="reports-detail-hero-info">
                <span className="reports-kid-name" style={{fontSize:"1.15rem"}}>{kid.name}</span>
                <div className="reports-detail-stats-row">
                  <span className="reports-detail-stat reports-detail-stat--green">+{pd.earned} earned</span>
                  <span className="reports-detail-stat--divider">·</span>
                  <span className="reports-detail-stat reports-detail-stat--red">−{pd.spent} spent</span>
                  <span className="reports-detail-stat--divider">·</span>
                  <span className="reports-detail-stat--net" style={{color: net >= 0 ? "rgb(30,120,60)" : "rgb(180,40,40)"}}>
                    {net >= 0 ? `+${net}` : net} net
                  </span>
                </div>
              </div>
            </div>

            <div className="reports-detail-cols">
              <div className="reports-detail-tile">
                <h4 className="reports-tile-title">🧹 Chores</h4>
                {pd.chores.map((c,i) => (
                  <div key={i} className={`reports-chore-row${c.done?" done":" pending"}`}>
                    <span className="reports-chore-badge">{c.done ? "✓" : "…"}</span>
                    <span className="reports-chore-name">{c.name}</span>
                    <span className="reports-chore-pts">+{c.pts} pts</span>
                  </div>
                ))}
              </div>

              <div className="reports-detail-tile">
                <h4 className="reports-tile-title">🎁 Rewards Redeemed</h4>
                {pd.rewards.length === 0
                  ? <div className="reports-empty"><span style={{fontSize:"2rem"}}>🎯</span><p>No rewards redeemed yet</p></div>
                  : <>
                    {pd.rewards.map((r,i) => (
                      <div key={i} className="reports-reward-row">
                        <span className="reports-reward-name">{r.name}</span>
                        <span className="reports-reward-cost">−{r.pts} pts</span>
                      </div>
                    ))}
                    <div className="reports-reward-total">
                      <span>Total spent</span>
                      <span className="reports-reward-cost">−{pd.spent} pts</span>
                    </div>
                  </>
                }
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
