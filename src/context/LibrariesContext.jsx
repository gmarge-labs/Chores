import React, { createContext, useContext, useState } from "react";

const LibrariesContext = createContext(null);

export function LibrariesProvider({ children }) {
  const [bonusLibrary, setBonusLibrary] = useState([]);
  const [taskLibrary, setTaskLibrary] = useState([]);
  const [rewardLibrary, setRewardLibrary] = useState([]);

  const value = {
    bonusLibrary, setBonusLibrary,
    taskLibrary, setTaskLibrary,
    rewardLibrary, setRewardLibrary,
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
