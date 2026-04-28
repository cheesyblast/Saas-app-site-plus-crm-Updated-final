import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, MapPin, CreditCard } from "lucide-react";
import { toast } from "sonner";

// Mirrors what was previously inside Settings — extracted so it can live as
// its own sidebar item (clearer separation of concerns).

const PAYMENT_CODES = [
  { value: "cod", label: "Cash on Delivery" },
  { value: "payhere", label: "PayHere Gateway" },
  { value: "koko", label: "KOKO — Pay in 3 (Online)" },
  { value: "koko_pos", label: "KOKO — Pay in 3 (POS)" },
  { value: "mintpay", label: "Mintpay (Online)" },
  { value: "mintpay_pos", label: "Mintpay (POS)" },
  { value: "cash", label: "Cash" },
  { value: "card_pos", label: "Card (POS Terminal)" },
  { value: "bank_transfer", label: "Bank Transfer" },
  { value: "custom", label: "Custom" },
];

const NEEDS_KEYS = ["payhere", "koko", "koko_pos", "mintpay", "mintpay_pos"];

function Field({ label, children, hint }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-widest text-zinc-400 mb-1 block">{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-zinc-500 mt-1">{hint}</p>}
    </div>
  );
}

export default function PaymentsShipping() {
  return (
    <div className="text-white">
      <div className="mb-6">
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Payments &amp; Shipping</h1>
        <p className="text-sm text-zinc-500 mt-1">Configure delivery rates and accepted payment methods (Online + POS).</p>
      </div>
      <Tabs defaultValue="payments" className="w-full">
        <TabsList className="bg-zinc-900 border border-zinc-800 rounded-none p-0 flex w-full">
          <TabsTrigger value="payments" data-testid="ps-tab-payments" className="flex-1 rounded-none data-[state=active]:bg-zinc-800 uppercase tracking-widest text-xs"><CreditCard className="h-3 w-3 mr-2"/>Payments</TabsTrigger>
          <TabsTrigger value="shipping" data-testid="ps-tab-shipping" className="flex-1 rounded-none data-[state=active]:bg-zinc-800 uppercase tracking-widest text-xs"><MapPin className="h-3 w-3 mr-2"/>Shipping</TabsTrigger>
        </TabsList>
        <TabsContent value="payments" className="mt-6"><PaymentsPane /></TabsContent>
        <TabsContent value="shipping" className="mt-6"><ShippingPane /></TabsContent>
      </Tabs>
    </div>
  );
}

function PaymentsPane() {
  const [methods, setMethods] = useState([]);
  const [editing, setEditing] = useState(null);

  const load = async () => { const { data } = await api.get("/admin/payment-methods"); setMethods(data); };
  useEffect(() => { load(); }, []);

  const create = (scope) => setEditing({ code: "custom", label: "Custom", description: "", scope, active: true, sort_order: 100, config: {} });
  const save = async () => {
    try {
      if (editing.id) await api.put(`/admin/payment-methods/${editing.id}`, editing);
      else await api.post("/admin/payment-methods", editing);
      setEditing(null); load();
      toast.success("Saved");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const del = async (id) => { if (!confirm("Delete?")) return; await api.delete(`/admin/payment-methods/${id}`); load(); };
  const toggleActive = async (m) => { await api.put(`/admin/payment-methods/${m.id}`, { ...m, active: !m.active }); load(); };

  const renderList = (scope) => {
    const filtered = methods.filter(m => m.scope === scope);
    return (
      <div className="border border-zinc-800">
        <div className="grid grid-cols-[1.5fr_2fr_1fr_auto] gap-3 p-3 border-b border-zinc-800 bg-zinc-900 text-[10px] uppercase tracking-widest text-zinc-400"><span>Method</span><span>Description</span><span>Status</span><span></span></div>
        {filtered.length === 0 && <div className="p-6 text-center text-zinc-600 text-sm">No methods.</div>}
        {filtered.map(m => (
          <div key={m.id} className="grid grid-cols-[1.5fr_2fr_1fr_auto] gap-3 p-3 border-b border-zinc-900 items-center text-sm">
            <span className="font-heading uppercase tracking-widest text-xs">{m.label}</span>
            <span className="text-zinc-500 text-xs">{m.description || "—"}</span>
            <button onClick={() => toggleActive(m)} className={`text-xs uppercase tracking-widest ${m.active ? "text-green-400" : "text-zinc-500"}`}>{m.active ? "Active" : "Off"}</button>
            <span className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setEditing(m)} className="rounded-none h-8 text-xs">Edit</Button>
              <Button size="sm" variant="outline" onClick={() => del(m.id)} className="rounded-none h-8 text-red-400 hover:bg-red-900/20"><Trash2 className="h-3 w-3"/></Button>
            </span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex items-center justify-between mb-4">
          <div><h2 className="font-heading uppercase tracking-widest text-sm">Online Storefront</h2><p className="text-xs text-zinc-500 mt-1">Methods customers see at checkout. KOKO &amp; Mintpay support is configurable.</p></div>
          <Button data-testid="add-online-payment" onClick={() => create("online")} className="bg-[var(--theme-primary,#FF3B30)] rounded-none uppercase tracking-widest gap-2"><Plus className="h-3 w-3"/>Add Method</Button>
        </div>
        {renderList("online")}
      </div>
      <div className="border border-zinc-800 bg-zinc-950 p-6">
        <div className="flex items-center justify-between mb-4">
          <div><h2 className="font-heading uppercase tracking-widest text-sm">In-store / POS</h2><p className="text-xs text-zinc-500 mt-1">Methods accepted at the cashier counter.</p></div>
          <Button data-testid="add-pos-payment" onClick={() => create("pos")} className="bg-[var(--theme-primary,#FF3B30)] rounded-none uppercase tracking-widest gap-2"><Plus className="h-3 w-3"/>Add Method</Button>
        </div>
        {renderList("pos")}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-none max-w-md text-white">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest text-sm">{editing?.id ? "Edit" : "Add"} Payment Method</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
              <Field label="Code">
                <Select value={editing.code} onValueChange={(v) => setEditing(s => ({ ...s, code: v }))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none"><SelectValue/></SelectTrigger>
                  <SelectContent>{PAYMENT_CODES.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Label *"><Input value={editing.label} onChange={(e) => setEditing(s => ({ ...s, label: e.target.value }))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
              <Field label="Description"><Textarea value={editing.description || ""} onChange={(e) => setEditing(s => ({ ...s, description: e.target.value }))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
              <Field label="Scope">
                <Select value={editing.scope} onValueChange={(v) => setEditing(s => ({ ...s, scope: v }))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none"><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="online">Online Storefront</SelectItem><SelectItem value="pos">POS / In-store</SelectItem></SelectContent>
                </Select>
              </Field>
              {NEEDS_KEYS.includes(editing.code) && (
                <div className="border border-zinc-800 p-3 space-y-3">
                  <Label className="text-xs uppercase tracking-widest text-zinc-400">Provider Credentials</Label>
                  <Field label="Merchant ID"><Input value={editing.config?.merchant_id || ""} onChange={(e) => setEditing(s => ({ ...s, config: { ...s.config, merchant_id: e.target.value } }))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
                  <Field label="API Key"><Input type="password" value={editing.config?.api_key || ""} onChange={(e) => setEditing(s => ({ ...s, config: { ...s.config, api_key: e.target.value } }))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
                  <Field label="Secret"><Input type="password" value={editing.config?.secret || editing.config?.merchant_secret || ""} onChange={(e) => setEditing(s => ({ ...s, config: { ...s.config, secret: e.target.value } }))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
                  <div className="flex items-center justify-between"><Label className="text-xs uppercase tracking-widest">Sandbox mode</Label><Switch checked={!!editing.config?.sandbox} onCheckedChange={(v) => setEditing(s => ({ ...s, config: { ...s.config, sandbox: v } }))}/></div>
                  <p className="text-[10px] text-amber-400">Until live SDK is wired by the platform team, orders using this method will mark as "paid" instantly upon checkout.</p>
                </div>
              )}
              <Field label="Sort order"><Input type="number" value={editing.sort_order} onChange={(e) => setEditing(s => ({ ...s, sort_order: parseInt(e.target.value) || 0 }))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
              <div className="flex items-center justify-between"><Label className="text-xs uppercase tracking-widest">Active</Label><Switch checked={editing.active} onCheckedChange={(v) => setEditing(s => ({ ...s, active: v }))}/></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)} className="rounded-none">Cancel</Button><Button onClick={save} className="bg-[#FF3B30] rounded-none uppercase tracking-widest" data-testid="save-payment-method">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ShippingPane() {
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
      const payload = { ...editing, district: editing.district || null, city: editing.city || null, fee: parseFloat(editing.fee) || 0, free_above: editing.free_above ? parseFloat(editing.free_above) : null };
      if (editing.id) await api.put(`/admin/shipping/rules/${editing.id}`, payload);
      else await api.post("/admin/shipping/rules", payload);
      setEditing(null); load(); toast.success("Saved");
    } catch { toast.error("Failed"); }
  };
  const del = async (id) => { if (!confirm("Delete?")) return; await api.delete(`/admin/shipping/rules/${id}`); load(); };
  const cities = editing?.district ? (byDistrict[editing.district] || []) : [];

  return (
    <div className="border border-zinc-800 bg-zinc-950 p-6">
      <div className="flex items-center justify-between mb-6">
        <div><h2 className="font-heading uppercase tracking-widest text-sm">Shipping Rules</h2><p className="text-xs text-zinc-500 mt-1">Set delivery charges by district / city. Leave both blank for fallback default.</p></div>
        <Button data-testid="add-shipping-rule" onClick={create} className="bg-[#FF3B30] rounded-none uppercase tracking-widest gap-2"><Plus className="h-3 w-3"/>Add Rule</Button>
      </div>
      <div className="border border-zinc-800">
        <div className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr_auto] gap-3 p-3 border-b border-zinc-800 bg-zinc-900 text-[10px] uppercase tracking-widest text-zinc-400"><span>District</span><span>City</span><span>Fee</span><span>Free Above</span><span>Status</span><span></span></div>
        {rules.length === 0 && <div className="p-8 text-center text-zinc-600 text-sm">No rules. Add a default rule (no district + city) to charge a flat rate.</div>}
        {rules.map(r => (
          <div key={r.id} className="grid grid-cols-[1.5fr_1.5fr_1fr_1fr_1fr_auto] gap-3 p-3 border-b border-zinc-900 items-center text-sm">
            <span>{r.district || <em className="text-zinc-500">Any</em>}</span>
            <span>{r.city || <em className="text-zinc-500">Any</em>}</span>
            <span className="font-mono">{r.fee.toFixed(2)}</span>
            <span className="font-mono text-xs">{r.free_above != null ? r.free_above.toFixed(2) : "—"}</span>
            <span className={`text-xs uppercase tracking-widest ${r.active ? "text-green-400" : "text-zinc-500"}`}>{r.active ? "Active" : "Off"}</span>
            <span className="flex gap-1">
              <Button size="sm" variant="outline" onClick={() => setEditing(r)} className="rounded-none h-8 text-xs">Edit</Button>
              <Button size="sm" variant="outline" onClick={() => del(r.id)} className="rounded-none h-8 text-red-400 hover:bg-red-900/20"><Trash2 className="h-3 w-3"/></Button>
            </span>
          </div>
        ))}
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 rounded-none max-w-md text-white">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest text-sm">{editing?.id ? "Edit" : "Add"} Shipping Rule</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-4">
              <Field label="District (leave empty for default)">
                <Select value={editing.district || "_any"} onValueChange={(v) => setEditing(s => ({ ...s, district: v === "_any" ? null : v, city: null }))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none"><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="_any">— Any district (default) —</SelectItem>{districts.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="City (optional)">
                <Select value={editing.city || "_any"} onValueChange={(v) => setEditing(s => ({ ...s, city: v === "_any" ? null : v }))} disabled={!editing.district}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none"><SelectValue placeholder="— Any city —"/></SelectTrigger>
                  <SelectContent><SelectItem value="_any">— Any city in district —</SelectItem>{cities.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </Field>
              <Field label="Fee"><Input type="number" step="0.01" value={editing.fee} onChange={(e) => setEditing(s => ({ ...s, fee: e.target.value }))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
              <Field label="Free shipping above (optional)"><Input type="number" step="0.01" value={editing.free_above || ""} onChange={(e) => setEditing(s => ({ ...s, free_above: e.target.value }))} className="bg-zinc-900 border-zinc-800 rounded-none"/></Field>
              <Field label="Label (optional)"><Input value={editing.label || ""} onChange={(e) => setEditing(s => ({ ...s, label: e.target.value }))} className="bg-zinc-900 border-zinc-800 rounded-none" placeholder='e.g. "Same day Colombo"'/></Field>
              <div className="flex items-center justify-between"><Label className="text-xs uppercase tracking-widest">Active</Label><Switch checked={editing.active} onCheckedChange={(v) => setEditing(s => ({ ...s, active: v }))}/></div>
            </div>
          )}
          <DialogFooter><Button variant="outline" onClick={() => setEditing(null)} className="rounded-none">Cancel</Button><Button onClick={save} className="bg-[#FF3B30] rounded-none uppercase tracking-widest" data-testid="save-shipping-rule">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
