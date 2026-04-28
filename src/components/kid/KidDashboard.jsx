import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useNavigate } from "react-router-dom";
import Background from "../shared/Background";
import "../parent/KidDetail.css";
import "./KidDashboard.css";

const HERO_RANKS = [
  { key: "rookie",   name: "Rookie Hero",   emoji: "🌱", min:    0 },
  { key: "rising",   name: "Rising Hero",   emoji: "⚡",    min:  100 },
  { key: "champion", name: "Champion Hero", emoji: "🔥", min:  250 },
  { key: "legend",   name: "Legend Hero",   emoji: "🪐", min:  500 },
  { key: "ultimate", name: "Ultimate Hero", emoji: "👑", min: 1000 },
];

function getRank(points) {
  let current = HERO_RANKS[0];
  for (const r of HERO_RANKS) if (points >= r.min) current = r;
  return current;
}

const ACCENT_COLORS = {
  k1: { deep: "#f07a45", light: "#ff9d57" },
  k2: { deep: "#3f84db", light: "#8fc4ff" },
  k3: { deep: "#2f9f8f", light: "#4fc7b5" },
};

const MOCK_KIDS = {
  k1: {
    id: "k1", name: "Simra", points: 149, streak: 7,
    pointsPerDollarReward: 20, dollarRewardValue: 1,
    due: [
      { id: "t1", emoji: "🙏", title: "Fajr Prayer",     meta: "Daily • 5:30 AM",  points: 5 },
      { id: "t2", emoji: "🪥", title: "Brush Teeth",     meta: "Daily • 8:00 AM",  points: 5 },
      { id: "t3", emoji: "🥣", title: "Eat Breakfast",   meta: "Daily • 9:00 AM",  points: 5 },
      { id: "t4", emoji: "🧹", title: "Clean your room", meta: "Daily • 10:00 AM", points: 5 },
    ],
    awaiting: [], completed: [],
  },
  k2: {
    id: "k2", name: "Rayyan", points: 100, streak: 3,
    pointsPerDollarReward: 20, dollarRewardValue: 1,
    due: [
      { id: "t1", emoji: "🛏️", title: "Make bed", meta: "Daily • 7:00 AM", points: 10 },
      { id: "t2", emoji: "📚", title: "Homework", meta: "Daily • 5:00 PM", points: 30 },
    ],
    awaiting: [], completed: [],
  },
  k3: {
    id: "k3", name: "Jinan", points: 105, streak: 1,
    pointsPerDollarReward: 20, dollarRewardValue: 1,
    due: [
      { id: "t1", emoji: "🧹", title: "Tidy room",       meta: "Daily • 8:00 AM", points: 20 },
      { id: "t2", emoji: "🍽️", title: "Help with dishes",meta: "Daily • 6:00 PM", points: 15 },
    ],
    awaiting: [], completed: [],
  },
};

const MOCK_REWARDS = [
  { id: "r1", name: "Stay up late",   emoji: "🌙", cost:  50 },
  { id: "r2", name: "Movie night",    emoji: "🍿", cost:  75 },
  { id: "r3", name: "Ice cream trip", emoji: "🍨", cost: 100 },
  { id: "r4", name: "Pizza dinner",   emoji: "🍕", cost: 200 },
  { id: "r5", name: "New video game", emoji: "🎮", cost: 500 },
];

export default function KidDashboard() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  const kid = MOCK_KIDS[session?.kidId];

  if (!kid) return (
    <div className="page-center">
      <div style={{ color: "white", fontSize: "1.2rem", fontWeight: 700 }}>Loading...</div>
    </div>
  );

  const accent = ACCENT_COLORS[kid.id] || ACCENT_COLORS.k1;
  const rank = getRank(kid.points || 0);

  const [view, setView] = useState("dashboard");
  const [due, setDue] = useState(kid.due || []);
  const [awaiting, setAwaiting] = useState(kid.awaiting || []);
  const [completed] = useState(kid.completed || []);
  const [celebrating, setCelebrating] = useState({});
  const [currentPoints, setCurrentPoints] = useState(kid.points);
  const [claimedRewards, setClaimedRewards] = useState([]);
  const [confirmReward, setConfirmReward] = useState(null);
  const [justClaimed, setJustClaimed] = useState(null);
  const [leaving, setLeaving] = useState({});

  const handleDone = (task) => {
    if (celebrating[task.id] || leaving[task.id]) return;
    setCelebrating(prev => ({ ...prev, [task.id]: true }));
    setTimeout(() => {
      setCelebrating(prev => { const n = { ...prev }; delete n[task.id]; return n; });
      setLeaving(prev => ({ ...prev, [task.id]: true }));
      setTimeout(() => {
        setDue(prev => prev.filter(t => t.id !== task.id));
        setAwaiting(prev => [...prev, task]);
        setLeaving(prev => { const n = { ...prev }; delete n[task.id]; return n; });
      }, 350);
    }, 600);
  };

  return (
    <div className="kid-detail-page" style={{ "--accent": accent.deep, "--accent-light": accent.light }}>
      <Background />

      <header className="kid-detail-header">
        <div className="kid-name-and-stripe">
          <div className="kid-detail-name-pill">
            <h1>
              <span className="kid-name-rank-emoji" aria-hidden="true">{rank.emoji}</span>
              {kid.name}
            </h1>
            <p className="kid-name-rank-title"><span className="kid-rank-shimmer">{rank.name}</span></p>
          </div>
          <div className="kid-identity-stripe">
            
            {kid.streak > 0 && (
              <span className="kid-stripe-streak">{kid.streak}/7 days</span>
            )}
          </div>
        </div>


        <div className="kid-points-counter kid-points-counter--header">
          {String(currentPoints).split("").map((d, i) => (
            <span key={i} className="kid-points-digit" style={{
              animationDelay: `${i * 0.15}s`,
              color: ["#ff6b6b","#ffd93d","#6bcb77","#4d96ff","#ff6bcb"][i % 5],
            }}>{d}</span>
          ))}
          <span className="kid-points-label">pts</span>
        </div>

        <div className="kid-header-right">
          <nav className="kid-detail-nav">
            <button className={"kid-nav-btn" + (view === "dashboard" ? " active" : "")} onClick={() => setView("dashboard")}>Dashboard</button>
            <button className={"kid-nav-btn" + (view === "rewards"   ? " active" : "")} onClick={() => setView("rewards")}>Rewards</button>
          </nav>
          <button className="kid-logout-btn" onClick={() => { logout(); navigate("/"); }}>Log out</button>
        </div>
      </header>

      <section className="kid-detail-card">
        <span className="panel-bubbles" aria-hidden="true"><span/><span/><span/></span>

        {view === "dashboard" ? (
          <>
            <div className="kid-detail-card-head">
              <h2>Dashboard</h2>
              {due.length > 0 && (
                <span className="due-badge">{due.length} due tasks</span>
              )}
            </div>

            <div className="task-columns">
              <section className="task-lane">
                <span className="tile-bubbles" aria-hidden="true"><span/><span/><span/><span/><span/></span>
                <span className="lane-shimmer" aria-hidden="true"/>
                <h3>Due</h3>
                <div className="task-stack">
                  {due.length === 0 && (
                    <div className="kid-empty kid-empty--due">
                      <div className="kid-empty-art" aria-hidden="true">🎯</div>
                      <p className="kid-empty-title">All caught up!</p>
                      <p className="kid-empty-sub">Come back tomorrow for more</p>
                    </div>
                  )}
                  {due.map(task => (
                    <article key={task.id} className={"task-card" + (leaving[task.id] ? " task-card--leaving" : "")}>
                      <span className="task-card__emoji" aria-hidden="true">{task.emoji || "📝"}</span>
                        <div className="task-card__info">
                        <p className="task-card__name">{task.title}</p>
                        <p className="task-card__meta">{task.meta}</p>
                        <p className="task-card__points">{task.points} points</p>
                      </div>
                      <div className="task-card__done-wrap">
                        {celebrating[task.id] && (
                          <span className="sparkle-burst" aria-hidden="true">
                            <span className="sparkle sparkle--1">✦</span>
                            <span className="sparkle sparkle--2">✦</span>
                            <span className="sparkle sparkle--3">✦</span>
                            <span className="sparkle sparkle--4">✦</span>
                            <span className="sparkle sparkle--5">✦</span>
                            <span className="sparkle sparkle--6">✦</span>
                          </span>
                        )}
                        <button className="task-card__done" onClick={() => handleDone(task)}>Done</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              <section className="task-lane">
                <span className="tile-bubbles" aria-hidden="true"><span/><span/><span/><span/><span/></span>
                <h3>Awaiting approval</h3>
                <div className="task-stack">
                  {awaiting.length === 0 && (
                    <div className="kid-empty kid-empty--awaiting">
                      <div className="kid-empty-art" aria-hidden="true">⏳</div>
                      <p className="kid-empty-title">Nothing waiting</p>
                      <p className="kid-empty-sub">Tap a "Done" to send for approval</p>
                    </div>
                  )}
                  {awaiting.map(task => (
                    <article key={task.id} className="task-card task-card--awaiting">
                      <span className="task-card__emoji" aria-hidden="true">{task.emoji || "📝"}</span>
                        <div className="task-card__info">
                        <p className="task-card__name">{task.title}</p>
                        <p className="task-card__meta">{task.meta}</p>
                      </div>
                      <span className="task-card__status">⏳</span>
                    </article>
                  ))}
                </div>
              </section>

              <section className="task-lane">
                <span className="tile-bubbles" aria-hidden="true"><span/><span/><span/><span/><span/></span>
                <h3>Completed</h3>
                <div className="task-stack">
                  {completed.length === 0 && (
                    <div className="kid-empty kid-empty--completed">
                      <div className="kid-empty-art" aria-hidden="true">🌟</div>
                      <p className="kid-empty-title">Your wins live here</p>
                      <p className="kid-empty-sub">Complete a task to start your streak</p>
                    </div>
                  )}
                  {completed.map(task => (
                    <article key={task.id} className="task-card task-card--completed">
                      <span className="task-card__emoji" aria-hidden="true">{task.emoji || "📝"}</span>
                        <div className="task-card__info">
                        <p className="task-card__name">{task.title}</p>
                        <p className="task-card__meta">+{task.points} points</p>
                      </div>
                      <span className="task-card__status">✓</span>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : (
          <>
            <div className="kid-detail-card-head">
              <h2>Rewards</h2>
            </div>
            <div className="kid-rewards-grid">
              {MOCK_REWARDS.map(r => {
                const progress = Math.min(100, Math.round((currentPoints / r.cost) * 100));
                const remaining = Math.max(0, r.cost - currentPoints);
                const affordable = remaining === 0;
                return (
                  <div key={r.id} className={"reward-card" + (affordable ? " reward-card--affordable" : "")}>
                    <div className="reward-card__emoji" aria-hidden="true">{r.emoji}</div>
                    <h3 className="reward-card__name">{r.name}</h3>
                    <p className="reward-card__cost">⭐ {r.cost} points</p>
                    <div className="reward-card__bar" aria-hidden="true">
                      <div className="reward-card__bar-fill" style={{ width: progress + "%", background: accent.deep }}/>
                    </div>
                    <p className="reward-card__remaining">
                      {claimedRewards.includes(r.id)
                        ? "✓ Claimed!"
                        : affordable ? "✨ You can get this!" : remaining + " points to go"}
                    </p>
                    {claimedRewards.includes(r.id) ? (
                      <div className="reward-card__claimed-badge" aria-hidden="true">🏆</div>
                    ) : affordable ? (
                      <button
                        className="reward-card__claim-btn"
                        onClick={() => setConfirmReward(r)}
                      >Claim</button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {confirmReward && (
        <div className="kid-claim-overlay" onClick={() => setConfirmReward(null)}>
          <div className="kid-claim-dialog" onClick={e => e.stopPropagation()}>
            <div className="kid-claim-emoji" aria-hidden="true">{confirmReward.emoji}</div>
            <h3 className="kid-claim-title">Claim {confirmReward.name}?</h3>
            <p className="kid-claim-cost">This will use <strong>{confirmReward.cost} points</strong></p>
            <div className="kid-claim-actions">
              <button className="kid-claim-cancel" onClick={() => setConfirmReward(null)}>Not yet</button>
              <button
                className="kid-claim-confirm"
                onClick={() => {
                  setCurrentPoints(p => p - confirmReward.cost);
                  setClaimedRewards(prev => [...prev, confirmReward.id]);
                  setJustClaimed(confirmReward);
                  setConfirmReward(null);
                  setTimeout(() => setJustClaimed(null), 2200);
                }}
              >Yes, claim it!</button>
            </div>
          </div>
        </div>
      )}

      {justClaimed && (
        <div className="kid-claim-celebration" role="status" aria-live="polite">
          <div className="kid-claim-celebration-art" aria-hidden="true">{justClaimed.emoji}</div>
          <p className="kid-claim-celebration-text">You got <strong>{justClaimed.name}</strong>!</p>
          <p className="kid-claim-celebration-sub">Show this to your parent ✨</p>
        </div>
      )}
    </div>
  );
}
