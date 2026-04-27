import { useState } from "react";
import { useLibraries } from "../../context/LibrariesContext";
import "./AddTaskModal.css";

const SCHEDULES = ["Daily", "Weekly", "One-time"];
const TIMES = ["5:30 AM","6:00 AM","7:00 AM","8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM","7:00 PM","8:00 PM","9:00 PM"];
const POINTS = [1,2,3,5,10,15,20,25,50];

export default function AddTaskModal({ kid, accent, allKids, onAdd, onClose }) {
  const { taskLibrary, setTaskLibrary } = useLibraries();
  const [title, setTitle] = useState("");
  const [schedule, setSchedule] = useState("Daily");
  const [time, setTime] = useState("8:00 AM");
  const [points, setPoints] = useState(5);
  const [error, setError] = useState("");
  const [customPoints, setCustomPoints] = useState("");
  // taskLibrary state is lifted to parent (KidDetail) via taskLibrary / setTaskLibrary props
  const [showLibrary, setShowLibrary] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [pendingTask, setPendingTask] = useState(null);
  const [assignedKids, setAssignedKids] = useState([kid.id]);

  const toggleKid = (id) => {
    setAssignedKids(prev =>
      prev.includes(id) ? prev.filter(k => k !== id) : [...prev, id]
    );
  };

  const handleSubmit = () => {
    if (!title.trim()) { setError("Please enter a task name"); return; }
    if (assignedKids.length === 0) { setError("Please select at least one kid"); return; }
    const finalPoints = customPoints !== "" ? parseInt(customPoints) || points : points;
    const task = { id: "t" + Date.now(), title: title.trim(), meta: `${schedule} • ${time}`, points: finalPoints };
    onAdd(task, assignedKids);
    setPendingTask({ title: title.trim(), schedule, time, points: finalPoints });
    setShowSavePrompt(true);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="add-task-modal"
        style={{ "--accent": accent.deep, "--accent-light": accent.light }}
        onClick={e => e.stopPropagation()}
      >
        <span className="modal-sparkle top-right" aria-hidden="true">✦</span>
        <span className="modal-sparkle top-left" aria-hidden="true">✦</span>

        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">Add Task</h2>
          <button className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Task name */}
        <div className="modal-field">
          <label className="modal-label">Task name</label>
          <input
            className="modal-input"
            type="text"
            placeholder="e.g. Brush Teeth"
            value={title}
            onChange={e => { setTitle(e.target.value); setError(""); }}
            maxLength={60}
          />
          {error && <p className="modal-error">{error}</p>}
        </div>

        {/* Schedule */}
        <div className="modal-field">
          <label className="modal-label">Schedule</label>
          <div className="modal-pill-group">
            {SCHEDULES.map(s => (
              <button
                key={s}
                className={`modal-pill-btn${schedule === s ? " active" : ""}`}
                onClick={() => setSchedule(s)}
              >{s}</button>
            ))}
          </div>
        </div>

        {/* Time */}
        <div className="modal-field">
          <label className="modal-label">Time</label>
          <select className="modal-select" value={time} onChange={e => setTime(e.target.value)}>
            {TIMES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>

        {/* Points */}
        <div className="modal-field">
          <label className="modal-label">Points</label>
          <div className="modal-points-row">
            <div className="modal-pill-group">
              {POINTS.map(p => (
                <button
                  key={p}
                  className={`modal-pill-btn${points === p && customPoints === "" ? " active" : ""}`}
                  onClick={() => { setPoints(p); setCustomPoints(""); }}
                >{p}</button>
              ))}
            </div>
            <input
              className="modal-input modal-input--custom"
              type="number"
              placeholder="Custom"
              min="1"
              max="999"
              value={customPoints}
              onChange={e => setCustomPoints(e.target.value)}
            />
          </div>
        </div>

        {/* Assign to */}
        {allKids && allKids.length > 1 && (
          <div className="modal-field">
            <label className="modal-label">Assign to</label>
            <div className="modal-kids-row">
              {allKids.map(k => (
                <button
                  key={k.id}
                  className={`modal-kid-chip${assignedKids.includes(k.id) ? " active" : ""}`}
                  style={{ "--accent": k.accentColour, "--accent-light": k.accentLight || k.accentColour }}
                  onClick={() => toggleKid(k.id)}
                >
                  <span className="modal-kid-avatar">{k.name[0]}</span>
                  {k.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Library toggle */}
        <div className="modal-taskLibrary-row">
          <button
            className={`modal-lib-toggle${showLibrary ? " active" : ""}`}
            onClick={() => setShowLibrary(p => !p)}
          >☰ Task Library {taskLibrary.length > 0 ? `(${taskLibrary.length})` : ""}</button>
        </div>

        {/* Library list */}
        {showLibrary && (
          <div className="modal-taskLibrary">
            {taskLibrary.length === 0 && <p className="modal-lib-empty">No saved tasks yet. Save tasks to build your taskLibrary.</p>}
            {taskLibrary.map((t, i) => (
              <button key={i} className="modal-lib-item" onClick={() => {
                setTitle(t.title);
                setSchedule(t.schedule);
                setTime(t.time);
                setPoints(t.points);
                setCustomPoints("");
                setShowLibrary(false);
              }}>
                <span className="modal-lib-title">{t.title}</span>
                <span className="modal-lib-meta">{t.schedule} • {t.time} • {t.points}pts</span>
              </button>
            ))}
          </div>
        )}

        {/* Actions */}
        <div className="modal-actions">
          <button className="modal-cancel-btn" onClick={onClose}>Cancel</button>
          <button className="modal-submit-btn" onClick={handleSubmit}>Add Task ✦</button>
        </div>
      {/* Save prompt */}
        {showSavePrompt && (
          <div className="modal-save-prompt">
            <p className="modal-save-question">💾 Save <strong>"{pendingTask?.title}"</strong> to your task taskLibrary?</p>
            <div className="modal-save-actions">
              <button className="modal-save-yes" onClick={() => {
                setTaskLibrary(prev => {
                  const updated = [pendingTask, ...prev];
                  return updated.slice(0, 30);
                });
                setShowSavePrompt(false);
                onClose();
              }}>Yes, save it</button>
              <button className="modal-save-no" onClick={() => { setShowSavePrompt(false); onClose(); }}>No thanks</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
