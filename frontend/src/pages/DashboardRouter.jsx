import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";

export default function DashboardRouter() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      nav("/login");
    } else if (user.role === "customer") {
      nav("/account");
    } else {
      nav("/admin");
    }
  }, [user, loading, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950">
      <div className="inline-block h-8 w-8 border-2 border-zinc-700 border-t-[#FF3B30] rounded-full animate-spin" />
    </div>
  );
}
