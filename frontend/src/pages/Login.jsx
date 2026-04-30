import React, { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useCompany } from "@/lib/company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Lock, Mail } from "lucide-react";
import { toast } from "sonner";
import { formatApiErrorDetail } from "@/lib/errors";

export default function Login({ adminMode = false }) {
  const { loginWithPassword, loginWithGoogle } = useAuth();
  const { company } = useCompany();
  const googleEnabled = !!company?.auth_google_enabled;
  const nav = useNavigate();
  const loc = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!email || !password) return toast.error("Email & password required");
    setBusy(true);
    try {
      const u = await loginWithPassword(email, password);
      toast.success(`Welcome back, ${u.name}`);
      const next = new URLSearchParams(loc.search).get("next");
      if (next) return nav(next);
      nav(u.role === "customer" ? "/account" : "/admin");
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-zinc-950 flex items-center justify-center px-4">
      <div className="absolute inset-0 grain-bg opacity-30" />
      <div className="relative z-10 w-full max-w-sm border border-zinc-800 bg-zinc-950/80 backdrop-blur-xl">
        <div className="p-8 border-b border-zinc-900">
          <div className="text-[var(--theme-primary,#FF3B30)] text-[10px] font-heading uppercase tracking-[0.5em] mb-3">
            {adminMode ? "Staff Portal" : "Welcome"}
          </div>
          <h1 className="font-heading text-3xl font-black uppercase tracking-tighter mb-2">
            {adminMode ? "Admin Sign In" : "Sign In"}
          </h1>
          <p className="text-xs text-zinc-500 mb-6">
            {adminMode ? "Email & password access for staff." : "Track your orders & manage your details."}
          </p>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Email</Label>
              <Input data-testid="login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                     className="bg-zinc-900 border-zinc-800 rounded-none mt-1" autoComplete="email" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Password</Label>
              <Input data-testid="login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                     className="bg-zinc-900 border-zinc-800 rounded-none mt-1" autoComplete="current-password" />
            </div>
            <Button data-testid="login-submit" type="submit" disabled={busy}
                    className="w-full bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none font-heading font-bold uppercase tracking-widest py-5">
              {busy ? "Signing in..." : "Sign In"}
            </Button>
          </form>

          {!adminMode && googleEnabled && (
            <>
              <div className="flex items-center gap-3 my-6">
                <div className="flex-1 h-px bg-zinc-800" />
                <span className="text-[10px] font-heading uppercase tracking-[0.3em] text-zinc-600">or</span>
                <div className="flex-1 h-px bg-zinc-800" />
              </div>
              <Button data-testid="login-google-btn" onClick={loginWithGoogle}
                      className="w-full bg-white text-black hover:bg-zinc-200 rounded-none font-bold uppercase tracking-widest py-5 flex items-center gap-3">
                <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Continue with Google
              </Button>
            </>
          )}

          <div className="text-[11px] text-zinc-500 mt-6 flex items-center justify-between">
            {!adminMode ? (
              <Link to="/register" className="hover:text-white">Create an account</Link>
            ) : <span />}
            <Link to={adminMode ? "/login" : "/admin/login"} className="hover:text-white">
              {adminMode ? "Customer Sign-In" : "Admin Sign-In"}
            </Link>
          </div>
        </div>
        <div className="px-8 py-3 border-t border-zinc-900 flex items-center justify-between text-[10px] font-heading uppercase tracking-[0.3em] text-zinc-600">
          <Link to="/" className="hover:text-zinc-300 flex items-center gap-1"><ArrowLeft className="h-3 w-3" /> Storefront</Link>
        </div>
      </div>
    </div>
  );
}
