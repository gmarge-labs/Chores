import { useState, useEffect, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "./KidDetail.css";
import AddTaskModal from "./AddTaskModal";
import Background from '../shared/Background';

const ACCENT_COLORS = [
  { deep: "#f07a45", light: "#ff9d57" },
  { deep: "#3f84db", light: "#8fc4ff" },
  { deep: "#2f9f8f", light: "#4fc7b5" },
  { deep: "#7e60df", light: "#b99cff" },
  { deep: "#c22f7e", light: "#ff8db7" },
  { deep: "#e6a800", light: "#ffd97a" },
];

const MOCK_KIDS = [
  { id: "k1", name: "Simra",  accentColour: "#f07a45", points: 149,
    due: [
      { id: "t1", title: "Fajr Prayer",    meta: "Daily • 5:30 AM",  points: 5 },
      { id: "t2", title: "Brush Teeth",    meta: "Daily • 8:00 AM",  points: 5 },
      { id: "t3", title: "Eat Breakfast",  meta: "Daily • 9:00 AM",  points: 5 },
      { id: "t4", title: "Clean your room",meta: "Daily • 10:00 AM", points: 5 },
    ],
    awaiting: [], completed: [],
  },
  { id: "k2", name: "Rayyan", accentColour: "#3f84db", points: 100, due: [], awaiting: [], completed: [] },
  { id: "k3", name: "Jinan",  accentColour: "#2f9f8f", points: 105, due: [], awaiting: [], completed: [] },
];

export default function KidDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [activePanel, setActivePanel] = useState("dashboard");
  const [showAddTask, setShowAddTask] = useState(false);
  const [displayPoints, setDisplayPoints] = useState(0);
  const [celebrating, setCelebrating] = useState(false);
  const [kids, setKids] = useState(MOCK_KIDS);

  const kid = kids.find(k => k.id === id) || kids[0];
  const accent = ACCENT_COLORS.find(c => c.deep === kid.accentColour) || ACCENT_COLORS[0];

  const handleAddTask = (task, kidIds) => {
    setKids(prev => prev.map(k =>
      kidIds.includes(k.id) ? { ...k, due: [...k.due, { ...task, id: task.id + k.id }] } : k
    ));
  };
  useEffect(() => {
    const end = kid.points;
    const startFrom = Math.max(0, end - 20);
    let current = startFrom;
    setDisplayPoints(startFrom);
    const timer = setInterval(() => {
      current = Math.min(current + 1, end);
      setDisplayPoints(current);
      if (current >= end) clearInterval(timer);
    }, 40);
    return () => clearInterval(timer);
  }, [kid.points]);

  const moveTask = (taskId, from, to) => {
    setKids(prev => prev.map(k => {
      if (k.id !== kid.id) return k;
      const task = k[from].find(t => t.id === taskId);
      const pointsDelta = 
        (to === "completed" && from === "awaiting") ? (task?.points || 0) :
        (to === "due" && from === "completed") ? -(task?.points || 0) :
        0;
      if (to === "completed" && from === "awaiting") {
        setCelebrating(true);
        setTimeout(() => setCelebrating(false), 2000);
      }
      return {
        ...k,
        points: k.points + pointsDelta,
        [from]: k[from].filter(t => t.id !== taskId),
        [to]: [...k[to], task],
      };
    }));
  };

  return (
    <div className="kid-detail-page" style={{ '--accent': accent.deep, '--accent-light': accent.light }}>
      <Background />
      {celebrating && (
        <div className="celebration-burst" aria-hidden="true">
          {Array.from({length: 20}).map((_, i) => (
            <span key={i} className="confetti-piece" style={{
              left: `${Math.random() * 100}%`,
              animationDelay: `${Math.random() * 0.5}s`,
              background: ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff6bcb','#fff'][i % 6],
              transform: `rotate(${Math.random() * 360}deg)`,
            }}/>
          ))}
          <div className="celebration-text">🎉 +5 pts!</div>
        </div>
      )}

      {/* Header */}
      <header className="kid-detail-header">
        <div className="kid-detail-name-pill">
          <h1>{kid.name}</h1>
        </div>
        <nav className="kid-detail-nav">
          {["dashboard","rewards","reports","settings"].map(panel => (
            <button
              key={panel}
              className={`kid-nav-btn${activePanel === panel ? " active" : ""}`}
              onClick={() => setActivePanel(panel)}
            >
              {panel.charAt(0).toUpperCase() + panel.slice(1)}
            </button>
          ))}
        </nav>
        <div className="kid-points-counter">
          {String(displayPoints).split('').map((digit, i) => (
            <span key={i} className="kid-points-digit" style={{
              animationDelay: `${i * 0.15}s`,
              color: ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#ff6bcb'][i % 5],
            }}>{digit}</span>
          ))}
          <span className="kid-points-label">pts</span>
        </div>
      </header>

      {/* Main content */}
      <section className="kid-detail-card">
        <span className="panel-bubbles" aria-hidden="true"><span/><span/><span/></span>

        {activePanel === "dashboard" && (
          <>
            <div className="kid-detail-card-head">
              <h2>Dashboard</h2>
              {kid.due.length > 0 && (
                <span className="due-badge">{kid.due.length} due tasks</span>
              )}
              <button className="add-task-btn" onClick={() => setShowAddTask(true)}>+ Add Task</button>
            </div>

            <div className="task-columns">
              {/* Due */}
              <section className="task-lane">
                <span className="tile-bubbles" aria-hidden="true"><span/><span/><span/><span/><span/></span>
                <span className="lane-shimmer" aria-hidden="true"/>
                <h3>Due</h3>
                <div className="task-stack">
                  {kid.due.length === 0 && <p className="empty-msg">Nothing due right now.</p>}
                  {kid.due.map(task => (
                    <article key={task.id} className="task-card">
                      <div className="task-info">
                        <h4>{task.title}</h4>
                        <p className="task-meta">{task.meta}</p>
                        <p className="task-meta">{task.points} points</p>
                      </div>
                      <button className="task-done-btn" onClick={() => moveTask(task.id, "due", "awaiting")}>Done</button>
                    </article>
                  ))}
                </div>
              </section>

              {/* Awaiting */}
              <section className="task-lane">
                <span className="tile-bubbles" aria-hidden="true"><span/><span/><span/><span/><span/></span>
                <span className="lane-shimmer" aria-hidden="true"/>
                <h3>Awaiting approval</h3>
                <div className="task-stack">
                  {kid.awaiting.length === 0 && <div className="empty-state"><span className="empty-icon">⏳</span><p className="empty-msg">Nothing waiting yet</p></div>}
                  {kid.awaiting.map(task => (
                    <article key={task.id} className="task-card">
                      <div className="task-info">
                        <h4>{task.title}</h4>
                        <p className="task-meta">{task.meta}</p>
                        <p className="task-meta">{task.points} points</p>
                      </div>
                      <div className="task-actions">
                        <button className="task-undo-btn" onClick={() => moveTask(task.id, "awaiting", "due")}>Undo</button>
                        <button className="task-undo-btn" onClick={() => moveTask(task.id, "awaiting", "completed")}>Approve</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>

              {/* Completed */}
              <section className="task-lane">
                <span className="tile-bubbles" aria-hidden="true"><span/><span/><span/><span/><span/></span>
                <span className="lane-shimmer" aria-hidden="true"/>
                <h3>Completed</h3>
                <div className="task-stack">
                  {kid.completed.length === 0 && <div className="empty-state"><span className="empty-icon">🌟</span><p className="empty-msg">Nothing completed yet</p></div>}
                  {kid.completed.map(task => (
                    <article key={task.id} className="task-card">
                      <div className="task-info">
                        <h4>{task.title}</h4>
                        <p className="task-meta">{task.meta}</p>
                        <p className="task-meta">{task.points} points</p>
                      </div>
                      <button className="task-undo-btn" onClick={() => moveTask(task.id, "completed", "due")}>Undo</button>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}

        {activePanel !== "dashboard" && (
          <div className="panel-placeholder">
            <h2>{activePanel.charAt(0).toUpperCase() + activePanel.slice(1)}</h2>
            <p>Coming soon.</p>
          </div>
        )}
      {showAddTask && (
        <AddTaskModal
          kid={kid}
          accent={accent}
          allKids={kids}
          onAdd={handleAddTask}
          onClose={() => setShowAddTask(false)}
        />
      )}
      </section>
      <button className="kid-back-btn" onClick={() => navigate("/family")}>
        ← Back to family
      </button>
    </div>
  );
}
