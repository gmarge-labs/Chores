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
        { name: "Fajr Prayer", points: 5 },
        { name: "Brush Teeth", points: 5 },
        { name: "Eat Breakfast", points: 5 },
        { name: "Clean your room", points: 5 },
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
        { name: "Make bed", points: 10 },
        { name: "Homework", points: 30 },
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
        { name: "Tidy room", points: 20 },
        { name: "Help with dishes", points: 15 },
      ],
      awaiting: [],
      completed: [],
    },
  };
  const kid = MOCK_KIDS[session?.kidId];

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
          {kid.due?.length === 0 && <p className="kid-empty">All done! 🎉</p>}
          {kid.due?.map((task, i) => (
            <div key={i} className="task-card">
              <div className="task-card__info">
                <p className="task-card__name">{task.name}</p>
                <p className="task-card__meta">{task.points} points</p>
              </div>
              <Button variant="primary" size="sm">Done</Button>
            </div>
          ))}
        </div>

        <div className="kid-column">
          <h2 className="kid-column-title">Awaiting approval</h2>
          {kid.awaiting?.length === 0 && <p className="kid-empty">Nothing waiting</p>}
          {kid.awaiting?.map((task, i) => (
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
          {kid.completed?.length === 0 && <p className="kid-empty">Nothing yet</p>}
          {kid.completed?.map((task, i) => (
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
