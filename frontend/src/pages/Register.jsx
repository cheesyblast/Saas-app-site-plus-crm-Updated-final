import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useCompany } from "@/lib/company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { formatApiErrorDetail } from "@/lib/errors";

export default function Register() {
  const { register, loginWithGoogle } = useAuth();
  const { company } = useCompany();
  const googleEnabled = !!company?.auth_google_enabled;
  const nav = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirm) return toast.error("Passwords don't match");
    if (form.password.length < 8) return toast.error("Password must be 8+ characters");
    setBusy(true);
    try {
      await register({ name: form.name, email: form.email, phone: form.phone || null, password: form.password });
      toast.success("Account created");
      nav("/account");
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Registration failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden bg-zinc-950 flex items-center justify-center px-4 py-10">
      <div className="absolute inset-0 grain-bg opacity-30" />
      <div className="relative z-10 w-full max-w-sm border border-zinc-800 bg-zinc-950/80 backdrop-blur-xl p-8">
        <div className="text-[var(--theme-primary,#FF3B30)] text-[10px] font-heading uppercase tracking-[0.5em] mb-3">Get Started</div>
        <h1 className="font-heading text-3xl font-black uppercase tracking-tighter mb-6">Create Account</h1>

        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-widest text-zinc-400">Full Name *</Label>
            <Input data-testid="register-name" value={form.name} onChange={(e) => set("name", e.target.value)} required className="bg-zinc-900 border-zinc-800 rounded-none mt-1" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-zinc-400">Email *</Label>
            <Input data-testid="register-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} required className="bg-zinc-900 border-zinc-800 rounded-none mt-1" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-zinc-400">Phone</Label>
            <Input data-testid="register-phone" value={form.phone} onChange={(e) => set("phone", e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" placeholder="+94 7X XXX XXXX" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-zinc-400">Password *</Label>
            <Input data-testid="register-password" type="password" value={form.password} onChange={(e) => set("password", e.target.value)} required className="bg-zinc-900 border-zinc-800 rounded-none mt-1" placeholder="8+ characters" />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-widest text-zinc-400">Confirm *</Label>
            <Input data-testid="register-confirm" type="password" value={form.confirm} onChange={(e) => set("confirm", e.target.value)} required className="bg-zinc-900 border-zinc-800 rounded-none mt-1" />
          </div>
          <Button data-testid="register-submit" disabled={busy} type="submit" className="w-full bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none font-heading font-bold uppercase tracking-widest py-5">
            {busy ? "Creating..." : "Create Account"}
          </Button>
        </form>

        {googleEnabled && (<>
          <div className="flex items-center gap-3 my-5">
            <div className="flex-1 h-px bg-zinc-800" />
            <span className="text-[10px] font-heading uppercase tracking-[0.3em] text-zinc-600">or</span>
            <div className="flex-1 h-px bg-zinc-800" />
          </div>
          <Button data-testid="register-google-btn" onClick={loginWithGoogle} className="w-full bg-white text-black hover:bg-zinc-200 rounded-none font-bold uppercase tracking-widest py-5 flex items-center gap-3">
            <svg className="h-4 w-4" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Sign up with Google
          </Button>
        </>)}

        <div className="text-[11px] text-zinc-500 mt-6 text-center">
          Already have an account? <Link to="/login" className="text-white">Sign in</Link>
        </div>
      </div>
    </div>
  );
}
