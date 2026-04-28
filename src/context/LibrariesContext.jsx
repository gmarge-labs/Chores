import React, { createContext, useContext, useState } from "react";

const LibrariesContext = createContext(null);

// Mock initial quest so the UI has something to show out of the box.
// Replace with Firestore later.
const INITIAL_QUEST = {
  id: "q1",
  title: "Pizza Friday",
  emoji: "🍕",
  description: "Family pizza night when we hit the goal!",
  goal: 200,
  contributions: [], // [{kidId, points, ts}]
  createdAt: Date.now(),
};

export function LibrariesProvider({ children }) {
  const [bonusLibrary, setBonusLibrary] = useState([]);
  const [taskLibrary, setTaskLibrary] = useState([]);
  const [rewardLibrary, setRewardLibrary] = useState([]);
  const [activeQuest, setActiveQuest] = useState(INITIAL_QUEST);
  const [questHistory, setQuestHistory] = useState([]);

  // Helper to add a contribution and auto-complete if goal reached.
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
