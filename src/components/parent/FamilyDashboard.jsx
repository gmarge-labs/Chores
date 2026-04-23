import { useAuth } from "../../context/AuthContext";
import RainbowTitle from "../shared/RainbowTitle";
import Button from "../shared/Button";
import KidCard from "./KidCard";
import "./FamilyDashboard.css";
import Background from '../shared/Background';

const MOCK_KIDS = [
  { id: "k1", name: "Simra",  points: 149, pointsPerDollarReward: 20, dollarRewardValue: 1, accentColour: "#f07a45", awaiting: [] },
  { id: "k2", name: "Rayyan", points: 100, pointsPerDollarReward: 20, dollarRewardValue: 1, accentColour: "#3f84db", awaiting: [] },
  { id: "k3", name: "Jinan",  points: 105, pointsPerDollarReward: 20, dollarRewardValue: 1, accentColour: "#2f9f8f", awaiting: [] },
];
const MOCK_FAMILY = { id: "f1", familyName: "Bulamas" };

export default function FamilyDashboard() {
  const { logout } = useAuth();

  return (
    <div className="dashboard-page">
      <Background />
      <div className="dashboard-header">
        <div className="dashboard-title-area">
          <p className="dashboard-family-name">{MOCK_FAMILY.familyName} Family</p>
          <RainbowTitle size="md" />
        </div>
        <Button variant="ghost" size="sm" onClick={logout}>Log out</Button>
      </div>

      <div className="kid-grid">
        {MOCK_KIDS.map(kid => (
          <KidCard key={kid.id} kid={kid} familyId={MOCK_FAMILY.id} />
        ))}
      </div>

      <div className="dashboard-actions">
        <button className="action-btn action-btn--reports">Reports<span className="btn-bub"/><span className="btn-bub"/><span className="btn-bub"/><span className="btn-bub"/><span className="btn-bub"/><span className="btn-bub"/><span className="btn-bub"/><span className="btn-bub"/></button>
        <button className="action-btn action-btn--settings">Settings<span className="btn-bub"/><span className="btn-bub"/><span className="btn-bub"/><span className="btn-bub"/><span className="btn-bub"/><span className="btn-bub"/><span className="btn-bub"/><span className="btn-bub"/></button>
      </div>
      <p className="manage-sub">ChoreHeroes Pro ✦ Home Assistant included — <button className="manage-sub-link">Manage subscription</button></p>
    </div>
  );
}
