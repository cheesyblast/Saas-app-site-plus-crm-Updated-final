import React, { useEffect, useState } from "react";
import api, { formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

const CHANNELS = ["email", "sms", "social", "ads", "influencer"];
const STATUSES = ["draft", "active", "completed", "paused"];
const empty = { id: null, name: "", channel: "social", status: "draft", spend: 0, revenue: 0, reach: 0, clicks: 0, conversions: 0 };

export default function Marketing() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

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
    <div className="space-y-6" data-testid="admin-marketing">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Marketing</h1>
        <Button onClick={() => { setForm(empty); setOpen(true); }} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold"><Plus className="h-4 w-4 mr-2" /> New Campaign</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-950 border border-zinc-900 p-5"><div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-2">Total Spend</div><div className="font-heading text-2xl font-black tracking-tighter">{formatPrice(totals.spend)}</div></div>
        <div className="bg-zinc-950 border border-zinc-900 p-5"><div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-2">Attributed Revenue</div><div className="font-heading text-2xl font-black tracking-tighter text-green-400">{formatPrice(totals.revenue)}</div></div>
        <div className="bg-zinc-950 border border-zinc-900 p-5"><div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-2">Conversions</div><div className="font-heading text-2xl font-black tracking-tighter">{totals.conversions}</div></div>
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
          <DialogFooter><Button onClick={save} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
