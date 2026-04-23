import { createContext, useContext, useState, useCallback } from "react";
import { db } from "../firebase/config";
import { doc, getDoc, setDoc, updateDoc, collection } from "firebase/firestore";

const FamilyContext = createContext(null);

export function FamilyProvider({ children }) {
  const [family, setFamily] = useState(null);
  const [kids, setKids] = useState([]);

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
    await updateDoc(doc(db, "families", familyId), updates);
    setFamily(prev => ({ ...prev, ...updates }));
  }, []);

  const updateKid = useCallback(async (familyId, kidId, updates) => {
    await updateDoc(doc(db, "families", familyId, "kids", kidId), updates);
    setKids(prev => prev.map(k => k.id === kidId ? { ...k, ...updates } : k));
  }, []);

  const getKid = useCallback((kidId) => kids.find(k => k.id === kidId), [kids]);

  return (
    <FamilyContext.Provider value={{ family, kids, loadFamily, updateFamily, updateKid, getKid, setFamily, setKids }}>
      {children}
    </FamilyContext.Provider>
  );
}

export const useFamily = () => useContext(FamilyContext);
