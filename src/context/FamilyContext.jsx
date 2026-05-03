import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { db } from "../firebase/config";
import { doc, getDoc, setDoc, updateDoc, collection } from "firebase/firestore";

const FamilyContext = createContext(null);

export function FamilyProvider({ children }) {
  const [family, setFamily] = useState(null);
  const [kids, setKids] = useState([]);

  // Auto-load family on app mount if there's a parent session in localStorage
  useEffect(() => {
    try {
      const s = localStorage.getItem("ch_session");
      if (!s) return;
      const session = JSON.parse(s);
      if (session && session.role === "parent" && session.familyId) {
        loadFamily(session.familyId).catch(err =>
          console.warn("[FamilyContext] auto-load skipped:", err.message)
        );
      }
    } catch (err) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadFamily = useCallback(async (familyId) => {
    const snap = await getDoc(doc(db, "families", familyId));
    if (!snap.exists()) return null;
    const data = { id: snap.id, ...snap.data() };
    setFamily(data);

    // Load kids
    const kidsSnap = await Promise.all(
      (data.kidIds || []).map(kidId =>
        getDoc(doc(db, "families", familyId, "kids", kidId))
      )
    );
    setKids(kidsSnap.filter(s => s.exists()).map(s => ({ id: s.id, ...s.data() })));
    return data;
  }, []);

  const updateFamily = useCallback(async (familyId, updates) => {
    // Optimistic local update first
    setFamily(prev => ({ ...prev, ...updates }));
    // Try Firestore but do not break if offline / not wired
    try {
      await updateDoc(doc(db, "families", familyId), updates);
    } catch (err) {
      console.warn("[FamilyContext] updateFamily Firestore skipped:", err.message);
    }
  }, []);

  const updateKid = useCallback(async (familyId, kidId, updates) => {
    // Optimistic local update first
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, ...updates } : k));
    try {
      await updateDoc(doc(db, "families", familyId, "kids", kidId), updates);
    } catch (err) {
      console.warn("[FamilyContext] updateKid Firestore skipped:", err.message);
    }
  }, []);

  const getKid = useCallback((kidId) => kids.find(k => k.id === kidId), [kids]);

  return (
    <FamilyContext.Provider value={{ family, kids, loadFamily, updateFamily, updateKid, getKid, setFamily, setKids }}>
      {children}
    </FamilyContext.Provider>
  );
}

export const useFamily = () => useContext(FamilyContext);
