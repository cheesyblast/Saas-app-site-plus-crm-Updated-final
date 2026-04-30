import React, { useEffect, useState } from "react";
import api, { formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Megaphone, Mail, MessageSquare, FileText, Bell, Send } from "lucide-react";
import { toast } from "sonner";
import { IntegrationTab } from "./Settings";
import Notifications from "./Notifications";

const CHANNELS = ["email", "sms", "social", "ads", "influencer"];
const STATUSES = ["draft", "active", "completed", "paused"];
const EVENT_KEYS = [
  { key: "order_placed",    label: "Order Placed" },
  { key: "order_paid",      label: "Order Paid" },
  { key: "order_shipped",   label: "Order Shipped" },
  { key: "order_delivered", label: "Order Delivered" },
  { key: "order_cancelled", label: "Order Cancelled" },
  { key: "order_refunded",  label: "Order Refunded" },
  { key: "marketing_blast", label: "Marketing Blast (manual)" },
];

export default function Marketing() {
  return (
    <div className="text-white space-y-6" data-testid="admin-marketing">
      <div>
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Marketing</h1>
        <p className="text-zinc-500 text-sm mt-2">Campaigns, email/SMS providers, transactional templates &amp; bulk customer outreach.</p>
      </div>

      <Tabs defaultValue="campaigns" className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800 rounded-none p-0 flex w-full overflow-x-auto">
          <TabsTrigger value="campaigns" data-testid="mkt-tab-campaigns" className="flex-1 min-w-fit rounded-none data-[state=active]:bg-zinc-800 uppercase tracking-widest text-xs"><Megaphone className="h-3 w-3 mr-2"/>Campaigns</TabsTrigger>
          <TabsTrigger value="email"     data-testid="mkt-tab-email"     className="flex-1 min-w-fit rounded-none data-[state=active]:bg-zinc-800 uppercase tracking-widest text-xs"><Mail className="h-3 w-3 mr-2"/>Email Setup</TabsTrigger>
          <TabsTrigger value="sms"       data-testid="mkt-tab-sms"       className="flex-1 min-w-fit rounded-none data-[state=active]:bg-zinc-800 uppercase tracking-widest text-xs"><MessageSquare className="h-3 w-3 mr-2"/>SMS Setup</TabsTrigger>
          <TabsTrigger value="templates" data-testid="mkt-tab-templates" className="flex-1 min-w-fit rounded-none data-[state=active]:bg-zinc-800 uppercase tracking-widest text-xs"><FileText className="h-3 w-3 mr-2"/>Templates</TabsTrigger>
          <TabsTrigger value="bulk"      data-testid="mkt-tab-bulk"      className="flex-1 min-w-fit rounded-none data-[state=active]:bg-zinc-800 uppercase tracking-widest text-xs"><Send className="h-3 w-3 mr-2"/>Bulk Send</TabsTrigger>
          <TabsTrigger value="logs"      data-testid="mkt-tab-logs"      className="flex-1 min-w-fit rounded-none data-[state=active]:bg-zinc-800 uppercase tracking-widest text-xs"><Bell className="h-3 w-3 mr-2"/>Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="mt-6"><CampaignsPanel/></TabsContent>
        <TabsContent value="email"     className="mt-6"><IntegrationTab kind="email"/></TabsContent>
        <TabsContent value="sms"       className="mt-6"><IntegrationTab kind="sms"/></TabsContent>
        <TabsContent value="templates" className="mt-6"><TemplatesPanel/></TabsContent>
        <TabsContent value="bulk"      className="mt-6"><BulkSendPanel/></TabsContent>
        <TabsContent value="logs"      className="mt-6"><Notifications/></TabsContent>
      </Tabs>
    </div>
  );
}

// ====================== CAMPAIGNS ======================
const emptyCampaign = { id: null, name: "", channel: "social", status: "draft", spend: 0, revenue: 0, reach: 0, clicks: 0, conversions: 0 };

function CampaignsPanel() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyCampaign);

  const load = async () => setRows((await api.get("/admin/marketing/campaigns")).data);
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      const p = { ...form, spend: parseFloat(form.spend) || 0, revenue: parseFloat(form.revenue) || 0, reach: parseInt(form.reach) || 0, clicks: parseInt(form.clicks) || 0, conversions: parseInt(form.conversions) || 0 };
      if (form.id) await api.put(`/admin/marketing/campaigns/${form.id}`, p);
      else await api.post("/admin/marketing/campaigns", p);
      toast.success("Saved"); setOpen(false); load();
    } catch { toast.error("Failed"); }
  };
  const del = async (id) => { if (!confirm("Delete?")) return; await api.delete(`/admin/marketing/campaigns/${id}`); load(); };
  const totals = rows.reduce((a, c) => ({ spend: a.spend + c.spend, revenue: a.revenue + c.revenue, conversions: a.conversions + c.conversions }), { spend: 0, revenue: 0, conversions: 0 });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-950 border border-zinc-900 p-5"><div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-2">Total Spend</div><div className="font-heading text-2xl font-black tracking-tighter">{formatPrice(totals.spend)}</div></div>
        <div className="bg-zinc-950 border border-zinc-900 p-5"><div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-2">Attributed Revenue</div><div className="font-heading text-2xl font-black tracking-tighter text-green-400">{formatPrice(totals.revenue)}</div></div>
        <div className="bg-zinc-950 border border-zinc-900 p-5"><div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-2">Conversions</div><div className="font-heading text-2xl font-black tracking-tighter">{totals.conversions}</div></div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => { setForm(emptyCampaign); setOpen(true); }} data-testid="campaign-new" className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold"><Plus className="h-4 w-4 mr-2" /> New Campaign</Button>
      </div>

      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400"><tr><th className="text-left p-3">Name</th><th className="text-left p-3">Channel</th><th className="text-left p-3">Status</th><th className="text-left p-3">Spend</th><th className="text-left p-3">Revenue</th><th className="text-left p-3">ROI</th><th className="text-left p-3">Conv</th><th className="p-3"></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                <td className="p-3 font-semibold">{c.name}</td>
                <td className="p-3 text-xs uppercase tracking-widest">{c.channel}</td>
                <td className="p-3"><span className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${c.status === "active" ? "border-green-700 text-green-400" : "border-zinc-700 text-zinc-500"}`}>{c.status}</span></td>
                <td className="p-3 font-mono">{formatPrice(c.spend)}</td>
                <td className="p-3 font-mono text-green-400">{formatPrice(c.revenue)}</td>
                <td className="p-3 font-mono">{c.roi}%</td>
                <td className="p-3 font-mono">{c.conversions}</td>
                <td className="p-3 text-right">
                  <button onClick={() => { setForm(c); setOpen(true); }} className="text-zinc-400 hover:text-white p-1"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del(c.id)} className="text-zinc-400 hover:text-red-400 p-1"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="p-12 text-center text-zinc-500">No campaigns</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-md">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">{form.id ? "Edit" : "New"} Campaign</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Channel</Label><Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}><SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-950 border-zinc-800 text-white">{CHANNELS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Status</Label><Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}><SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-950 border-zinc-800 text-white">{STATUSES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Spend</Label><Input type="number" step="0.01" value={form.spend} onChange={(e) => setForm({ ...form, spend: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Revenue</Label><Input type="number" step="0.01" value={form.revenue} onChange={(e) => setForm({ ...form, revenue: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Reach</Label><Input type="number" value={form.reach} onChange={(e) => setForm({ ...form, reach: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Clicks</Label><Input type="number" value={form.clicks} onChange={(e) => setForm({ ...form, clicks: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Conversions</Label><Input type="number" value={form.conversions} onChange={(e) => setForm({ ...form, conversions: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={save} data-testid="campaign-save" className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ====================== TEMPLATES ======================
const emptyTemplate = { id: null, event_key: "order_placed", channel: "email", name: "", subject: "", body: "", active: true, is_default: false };

function TemplatesPanel() {
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = async () => setRows((await api.get("/admin/marketing/templates")).data);
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (editing.id) await api.put(`/admin/marketing/templates/${editing.id}`, editing);
      else await api.post("/admin/marketing/templates", editing);
      toast.success("Template saved"); setEditing(null); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const del = async (id) => { if (!confirm("Delete this template?")) return; await api.delete(`/admin/marketing/templates/${id}`); load(); };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-heading uppercase tracking-widest text-sm">Notification Templates</h2>
          <p className="text-xs text-zinc-500 mt-1">Reusable email + SMS templates per order event. Use placeholders like <code className="text-zinc-300">{`{{customer_name}}`}</code>, <code className="text-zinc-300">{`{{order_number}}`}</code>, <code className="text-zinc-300">{`{{total}}`}</code>, <code className="text-zinc-300">{`{{tracking_url}}`}</code>, <code className="text-zinc-300">{`{{brand_name}}`}</code>.</p>
        </div>
        <Button onClick={() => setEditing({ ...emptyTemplate })} data-testid="template-new" className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold gap-2"><Plus className="h-3 w-3"/> New Template</Button>
      </div>

      <div className="grid gap-3">
        {rows.length === 0 && <div className="text-zinc-600 text-sm py-12 text-center border border-dashed border-zinc-900">No templates yet. Click "New Template" to create one for each order status.</div>}
        {rows.map((t) => (
          <div key={t.id} className="border border-zinc-800 bg-zinc-950 p-4 hover:border-zinc-700 transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-heading uppercase tracking-widest text-sm">{t.name}</span>
                  <span className="text-[10px] uppercase tracking-widest border border-zinc-700 px-2 py-0.5 text-zinc-400">{EVENT_KEYS.find(e => e.key === t.event_key)?.label || t.event_key}</span>
                  <span className={`text-[10px] uppercase tracking-widest px-2 py-0.5 ${t.channel === 'email' ? 'bg-blue-900/30 text-blue-400 border border-blue-800' : 'bg-emerald-900/30 text-emerald-400 border border-emerald-800'}`}>{t.channel}</span>
                  {t.is_default && <span className="text-[10px] uppercase tracking-widest bg-[var(--theme-primary,#FF3B30)] px-2 py-0.5">Default</span>}
                  {!t.active && <span className="text-[10px] uppercase tracking-widest bg-zinc-700 px-2 py-0.5">Inactive</span>}
                </div>
                {t.subject && <div className="text-xs text-zinc-400 mt-2 truncate">Subject: {t.subject}</div>}
                <div className="text-xs text-zinc-500 mt-1 line-clamp-2 whitespace-pre-wrap">{t.body}</div>
              </div>
              <div className="flex gap-2 flex-shrink-0">
                <Button variant="outline" onClick={() => setEditing(t)} className="rounded-none border-zinc-700 bg-transparent text-xs uppercase tracking-widest">Edit</Button>
                <Button variant="outline" onClick={() => del(t.id)} className="rounded-none border-zinc-700 bg-transparent text-red-400 hover:bg-red-900/20"><Trash2 className="h-3 w-3"/></Button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-2xl">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest text-sm">{editing?.id ? "Edit" : "New"} Template</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs uppercase tracking-widest text-zinc-400">Trigger Event</Label>
                  <Select value={editing.event_key} onValueChange={(v) => setEditing({ ...editing, event_key: v })}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1" data-testid="template-event"><SelectValue/></SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-zinc-800 text-white">{EVENT_KEYS.map(e => <SelectItem key={e.key} value={e.key}>{e.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs uppercase tracking-widest text-zinc-400">Channel</Label>
                  <Select value={editing.channel} onValueChange={(v) => setEditing({ ...editing, channel: v })}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1" data-testid="template-channel"><SelectValue/></SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Name (internal)</Label><Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="e.g. Order Placed - English" className="bg-zinc-900 border-zinc-800 rounded-none mt-1" data-testid="template-name"/></div>
              {editing.channel === "email" && (
                <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Subject</Label><Input value={editing.subject || ""} onChange={(e) => setEditing({ ...editing, subject: e.target.value })} placeholder="Your order {{order_number}} is confirmed" className="bg-zinc-900 border-zinc-800 rounded-none mt-1" data-testid="template-subject"/></div>
              )}
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Body</Label>
                <Textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={editing.channel === "sms" ? 4 : 10} placeholder={editing.channel === "sms" ? "Hi {{customer_name}}, your order {{order_number}} ({{total}}) is confirmed. Track: {{tracking_url}}" : "Hi {{customer_name}},\n\nThanks for ordering from {{brand_name}}!\n\nOrder #{{order_number}}\nTotal: {{total}}\n\nWe'll notify you when it ships."} className="bg-zinc-900 border-zinc-800 rounded-none mt-1 font-mono text-xs" data-testid="template-body"/>
              </div>
              <div className="flex items-center gap-6 pt-2">
                <label className="flex items-center gap-2 text-sm"><Switch checked={editing.active} onCheckedChange={(v) => setEditing({ ...editing, active: v })}/> Active</label>
                <label className="flex items-center gap-2 text-sm"><Switch checked={editing.is_default} onCheckedChange={(v) => setEditing({ ...editing, is_default: v })}/> Default for this event/channel</label>
              </div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)} className="rounded-none">Cancel</Button><Button onClick={save} data-testid="template-save" className="bg-[var(--theme-primary,#FF3B30)] rounded-none uppercase tracking-widest font-bold">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ====================== BULK SEND ======================
function BulkSendPanel() {
  const [customers, setCustomers] = useState([]);
  const [filterDistrict, setFilterDistrict] = useState("");
  const [optInOnly, setOptInOnly] = useState(true);
  const [selected, setSelected] = useState(new Set());
  const [allMode, setAllMode] = useState(true);  // true = blast everyone matching filters; false = manual selection
  const [form, setForm] = useState({ channel: "email", subject: "", body: "" });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await api.get("/admin/customers", { params: { limit: 500 } });
    setCustomers(data.items || data || []);
  };
  useEffect(() => { load(); }, []);

  const toggle = (id) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const filtered = customers.filter(c => !filterDistrict || c.district === filterDistrict);
  const districts = Array.from(new Set(customers.map(c => c.district).filter(Boolean))).sort();

  const send = async () => {
    if (!form.body.trim()) return toast.error("Body is required");
    if (form.channel === "email" && !form.subject.trim()) return toast.error("Email subject is required");
    setBusy(true);
    try {
      const payload = {
        channel: form.channel,
        subject: form.channel === "email" ? form.subject : null,
        body: form.body,
        marketing_opt_in_only: optInOnly,
        district: filterDistrict || null,
      };
      if (!allMode) payload.customer_ids = Array.from(selected);
      const { data } = await api.post("/admin/marketing/bulk-send", payload);
      toast.success(`Queued ${data.queued} ${form.channel}s${data.skipped ? ` (skipped ${data.skipped} with no ${form.channel === "email" ? "email" : "phone"})` : ""}`);
      setForm({ channel: form.channel, subject: "", body: "" });
      setSelected(new Set());
    } catch (e) { toast.error(e?.response?.data?.detail || "Send failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="bg-zinc-900 border border-zinc-800 p-6 space-y-4">
        <h3 className="font-heading text-sm uppercase tracking-widest">Compose</h3>
        <div>
          <Label className="text-xs uppercase tracking-widest text-zinc-400">Channel</Label>
          <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v })}>
            <SelectTrigger className="bg-zinc-950 border-zinc-800 rounded-none mt-1" data-testid="bulk-channel"><SelectValue/></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              <SelectItem value="email">Email</SelectItem>
              <SelectItem value="sms">SMS</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.channel === "email" && (
          <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="bg-zinc-950 border-zinc-800 rounded-none mt-1" data-testid="bulk-subject"/></div>
        )}
        <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Body</Label><Textarea rows={form.channel === "sms" ? 4 : 8} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder={form.channel === "sms" ? "Hi {{customer_name}}, flash sale today only. Use code FLASH10. Shop now!" : "Hi {{customer_name}},\n\nWe're running a 20% off sale this weekend on the entire collection..."} className="bg-zinc-950 border-zinc-800 rounded-none mt-1 font-mono text-xs" data-testid="bulk-body"/></div>
        <div className="text-[11px] text-zinc-500">Tip: <code className="text-zinc-300">{`{{customer_name}}`}</code> &amp; <code className="text-zinc-300">{`{{first_name}}`}</code> are personalised per recipient.</div>
        <Button onClick={send} disabled={busy} className="w-full bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold" data-testid="bulk-send-btn"><Send className="h-4 w-4 mr-2"/>{busy ? "Sending..." : `Send to ${allMode ? filtered.filter(c => !optInOnly || c.marketing_opt_in).length : selected.size} recipients`}</Button>
      </div>

      <div className="bg-zinc-900 border border-zinc-800 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-sm uppercase tracking-widest">Recipients</h3>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-zinc-400">
            <button onClick={() => setAllMode(true)}  className={`px-3 py-1 ${allMode ? "bg-zinc-700 text-white" : "border border-zinc-800"}`} data-testid="bulk-mode-all">Everyone matching filters</button>
            <button onClick={() => setAllMode(false)} className={`px-3 py-1 ${!allMode ? "bg-zinc-700 text-white" : "border border-zinc-800"}`} data-testid="bulk-mode-manual">Manual select</button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs uppercase tracking-widest text-zinc-400">District</Label>
            <Select value={filterDistrict || "all"} onValueChange={(v) => setFilterDistrict(v === "all" ? "" : v)}>
              <SelectTrigger className="bg-zinc-950 border-zinc-800 rounded-none mt-1"><SelectValue placeholder="All"/></SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-white max-h-64">
                <SelectItem value="all">All districts</SelectItem>
                {districts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <label className="flex items-center gap-2 text-xs mt-6"><Switch checked={optInOnly} onCheckedChange={setOptInOnly}/> Marketing opt-in only</label>
        </div>

        {!allMode && (
          <div className="border border-zinc-800 max-h-80 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900/60 sticky top-0"><tr><th className="p-2 text-left"></th><th className="p-2 text-left">Name</th><th className="p-2 text-left">{form.channel === "email" ? "Email" : "Phone"}</th><th className="p-2 text-left">District</th></tr></thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id} className="border-t border-zinc-900 hover:bg-zinc-950/40">
                    <td className="p-2"><input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)}/></td>
                    <td className="p-2">{c.name || "—"}</td>
                    <td className="p-2 font-mono text-zinc-400">{form.channel === "email" ? (c.email || "—") : (c.phone || "—")}</td>
                    <td className="p-2 text-zinc-500">{c.district || "—"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={4} className="p-8 text-center text-zinc-600">No customers match these filters.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {allMode && (
          <div className="border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-400">
            Will send to <span className="text-white font-medium">{filtered.filter(c => !optInOnly || c.marketing_opt_in).length}</span> customers
            {filterDistrict && <> in <span className="text-white">{filterDistrict}</span></>}
            {optInOnly && <> who opted in for marketing</>}.
          </div>
        )}
      </div>
    </div>
  );
}
