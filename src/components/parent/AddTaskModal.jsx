import { useState } from "react";
import { useLibraries } from "../../context/LibrariesContext";
import "./AddTaskModal.css";
import { REWARD_ICONS } from "../shared/icons";

const SCHEDULES = ["Daily", "Weekly", "One-time"];
const TIMES = ["5:30 AM","6:00 AM","7:00 AM","8:00 AM","9:00 AM","10:00 AM","11:00 AM","12:00 PM","1:00 PM","2:00 PM","3:00 PM","4:00 PM","5:00 PM","6:00 PM","7:00 PM","8:00 PM","9:00 PM"];
const POINTS = [1,2,3,5,10,15,20,25,50];

export default function AddTaskModal({ kid, accent, allKids, onAdd, onClose }) {
  const { taskLibrary, setTaskLibrary } = useLibraries();
  const [title, setTitle] = useState("");
  const [schedule, setSchedule] = useState("Daily");
  const [time, setTime] = useState("8:00 AM");
  const [points, setPoints] = useState(5);
  const [newTaskEmoji, setNewTaskEmoji] = useState("📝");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [error, setError] = useState("");
  const [customPoints, setCustomPoints] = useState("");
  // taskLibrary state is lifted to parent (KidDetail) via taskLibrary / setTaskLibrary props
  const [showLibrary, setShowLibrary] = useState(false);
  const [saveToLib, setSaveToLib] = useState(true);
  const [justAdded, setJustAdded] = useState(false);
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
    const task = { id: "t" + Date.now(), emoji: newTaskEmoji, title: title.trim(), meta: `${schedule} • ${time}`, points: finalPoints };
    onAdd(task, assignedKids);
    if (saveToLib) {
      const libTask = { emoji: newTaskEmoji, title: title.trim(), schedule, time, points: finalPoints };
      setTaskLibrary(prev => {
        const exists = prev.some(t => t.title.trim().toLowerCase() === libTask.title.toLowerCase());
        if (exists) return prev;
        return [libTask, ...prev].slice(0, 30);
      });
    }
    setJustAdded(true);
    setTimeout(() => { setJustAdded(false); onClose(); }, 1100);
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

        {/* Task icon */}
        <div className="modal-field" style={{ position: "relative" }}>
          <label className="modal-label">Pick an icon</label>
          <button
            type="button"
            className="settings-reward-icon-trigger"
            onClick={() => setIconPickerOpen(o => !o)}
            aria-expanded={iconPickerOpen}
          >
            <span className="settings-reward-icon-trigger-emoji">{newTaskEmoji}</span>
            <span className="settings-reward-icon-trigger-label">Choose icon</span>
            <span className={"settings-reward-icon-trigger-caret" + (iconPickerOpen ? " open" : "")}>▾</span>
          </button>
          {iconPickerOpen && (
            <div className="settings-reward-icon-panel">
              {REWARD_ICONS.map(ico => (
                <button
                  key={ico}
                  type="button"
                  className={"settings-reward-icon-btn" + (newTaskEmoji === ico ? " active" : "")}
                  onClick={() => { setNewTaskEmoji(ico); setIconPickerOpen(false); }}
                  aria-label={`Pick ${ico}`}
                >{ico}</button>
              ))}
            </div>
          )}
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

        {/* Library toggle + Save-to-library pill */}
        <div className="modal-taskLibrary-row">
          <button
            className={`modal-lib-toggle${showLibrary ? " active" : ""}`}
            onClick={() => setShowLibrary(p => !p)}
          >☰ Task Library {taskLibrary.length > 0 ? `(${taskLibrary.length})` : ""}</button>
          <button
            type="button"
            className={`modal-save-pill${saveToLib ? " active" : ""}`}
            onClick={() => setSaveToLib(p => !p)}
            aria-pressed={saveToLib}
          >💾 Save to library {saveToLib ? "✓" : ""}</button>
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

      {justAdded && (
        <div className="modal-toast" role="status">
          <span className="modal-toast-emoji">✦</span>
          <span className="modal-toast-text">Task added!</span>
        </div>
      )}
      </div>
    </div>
  );
}
