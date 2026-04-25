import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Lock, ArrowRight, ArrowLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { formatApiErrorDetail } from "@/lib/errors";

const CURRENCIES = ["LKR", "USD", "EUR", "GBP", "INR", "AUD"];

export default function Setup() {
  const nav = useNavigate();
  const { setUser } = useAuth();
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    company_name: "",
    tagline: "",
    company_email: "",
    company_phone: "",
    company_address: "",
    currency: "LKR",
    admin_name: "",
    admin_email: "",
    admin_password: "",
    admin_password_confirm: "",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const next = () => {
    if (step === 1 && !form.company_name) return toast.error("Company name required");
    setStep(step + 1);
  };

  const submit = async () => {
    if (!form.admin_email || !form.admin_password) return toast.error("Email & password required");
    if (form.admin_password.length < 8) return toast.error("Password must be at least 8 characters");
    if (form.admin_password !== form.admin_password_confirm) return toast.error("Passwords do not match");
    setBusy(true);
    try {
      const { data } = await api.post("/setup/init", {
        company_name: form.company_name,
        tagline: form.tagline || null,
        company_email: form.company_email || null,
        company_phone: form.company_phone || null,
        company_address: form.company_address || null,
        currency: form.currency,
        admin_email: form.admin_email,
        admin_name: form.admin_name || form.admin_email.split("@")[0],
        admin_password: form.admin_password,
      });
      setUser(data.user);
      toast.success("Welcome aboard! Setting up your store...");
      // Hard nav so SetupGate re-evaluates with fresh status
      window.location.replace("/admin");
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail) || "Setup failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col">
      <div className="absolute inset-0 grain-bg opacity-30 pointer-events-none" />
      <div className="relative flex-1 flex items-center justify-center px-4 py-10">
        <div className="w-full max-w-2xl">
          <div className="mb-10 text-center">
            <div className="text-[var(--theme-primary,#FF3B30)] text-[10px] font-heading uppercase tracking-[0.5em] mb-3">
              First-time setup
            </div>
            <h1 className="font-heading text-4xl sm:text-5xl font-black uppercase tracking-tighter">
              Welcome.
            </h1>
            <p className="text-zinc-400 mt-3">Three quick steps and your store is live.</p>
          </div>

          {/* Stepper */}
          <div className="flex items-center justify-center gap-3 mb-10">
            {[1, 2, 3].map((n) => (
              <React.Fragment key={n}>
                <div
                  data-testid={`setup-step-indicator-${n}`}
                  className={`h-9 w-9 flex items-center justify-center border-2 font-heading font-bold text-sm transition-all ${
                    step >= n ? "bg-[var(--theme-primary,#FF3B30)] border-[var(--theme-primary,#FF3B30)] text-white" : "border-zinc-700 text-zinc-600"
                  }`}
                >
                  {step > n ? <Check className="h-4 w-4" /> : n}
                </div>
                {n < 3 && <div className={`h-0.5 w-12 ${step > n ? "bg-[var(--theme-primary,#FF3B30)]" : "bg-zinc-800"}`} />}
              </React.Fragment>
            ))}
          </div>

          <div className="border border-zinc-800 bg-zinc-950/80 backdrop-blur p-8">
            {step === 1 && (
              <div className="space-y-5">
                <div className="flex items-center gap-3 mb-4">
                  <Building2 className="h-5 w-5 text-[var(--theme-primary,#FF3B30)]" />
                  <h2 className="font-heading uppercase tracking-widest text-sm">Company Details</h2>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Label className="text-xs uppercase tracking-widest text-zinc-400">Company / Brand Name *</Label>
                    <Input data-testid="setup-company-name" value={form.company_name} onChange={(e) => set("company_name", e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" placeholder="Acme Apparel Co." />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs uppercase tracking-widest text-zinc-400">Tagline</Label>
                    <Input data-testid="setup-tagline" value={form.tagline} onChange={(e) => set("tagline", e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" placeholder="Quietly bold. Sharply cut." />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-widest text-zinc-400">Currency</Label>
                    <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
                      <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1" data-testid="setup-currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-5">
                <div className="flex items-center gap-3 mb-4">
                  <Building2 className="h-5 w-5 text-[var(--theme-primary,#FF3B30)]" />
                  <h2 className="font-heading uppercase tracking-widest text-sm">Contact Info (optional)</h2>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs uppercase tracking-widest text-zinc-400">Email</Label>
                    <Input data-testid="setup-company-email" value={form.company_email} onChange={(e) => set("company_email", e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" placeholder="hello@yourbrand.com" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-widest text-zinc-400">Phone</Label>
                    <Input data-testid="setup-company-phone" value={form.company_phone} onChange={(e) => set("company_phone", e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" placeholder="+94 11 234 5678" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs uppercase tracking-widest text-zinc-400">Address</Label>
                    <Textarea data-testid="setup-company-address" value={form.company_address} onChange={(e) => set("company_address", e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" placeholder="123 Galle Road, Colombo 03, Sri Lanka" />
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="space-y-5">
                <div className="flex items-center gap-3 mb-4">
                  <Lock className="h-5 w-5 text-[var(--theme-primary,#FF3B30)]" />
                  <h2 className="font-heading uppercase tracking-widest text-sm">Owner / Admin Account</h2>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2">
                    <Label className="text-xs uppercase tracking-widest text-zinc-400">Your Name *</Label>
                    <Input data-testid="setup-admin-name" value={form.admin_name} onChange={(e) => set("admin_name", e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" />
                  </div>
                  <div className="sm:col-span-2">
                    <Label className="text-xs uppercase tracking-widest text-zinc-400">Email *</Label>
                    <Input data-testid="setup-admin-email" type="email" value={form.admin_email} onChange={(e) => set("admin_email", e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-widest text-zinc-400">Password *</Label>
                    <Input data-testid="setup-admin-password" type="password" value={form.admin_password} onChange={(e) => set("admin_password", e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" placeholder="8+ characters" />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-widest text-zinc-400">Confirm *</Label>
                    <Input data-testid="setup-admin-password-confirm" type="password" value={form.admin_password_confirm} onChange={(e) => set("admin_password_confirm", e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" />
                  </div>
                </div>
                <div className="text-xs text-zinc-500 leading-relaxed border-l-2 border-zinc-800 pl-3 mt-2">
                  This account becomes your <span className="text-white">Super Admin</span>. You can add staff and customize everything from the admin panel after setup.
                </div>
              </div>
            )}

            <div className="flex justify-between items-center mt-8 pt-6 border-t border-zinc-900">
              {step > 1 ? (
                <Button data-testid="setup-back-btn" variant="outline" onClick={() => setStep(step - 1)} className="rounded-none border-zinc-700 bg-transparent hover:bg-zinc-900 uppercase tracking-widest text-xs gap-2">
                  <ArrowLeft className="h-3 w-3" /> Back
                </Button>
              ) : <span />}
              {step < 3 ? (
                <Button data-testid="setup-next-btn" onClick={next} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none font-heading font-bold uppercase tracking-widest gap-2">
                  Continue <ArrowRight className="h-3 w-3" />
                </Button>
              ) : (
                <Button data-testid="setup-finish-btn" disabled={busy} onClick={submit} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none font-heading font-bold uppercase tracking-widest gap-2">
                  {busy ? "Setting up..." : <>Launch Store <ArrowRight className="h-3 w-3" /></>}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
