import React, { createContext, useContext, useState, useEffect } from "react";

const LibrariesContext = createContext(null);

const STORAGE_KEY = "ch_active_quest_v1";
const HISTORY_KEY = "ch_quest_history_v1";

// Mock initial quest used only when nothing's in storage.
const INITIAL_QUEST = {
  id: "q1",
  title: "Pizza Friday",
  emoji: "🍕",
  description: "Family pizza night when we hit the goal!",
  goal: 200,
  contributions: [],
  createdAt: Date.now(),
};

function loadQuest() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return INITIAL_QUEST;
    if (raw === "null") return null;
    return JSON.parse(raw);
  } catch (e) {
    return INITIAL_QUEST;
  }
}

function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

export function LibrariesProvider({ children }) {
  const [bonusLibrary, setBonusLibrary] = useState([]);
  const [taskLibrary, setTaskLibrary] = useState([]);
  const [rewardLibrary, setRewardLibrary] = useState([]);
  const [activeQuest, setActiveQuest] = useState(loadQuest);
  const [questHistory, setQuestHistory] = useState(loadHistory);

  // Persist whenever quest changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, activeQuest === null ? "null" : JSON.stringify(activeQuest));
    } catch (e) {}
  }, [activeQuest]);

  useEffect(() => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(questHistory));
    } catch (e) {}
  }, [questHistory]);

  const contributeToQuest = (kidId, points) => {
    setActiveQuest(prev => {
      if (!prev) return prev;
      const next = {
        ...prev,
        contributions: [...prev.contributions, { kidId, points, ts: Date.now() }],
      };
      const total = next.contributions.reduce((sum, c) => sum + c.points, 0);
      if (total >= prev.goal && !next.completedAt) {
        next.completedAt = Date.now();
      }
      return next;
    });
  };

  const archiveActiveQuest = () => {
    setActiveQuest(prev => {
      if (prev) setQuestHistory(h => [{ ...prev, archivedAt: Date.now() }, ...h]);
      return null;
    });
  };

  const value = {
    bonusLibrary, setBonusLibrary,
    taskLibrary, setTaskLibrary,
    rewardLibrary, setRewardLibrary,
    activeQuest, setActiveQuest,
    questHistory, setQuestHistory,
    contributeToQuest,
    archiveActiveQuest,
  };

  return (
    <LibrariesContext.Provider value={value}>
      {children}
    </LibrariesContext.Provider>
  );
}

export function useLibraries() {
  const ctx = useContext(LibrariesContext);
  if (!ctx) {
    throw new Error("useLibraries must be used inside a LibrariesProvider");
  }
  return ctx;
}
