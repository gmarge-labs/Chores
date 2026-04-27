import { createContext, useContext, useEffect, useState } from "react";
import { auth } from "../firebase/config";
import { onAuthStateChanged, signOut } from "firebase/auth";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);
  const [session, setSessionState] = useState(() => {
    // Persist session in localStorage
    try {
      const s = localStorage.getItem("ch_session");
      return s ? JSON.parse(s) : null;
    } catch { return null; }
  });

  const setSession = (val) => {
    const next = typeof val === "function" ? val(session) : val;
    setSessionState(next);
    if (next) localStorage.setItem("ch_session", JSON.stringify(next));
    else localStorage.removeItem("ch_session");
  };

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u || null);
      // Only clear parent sessions when Firebase auth is gone.
      // Kid sessions (PIN-based) live independently of Firebase auth.
      if (!u) {
        setSessionState(prev => {
          if (prev && prev.role === "kid") return prev;
          localStorage.removeItem("ch_session");
          return null;
        });
      }
    });
    return unsub;
  }, []);

  const logout = async () => {
    await signOut(auth);
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, setSession, logout, loading: user === undefined }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
