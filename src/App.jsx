import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { LibrariesProvider } from "./context/LibrariesContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { FamilyProvider } from "./context/FamilyContext";
import Landing from "./components/auth/Landing";
import CreateAccount from "./components/auth/CreateAccount";
import Login from "./components/auth/Login";
import FamilyDashboard from "./components/parent/FamilyDashboard";
import KidDashboard from "./components/kid/KidDashboard";
import KidDetail from './components/parent/KidDetail';
import KidLogin from './components/kid/KidLogin';

function AppRoutes() {
  const { user, session, loading } = useAuth();

  if (loading) return (
    <div className="page-center">
      <div style={{ color: "white", fontSize: "1.2rem", fontWeight: 700 }}>Loading...</div>
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/create" element={<CreateAccount />} />
      <Route path="/login" element={<Login />} />
      <Route
        path="/family"
        element={user && session?.role === "parent"
          ? <FamilyDashboard />
          : <Navigate to="/" replace />}
      />
      <Route
        path="/kid"
        element={user && session?.role === "kid"
          ? <KidDashboard />
          : <Navigate to="/" replace />}
      />
      <Route path="/kid" element={<KidDashboard />} />
      <Route path="/kid-login" element={<KidLogin />} />
      <Route path="/kid-detail/:id" element={<KidDetail />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <FamilyProvider>
          <LibrariesProvider>
            <AppRoutes />
          </LibrariesProvider>
        </FamilyProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
