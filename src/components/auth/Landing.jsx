import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useEffect } from "react";
import RainbowTitle from "../shared/RainbowTitle";
import Button from "../shared/Button";
import "./Landing.css";

export default function Landing() {
  const { user, session } = useAuth();
  const navigate = useNavigate();

  // If already logged in, go straight to dashboard
  useEffect(() => {
    if (user && session?.role === "parent") navigate("/family");
    if (user && session?.role === "kid") navigate("/kid");
  }, [user, session, navigate]);

  return (
    <div className="landing">
      <div className="landing__content">
        <RainbowTitle subtitle="Family Task Tracker" size="lg" />

        <div className="glass-card landing__card">
          <div className="landing__buttons">
            <Button variant="secondary" size="lg" fullWidth onClick={() => navigate("/create")}>
              🚀 Start free trial
            </Button>
            <Button variant="success" size="lg" fullWidth onClick={() => navigate("/login")}>
              Log in
            </Button>
          </div>

          <div className="landing__links">
            <a href="/privacy.html" className="landing__link">Privacy Policy</a>
            <span>·</span>
            <a href="/terms.html" className="landing__link">Terms of Service</a>
          </div>
        </div>
      </div>

      {/* Decorative bubbles */}
      <div className="bubble bubble--1" />
      <div className="bubble bubble--2" />
      <div className="bubble bubble--3" />
    </div>
  );
}
