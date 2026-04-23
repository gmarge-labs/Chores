import { useAuth } from "../../context/AuthContext";
import { useFamily } from "../../context/FamilyContext";
import { useNavigate } from "react-router-dom";
import Button from "../shared/Button";
import "./KidDashboard.css";

export default function KidDashboard() {
  const { session, logout } = useAuth();
  const { getKid } = useFamily();
  const navigate = useNavigate();

  const kid = getKid(session?.kidId);

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
