import React, { useEffect, useState } from "react";
import api, { BACKEND_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCompany, logoUrl } from "@/lib/company";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Trash2, Plus, Upload, Save, MapPin, CreditCard, Mail, MessageSquare, Building2, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { formatApiErrorDetail } from "@/lib/errors";

const CURRENCIES = ["LKR", "USD", "EUR", "GBP", "INR", "AUD"];

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function Settings() {
  const { user } = useAuth();
  const { company, refresh } = useCompany();
  const isOwner = user?.role === "super_admin";
  return (
    <div className="text-white">
      <div className="mb-8">
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Settings</h1>
        <p className="text-zinc-500 text-sm mt-2">Manage company, admins, integrations, shipping & payments.</p>
      </div>
      <Tabs defaultValue="company" className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800 rounded-none p-0 flex w-full overflow-x-auto">
          <TabsTrigger value="company" data-testid="settings-tab-company" className="flex-1 rounded-none data-[state=active]:bg-zinc-800 uppercase tracking-widest text-xs"><Building2 className="h-3 w-3 mr-2"/>Company</TabsTrigger>
          <TabsTrigger value="account" data-testid="settings-tab-account" className="flex-1 rounded-none data-[state=active]:bg-zinc-800 uppercase tracking-widest text-xs"><KeyRound className="h-3 w-3 mr-2"/>My Account</TabsTrigger>
          {isOwner && <TabsTrigger value="email" data-testid="settings-tab-email" className="flex-1 rounded-none data-[state=active]:bg-zinc-800 uppercase tracking-widest text-xs"><Mail className="h-3 w-3 mr-2"/>Email</TabsTrigger>}
          {isOwner && <TabsTrigger value="sms" data-testid="settings-tab-sms" className="flex-1 rounded-none data-[state=active]:bg-zinc-800 uppercase tracking-widest text-xs"><MessageSquare className="h-3 w-3 mr-2"/>SMS</TabsTrigger>}
          <TabsTrigger value="shipping" data-testid="settings-tab-shipping" className="flex-1 rounded-none data-[state=active]:bg-zinc-800 uppercase tracking-widest text-xs"><MapPin className="h-3 w-3 mr-2"/>Shipping</TabsTrigger>
          <TabsTrigger value="payments" data-testid="settings-tab-payments" className="flex-1 rounded-none data-[state=active]:bg-zinc-800 uppercase tracking-widest text-xs"><CreditCard className="h-3 w-3 mr-2"/>Payments</TabsTrigger>
        </TabsList>

        <TabsContent value="company" className="mt-6"><CompanyTab company={company} refresh={refresh}/></TabsContent>
        <TabsContent value="account" className="mt-6"><AccountTab user={user}/></TabsContent>
        {isOwner && <TabsContent value="email" className="mt-6"><IntegrationTab kind="email"/></TabsContent>}
        {isOwner && <TabsContent value="sms" className="mt-6"><IntegrationTab kind="sms"/></TabsContent>}
        <TabsContent value="shipping" className="mt-6"><ShippingTab/></TabsContent>
        <TabsContent value="payments" className="mt-6"><PaymentsTab/></TabsContent>
      </Tabs>
    </div>
  );
}

function CompanyTab({ company, refresh }) {
  const [form, setForm] = useState(company || {});
  useEffect(() => { setForm(company || {}); }, [company]);
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const [busy, setBusy] = useState(false);

  const uploadLogo = async (file, key) => {
    if (file.size > 1024 * 1024) return toast.error("Max 1MB");
    const data_base64 = await fileToBase64(file);
    const { data } = await api.post("/admin/media", { data_base64, mime_type: file.type, filename: file.name });
    set(key, data.id);
    toast.success("Logo uploaded");
  };

  const save = async () => {
    setBusy(true);
    try {
      await api.put("/admin/company", form);
      await refresh();
      toast.success("Saved");
    } catch (e) { toast.error("Save failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="border border-zinc-800 bg-zinc-950 p-6 max-w-3xl">
      <h2 className="font-heading uppercase tracking-widest text-sm mb-6">Company Profile</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Company Name *"><Input data-testid="company-name-input" value={form.company_name||""} onChange={(e)=>set("company_name",e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
        <Field label="Tagline"><Input data-testid="company-tagline-input" value={form.tagline||""} onChange={(e)=>set("tagline",e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
        <Field label="Email"><Input value={form.email||""} onChange={(e)=>set("email",e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
        <Field label="Phone"><Input value={form.phone||""} onChange={(e)=>set("phone",e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
        <Field label="Currency">
          <Select value={form.currency||"LKR"} onValueChange={(v)=>set("currency",v)}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none"><SelectValue/></SelectTrigger>
            <SelectContent>{CURRENCIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <div className="sm:col-span-2"><Field label="Address"><Textarea value={form.address||""} onChange={(e)=>set("address",e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field></div>
      </div>

      <div className="mt-8 grid sm:grid-cols-2 gap-4">
        <LogoUpload data-testid="logo-light-upload" label="Logo (Light variant — for dark backgrounds)" id={form.logo_light_id} onUpload={(f)=>uploadLogo(f, "logo_light_id")} onClear={()=>set("logo_light_id", null)} bg="bg-zinc-900"/>
        <LogoUpload data-testid="logo-dark-upload" label="Logo (Dark variant — for light backgrounds)" id={form.logo_dark_id} onUpload={(f)=>uploadLogo(f, "logo_dark_id")} onClear={()=>set("logo_dark_id", null)} bg="bg-white"/>
      </div>

      <div className="mt-8 flex justify-end">
        <Button data-testid="company-save-btn" onClick={save} disabled={busy} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none font-heading uppercase tracking-widest gap-2">
          <Save className="h-3 w-3"/>{busy?"Saving...":"Save Changes"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-widest text-zinc-400 mb-1 block">{label}</Label>
      {children}
    </div>
  );
}

function LogoUpload({ label, id, onUpload, onClear, bg, ...rest }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-widest text-zinc-400 mb-2 block">{label}</Label>
      <div className={`border border-zinc-800 p-4 ${bg} flex items-center justify-center min-h-[120px] relative`}>
        {id ? (
          <>
            <img src={logoUrl(id)} alt="logo" className="max-h-20 max-w-full object-contain"/>
            <button type="button" onClick={onClear} className="absolute top-2 right-2 bg-black/70 text-white p-1.5 hover:bg-red-500"><Trash2 className="h-3 w-3"/></button>
          </>
        ) : (
          <span className="text-zinc-500 text-xs uppercase tracking-widest">No logo</span>
        )}
      </div>
      <label className="mt-2 inline-flex items-center gap-2 text-xs uppercase tracking-widest text-zinc-300 hover:text-white cursor-pointer border border-zinc-800 px-3 py-2">
        <Upload className="h-3 w-3"/> Upload (PNG/SVG, max 1MB)
        <input {...rest} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" hidden onChange={(e)=>{const f=e.target.files?.[0]; if(f) onUpload(f);}}/>
      </label>
    </div>
  );
}

function AccountTab({ user }) {
  const [pw, setPw] = useState({ current_password: "", new_password: "", confirm: "" });
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (pw.new_password.length < 8) return toast.error("New password must be 8+ chars");
    if (pw.new_password !== pw.confirm) return toast.error("Passwords don't match");
    setBusy(true);
    try {
      await api.post("/auth/change-password", { current_password: pw.current_password, new_password: pw.new_password });
      toast.success("Password updated");
      setPw({ current_password: "", new_password: "", confirm: "" });
    } catch (err) {
      toast.error(formatApiErrorDetail(err?.response?.data?.detail) || "Failed");
    } finally { setBusy(false); }
  };
  return (
    <div className="border border-zinc-800 bg-zinc-950 p-6 max-w-md">
      <h2 className="font-heading uppercase tracking-widest text-sm mb-2">My Account</h2>
      <p className="text-xs text-zinc-500 mb-6">Signed in as <span className="text-white">{user?.email}</span> ({user?.role?.replace("_", " ")})</p>
      <form onSubmit={submit} className="space-y-4">
        <Field label="Current Password"><Input data-testid="current-password" type="password" value={pw.current_password} onChange={(e)=>setPw(p=>({...p,current_password:e.target.value}))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
        <Field label="New Password"><Input data-testid="new-password" type="password" value={pw.new_password} onChange={(e)=>setPw(p=>({...p,new_password:e.target.value}))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
        <Field label="Confirm New Password"><Input data-testid="confirm-password" type="password" value={pw.confirm} onChange={(e)=>setPw(p=>({...p,confirm:e.target.value}))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
        <Button data-testid="save-password-btn" disabled={busy} type="submit" className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none font-heading uppercase tracking-widest">{busy?"Saving...":"Update Password"}</Button>
      </form>
    </div>
  );
}

const EMAIL_PROVIDERS = [
  { value: "smtp", label: "SMTP (any provider)", fields: [
    { key: "host", label: "SMTP Host" }, { key: "port", label: "Port", type: "number" },
    { key: "username", label: "Username" }, { key: "password", label: "Password", type: "password" },
    { key: "from_email", label: "From email" }, { key: "from_name", label: "From name" },
    { key: "use_tls", label: "Use TLS", type: "switch" }
  ]},
  { value: "sendgrid", label: "SendGrid", fields: [
    { key: "api_key", label: "API Key", type: "password" },
    { key: "from_email", label: "From email" }, { key: "from_name", label: "From name" }
  ]},
  { value: "brevo", label: "Brevo (Sendinblue)", fields: [
    { key: "api_key", label: "API Key", type: "password" },
    { key: "from_email", label: "From email" }, { key: "from_name", label: "From name" }
  ]},
];
const SMS_PROVIDERS = [
  { value: "twilio", label: "Twilio", fields: [
    { key: "account_sid", label: "Account SID" }, { key: "auth_token", label: "Auth Token", type: "password" },
    { key: "from_number", label: "From Number" }
  ]},
  { value: "notifylk", label: "Notify.lk", fields: [
    { key: "user_id", label: "User ID" }, { key: "api_key", label: "API Key", type: "password" },
    { key: "sender_id", label: "Sender ID" }
  ]},
];

function IntegrationTab({ kind }) {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const providers = kind === "email" ? EMAIL_PROVIDERS : SMS_PROVIDERS;

  const load = async () => {
    const { data } = await api.get("/admin/integrations");
    setItems(data.filter((i) => i.kind === kind));
  };
  useEffect(() => { load(); }, [kind]);

  const create = () => setEditing({ kind, provider: providers[0].value, label: "", config: {}, active: true, is_default: items.filter(i=>i.is_default).length === 0 });

  const save = async () => {
    try {
      if (editing.id) await api.put(`/admin/integrations/${editing.id}`, editing);
      else await api.post("/admin/integrations", editing);
      setEditing(null); load();
      toast.success("Saved");
    } catch (e) { toast.error(formatApiErrorDetail(e?.response?.data?.detail) || "Failed"); }
  };
  const del = async (id) => { if (!window.confirm("Delete this integration?")) return; await api.delete(`/admin/integrations/${id}`); load(); };

  const provDef = editing && providers.find((p) => p.value === editing.provider);

  return (
    <div className="border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-heading uppercase tracking-widest text-sm">{kind === "email" ? "Email" : "SMS"} Providers</h2>
          <p className="text-xs text-zinc-500 mt-1">Configure {kind === "email" ? "SMTP, SendGrid, Brevo" : "Twilio, Notify.lk"}. Marked as default = used to send order updates.</p>
        </div>
        <Button data-testid={`add-${kind}-integration`} onClick={create} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none font-heading uppercase tracking-widest gap-2"><Plus className="h-3 w-3"/>Add Provider</Button>
      </div>
      <div className="space-y-3">
        {items.length === 0 && <div className="text-zinc-600 text-sm py-8 text-center border border-dashed border-zinc-900">No providers configured.</div>}
        {items.map((i) => (
          <div key={i.id} className="border border-zinc-800 p-4 flex items-center justify-between hover:border-zinc-600">
            <div>
              <div className="font-heading uppercase tracking-widest text-sm flex items-center gap-2">
                {providers.find(p=>p.value===i.provider)?.label || i.provider}
                {i.is_default && <span className="text-[10px] bg-[var(--theme-primary,#FF3B30)] px-2 py-0.5">DEFAULT</span>}
                {!i.active && <span className="text-[10px] bg-zinc-700 px-2 py-0.5">DISABLED</span>}
              </div>
              {i.label && <div className="text-xs text-zinc-500 mt-1">{i.label}</div>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={()=>setEditing(i)} className="rounded-none border-zinc-700 bg-transparent uppercase tracking-widest text-xs">Edit</Button>
              <Button variant="outline" onClick={()=>del(i.id)} className="rounded-none border-zinc-700 bg-transparent text-red-400 hover:bg-red-900/20 uppercase tracking-widest text-xs"><Trash2 className="h-3 w-3"/></Button>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o)=>!o && setEditing(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-none max-w-md text-white">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest text-sm">{editing?.id ? "Edit" : "Add"} {kind} Provider</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <Field label="Provider">
                <Select value={editing.provider} onValueChange={(v)=>setEditing(e=>({...e, provider: v, config: {}}))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none"><SelectValue/></SelectTrigger>
                  <SelectContent>{providers.map(p=><SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Label (optional)"><Input value={editing.label||""} onChange={(e)=>setEditing(s=>({...s, label:e.target.value}))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
              {provDef?.fields.map((f) => (
                <Field key={f.key} label={f.label}>
                  {f.type === "switch" ? (
                    <Switch checked={!!editing.config?.[f.key]} onCheckedChange={(v)=>setEditing(s=>({...s, config:{...s.config, [f.key]: v}}))}/>
                  ) : (
                    <Input type={f.type||"text"} value={editing.config?.[f.key]||""} onChange={(e)=>setEditing(s=>({...s, config:{...s.config, [f.key]: e.target.value}}))} className="bg-zinc-900 border-zinc-800 rounded-none"/>
                  )}
                </Field>
              ))}
              <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
                <Label className="text-xs uppercase tracking-widest">Active</Label>
                <Switch checked={editing.active} onCheckedChange={(v)=>setEditing(s=>({...s, active:v}))}/>
              </div>
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-widest">Default for {kind}</Label>
                <Switch checked={editing.is_default} onCheckedChange={(v)=>setEditing(s=>({...s, is_default:v}))}/>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={()=>setEditing(null)} className="rounded-none">Cancel</Button>
            <Button onClick={save} className="bg-[var(--theme-primary,#FF3B30)] rounded-none font-heading uppercase tracking-widest" data-testid={`save-${kind}-integration`}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShippingTab() {
  const [rules, setRules] = useState([]);
  const [districts, setDistricts] = useState([]);
  const [byDistrict, setByDistrict] = useState({});
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const [{ data: r }, { data: l }] = await Promise.all([api.get("/admin/shipping/rules"), api.get("/locations")]);
    setRules(r); setDistricts(l.districts); setByDistrict(l.by_district);
  };
  useEffect(() => { load(); }, []);

  const create = () => setEditing({ district: null, city: null, fee: 350, free_above: null, label: "", active: true, sort_order: 0 });

  const save = async () => {
    try {
      const payload = { ...editing, district: editing.district || null, city: editing.city || null,
                        fee: parseFloat(editing.fee) || 0, free_above: editing.free_above ? parseFloat(editing.free_above) : null };
      if (editing.id) await api.put(`/admin/shipping/rules/${editing.id}`, payload);
      else await api.post("/admin/shipping/rules", payload);
      setEditing(null); load();
      toast.success("Saved");
    } catch (e) { toast.error("Failed"); }
  };
  const del = async (id) => { if (!window.confirm("Delete?")) return; await api.delete(`/admin/shipping/rules/${id}`); load(); };

  const cities = editing?.district ? (byDistrict[editing.district] || []) : [];

  return (
    <div className="border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="font-heading uppercase tracking-widest text-sm">Shipping Rules</h2>
          <p className="text-xs text-zinc-500 mt-1">Set delivery charges by district / city. Leave both blank for fallback default.</p>
        </div>
        <Button data-testid="add-shipping-rule" onClick={create} className="bg-[var(--theme-primary,#FF3B30)] rounded-none font-heading uppercase tracking-widest gap-2"><Plus className="h-3 w-3"/>Add Rule</Button>
      </div>

      <div className="border border-zinc-800">
        <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr_auto] gap-3 p-3 border-b border-zinc-800 bg-zinc-900 text-[10px] uppercase tracking-widest text-zinc-400">
          <span>District</span><span>City</span><span>Fee</span><span>Free Above</span><span>Status</span><span></span>
        </div>
        {rules.length === 0 && <div className="p-8 text-center text-zinc-600 text-sm">No rules. Add a default rule (no district + city) to charge a flat rate.</div>}
        {rules.map((r) => (
          <div key={r.id} className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr_auto] gap-3 p-3 border-b border-zinc-900 items-center text-sm">
            <span>{r.district || <em className="text-zinc-500">Any</em>}</span>
            <span>{r.city || <em className="text-zinc-500">Any</em>}</span>
            <span className="font-mono">{r.fee.toFixed(2)}</span>
            <span className="font-mono text-xs">{r.free_above != null ? r.free_above.toFixed(2) : "—"}</span>
            <span className={`text-xs uppercase tracking-widest ${r.active?"text-green-400":"text-zinc-500"}`}>{r.active?"Active":"Off"}</span>
            <span className="flex gap-1">
              <Button size="sm" variant="outline" onClick={()=>setEditing(r)} className="rounded-none h-8 text-xs">Edit</Button>
              <Button size="sm" variant="outline" onClick={()=>del(r.id)} className="rounded-none h-8 text-red-400 hover:bg-red-900/20"><Trash2 className="h-3 w-3"/></Button>
            </span>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o)=>!o && setEditing(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-none max-w-md text-white">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest text-sm">{editing?.id?"Edit":"Add"} Shipping Rule</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <Field label="District (leave empty for default)">
                <Select value={editing.district||"_any"} onValueChange={(v)=>setEditing(s=>({...s, district: v==="_any"?null:v, city: null}))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none"><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="_any">— Any district (default) —</SelectItem>{districts.map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="City (optional, applies to specific city)">
                <Select value={editing.city||"_any"} onValueChange={(v)=>setEditing(s=>({...s, city: v==="_any"?null:v}))} disabled={!editing.district}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none"><SelectValue placeholder="— Any city —"/></SelectTrigger>
                  <SelectContent><SelectItem value="_any">— Any city in district —</SelectItem>{cities.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Fee"><Input type="number" step="0.01" value={editing.fee} onChange={(e)=>setEditing(s=>({...s,fee:e.target.value}))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
              <Field label="Free shipping above (optional)"><Input type="number" step="0.01" value={editing.free_above||""} onChange={(e)=>setEditing(s=>({...s,free_above:e.target.value}))} placeholder="Subtotal threshold" className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
              <Field label="Label (optional)"><Input value={editing.label||""} onChange={(e)=>setEditing(s=>({...s,label:e.target.value}))} className="bg-zinc-900 border-zinc-800 rounded-none" placeholder='e.g. "Same day Colombo"'/></Field>
              <div className="flex items-center justify-between"><Label className="text-xs uppercase tracking-widest">Active</Label><Switch checked={editing.active} onCheckedChange={(v)=>setEditing(s=>({...s,active:v}))}/></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={()=>setEditing(null)} className="rounded-none">Cancel</Button><Button onClick={save} className="bg-[var(--theme-primary,#FF3B30)] rounded-none uppercase tracking-widest" data-testid="save-shipping-rule">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PaymentsTab() {
  const [methods, setMethods] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = async () => { const { data } = await api.get("/admin/payment-methods"); setMethods(data); };
  useEffect(() => { load(); }, []);

  const create = (scope) => setEditing({ code: "custom", label: "Bank Transfer", description: "", scope, active: true, sort_order: 100, config: {} });
  const save = async () => {
    try {
      if (editing.id) await api.put(`/admin/payment-methods/${editing.id}`, editing);
      else await api.post("/admin/payment-methods", editing);
      setEditing(null); load();
      toast.success("Saved");
    } catch (e) { toast.error("Failed"); }
  };
  const del = async (id) => { if (!window.confirm("Delete?")) return; await api.delete(`/admin/payment-methods/${id}`); load(); };
  const toggleActive = async (m) => { await api.put(`/admin/payment-methods/${m.id}`, { ...m, active: !m.active }); load(); };

  const renderList = (scope) => {
    const filtered = methods.filter((m) => m.scope === scope);
    return (
      <div className="border border-zinc-800">
        <div className="grid grid-cols-[1.5fr_2fr_1fr_auto] gap-3 p-3 border-b border-zinc-800 bg-zinc-900 text-[10px] uppercase tracking-widest text-zinc-400">
          <span>Method</span><span>Description</span><span>Status</span><span></span>
        </div>
        {filtered.length === 0 && <div className="p-6 text-center text-zinc-600 text-sm">No payment methods configured.</div>}
        {filtered.map((m) => (
          <div key={m.id} className="grid grid-cols-[1.5fr_2fr_1fr_auto] gap-3 p-3 border-b border-zinc-900 items-center text-sm">
            <span className="font-heading uppercase tracking-widest text-xs">{m.label}</span>
            <span className="text-zinc-500 text-xs">{m.description||"—"}</span>
            <button onClick={()=>toggleActive(m)} data-testid={`toggle-payment-${m.id}`} className={`text-xs uppercase tracking-widest ${m.active?"text-green-400":"text-zinc-500"}`}>{m.active?"Active":"Off"}</button>
            <span className="flex gap-1">
              <Button size="sm" variant="outline" onClick={()=>setEditing(m)} className="rounded-none h-8 text-xs">Edit</Button>
              <Button size="sm" variant="outline" onClick={()=>del(m.id)} className="rounded-none h-8 text-red-400 hover:bg-red-900/20"><Trash2 className="h-3 w-3"/></Button>
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <div className="border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex items-center justify-between mb-4">
          <div><h2 className="font-heading uppercase tracking-widest text-sm">Online Storefront Payments</h2><p className="text-xs text-zinc-500 mt-1">Methods customers see at checkout.</p></div>
          <Button data-testid="add-online-payment" onClick={()=>create("online")} className="bg-[var(--theme-primary,#FF3B30)] rounded-none font-heading uppercase tracking-widest gap-2"><Plus className="h-3 w-3"/>Add Method</Button>
        </div>
        {renderList("online")}
      </div>
      <div className="border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex items-center justify-between mb-4">
          <div><h2 className="font-heading uppercase tracking-widest text-sm">In-store / POS Payments</h2><p className="text-xs text-zinc-500 mt-1">Methods accepted at the cashier.</p></div>
          <Button data-testid="add-pos-payment" onClick={()=>create("pos")} className="bg-[var(--theme-primary,#FF3B30)] rounded-none font-heading uppercase tracking-widest gap-2"><Plus className="h-3 w-3"/>Add Method</Button>
        </div>
        {renderList("pos")}
      </div>

      <Dialog open={!!editing} onOpenChange={(o)=>!o && setEditing(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-none max-w-md text-white">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest text-sm">{editing?.id?"Edit":"Add"} Payment Method</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <Field label="Code">
                <Select value={editing.code} onValueChange={(v)=>setEditing(s=>({...s,code:v}))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none"><SelectValue/></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cod">Cash on Delivery</SelectItem>
                    <SelectItem value="payhere">PayHere Gateway</SelectItem>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card_pos">Card (POS Terminal)</SelectItem>
                    <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Label *"><Input value={editing.label} onChange={(e)=>setEditing(s=>({...s,label:e.target.value}))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
              <Field label="Description"><Textarea value={editing.description||""} onChange={(e)=>setEditing(s=>({...s,description:e.target.value}))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
              <Field label="Scope">
                <Select value={editing.scope} onValueChange={(v)=>setEditing(s=>({...s,scope:v}))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none"><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="online">Online Storefront</SelectItem><SelectItem value="pos">POS / In-store</SelectItem></SelectContent>
                </Select>
              </Field>
              {editing.code === "payhere" && (
                <>
                  <Field label="PayHere Merchant ID"><Input value={editing.config?.merchant_id||""} onChange={(e)=>setEditing(s=>({...s,config:{...s.config, merchant_id:e.target.value}}))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
                  <Field label="PayHere Merchant Secret"><Input type="password" value={editing.config?.merchant_secret||""} onChange={(e)=>setEditing(s=>({...s,config:{...s.config, merchant_secret:e.target.value}}))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
                  <div className="flex items-center justify-between"><Label className="text-xs uppercase tracking-widest">Sandbox mode</Label><Switch checked={!!editing.config?.sandbox} onCheckedChange={(v)=>setEditing(s=>({...s,config:{...s.config, sandbox:v}}))}/></div>
                </>
              )}
              <Field label="Sort order"><Input type="number" value={editing.sort_order} onChange={(e)=>setEditing(s=>({...s,sort_order:parseInt(e.target.value)||0}))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
              <div className="flex items-center justify-between"><Label className="text-xs uppercase tracking-widest">Active</Label><Switch checked={editing.active} onCheckedChange={(v)=>setEditing(s=>({...s,active:v}))}/></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={()=>setEditing(null)} className="rounded-none">Cancel</Button><Button onClick={save} className="bg-[var(--theme-primary,#FF3B30)] rounded-none uppercase tracking-widest" data-testid="save-payment-method">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
