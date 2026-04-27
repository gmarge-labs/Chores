import { useState } from "react";
import { useAuth } from "../../context/AuthContext";
// import { useFamily } from "../../context/FamilyContext"; // re-enable when Firestore is wired
import { useNavigate } from "react-router-dom";
import Button from "../shared/Button";
import "./KidDashboard.css";

export default function KidDashboard() {
  const { session, logout } = useAuth();
  const navigate = useNavigate();

  // Temporary mock data until Firestore is wired up for kid sessions.
  const MOCK_KIDS = {
    k1: {
      id: "k1",
      name: "Simra",
      points: 149,
      accentColour: "#f07a45",
      pointsPerDollarReward: 20,
      dollarRewardValue: 1,
      due: [
        { id: "t1", name: "Fajr Prayer", points: 5 },
        { id: "t2", name: "Brush Teeth", points: 5 },
        { id: "t3", name: "Eat Breakfast", points: 5 },
        { id: "t4", name: "Clean your room", points: 5 },
      ],
      awaiting: [],
      completed: [],
    },
    k2: {
      id: "k2",
      name: "Rayyan",
      points: 100,
      accentColour: "#3f84db",
      pointsPerDollarReward: 20,
      dollarRewardValue: 1,
      due: [
        { id: "t1", name: "Make bed", points: 10 },
        { id: "t2", name: "Homework", points: 30 },
      ],
      awaiting: [],
      completed: [],
    },
    k3: {
      id: "k3",
      name: "Jinan",
      points: 105,
      accentColour: "#2f9f8f",
      pointsPerDollarReward: 20,
      dollarRewardValue: 1,
      due: [
        { id: "t1", name: "Tidy room", points: 20 },
        { id: "t2", name: "Help with dishes", points: 15 },
      ],
      awaiting: [],
      completed: [],
    },
  };
  const kid = MOCK_KIDS[session?.kidId];

  // Local task lists so kid can move tasks Due -> Awaiting on Done click.
  const [due, setDue] = useState(kid?.due || []);
  const [awaiting, setAwaiting] = useState(kid?.awaiting || []);
  const [completed] = useState(kid?.completed || []);
  const [celebrating, setCelebrating] = useState({}); // taskId -> true while animating
  const [leaving, setLeaving] = useState({}); // taskId -> true while sliding out

  const handleDone = (task) => {
    if (celebrating[task.id] || leaving[task.id]) return;
    setCelebrating(prev => ({ ...prev, [task.id]: true }));
    // After sparkle animation, slide out, then move to awaiting.
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

  if (!kid) return (
    <div className="page-center">
      <div style={{ color: "white", fontSize: "1.2rem", fontWeight: 700 }}>Loading...</div>
    </div>
  );

  const moneyValue = ((kid.points / (kid.pointsPerDollarReward || 20)) * (kid.dollarRewardValue || 1)).toFixed(2);
  const accentColor = kid.accentColour || "#ff8c42";

  return (
    <div className="kid-page">
      <div className="kid-header">
        <div className="kid-avatar" style={{ background: accentColor }}>
          {kid.name[0].toUpperCase()}
        </div>
        <h1 className="kid-name">{kid.name}</h1>
        <Button variant="ghost" size="sm" onClick={() => { logout(); navigate("/"); }}>
          Log out
        </Button>
      </div>

      <div className="kid-stats">
        <div className="kid-stat-pill" style={{ background: accentColor }}>
          {kid.points} points
        </div>
        <div className="kid-stat-pill kid-stat-pill--money">
          ${moneyValue}
        </div>
      </div>

      <div className="kid-columns">
        <div className="kid-column">
          <h2 className="kid-column-title">Due</h2>
          {due.length === 0 && <p className="kid-empty">All done! 🎉</p>}
          {due.map((task) => (
            <div
              key={task.id}
              className={`task-card${leaving[task.id] ? " task-card--leaving" : ""}`}
            >
              <div className="task-card__info">
                <p className="task-card__name">{task.name}</p>
                <p className="task-card__meta">{task.points} points</p>
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
                <Button variant="primary" size="sm" onClick={() => handleDone(task)}>Done</Button>
              </div>
            </div>
          ))}
        </div>

        <div className="kid-column">
          <h2 className="kid-column-title">Awaiting approval</h2>
          {awaiting.length === 0 && <p className="kid-empty">Nothing waiting</p>}
          {awaiting.map((task, i) => (
            <div key={i} className="task-card task-card--awaiting">
              <div className="task-card__info">
                <p className="task-card__name">{task.name}</p>
                <p className="task-card__meta">{task.points} points</p>
              </div>
              <span className="task-card__status">⏳</span>
            </div>
          ))}
        </div>

        <div className="kid-column">
          <h2 className="kid-column-title">Completed</h2>
          {completed.length === 0 && <p className="kid-empty">Nothing yet</p>}
          {completed.map((task, i) => (
            <div key={i} className="task-card task-card--completed">
              <div className="task-card__info">
                <p className="task-card__name">{task.name}</p>
                <p className="task-card__meta">+{task.points} points</p>
              </div>
              <span className="task-card__status">✓</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
