import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const hasProcessed = useRef(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash || "";
    const match = hash.match(/session_id=([^&]+)/);
    if (!match) {
      navigate("/login");
      return;
    }
    const session_id = match[1];
    (async () => {
      try {
        const { data } = await api.post("/auth/session", { session_id });
        setUser(data.user);
        // Clean URL
        window.history.replaceState(null, "", "/dashboard");
        // route based on role
        if (data.user.role === "customer") {
          navigate("/account", { state: { user: data.user } });
        } else {
          navigate("/admin", { state: { user: data.user } });
        }
      } catch (e) {
        setError("Authentication failed. Please try again.");
        setTimeout(() => navigate("/login"), 1500);
      }
    })();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="text-center">
        <div className="inline-block h-10 w-10 border-2 border-zinc-700 border-t-[#FF3B30] rounded-full animate-spin mb-4" />
        <p className="font-heading uppercase tracking-[0.3em] text-xs text-zinc-400">
          {error || "Authenticating"}
        </p>
      </div>
    </div>
  );
}
