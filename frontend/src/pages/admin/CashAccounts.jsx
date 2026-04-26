import React, { useEffect, useState } from "react";
import api, { formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const empty = { id: null, name: "", kind: "cash", store_id: "", balance: 0, active: true };

export default function CashAccounts() {
  const [rows, setRows] = useState([]);
  const [stores, setStores] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => setRows((await api.get("/admin/cash-accounts")).data);
  useEffect(() => { load(); api.get("/admin/stores").then(({ data }) => setStores(data || [])); }, []);

  const save = async () => {
    try {
      const payload = { ...form, balance: parseFloat(form.balance) || 0, store_id: form.store_id || null };
      if (form.id) await api.put(`/admin/cash-accounts/${form.id}`, payload);
      else await api.post("/admin/cash-accounts", payload);
      toast.success("Saved"); setOpen(false); load();
    } catch { toast.error("Failed"); }
  };
  const del = async (id) => { if (!confirm("Delete?")) return; await api.delete(`/admin/cash-accounts/${id}`); load(); };

  const totalCash = rows.filter(r => r.kind === "cash" && r.active).reduce((s, r) => s + (r.balance || 0), 0);
  const totalBank = rows.filter(r => r.kind === "bank" && r.active).reduce((s, r) => s + (r.balance || 0), 0);

  return (
    <div className="space-y-6 text-white" data-testid="admin-cash-accounts">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Cash &amp; Bank</h1>
          <p className="text-sm text-zinc-500 mt-1">Total Cash: <span className="text-green-400 font-mono">{formatPrice(totalCash)}</span> · Total Bank: <span className="text-blue-400 font-mono">{formatPrice(totalBank)}</span></p>
        </div>
        <Button data-testid="new-cash-account-btn" onClick={() => { setForm(empty); setOpen(true); }} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold"><Plus className="h-4 w-4 mr-2"/> New Account</Button>
      </div>
      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400">
            <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Kind</th><th className="text-left p-3">Outlet</th><th className="text-left p-3">Balance</th><th className="text-left p-3">Active</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                <td className="p-3 font-semibold">{r.name}</td>
                <td className="p-3 text-xs uppercase tracking-widest">{r.kind}</td>
                <td className="p-3 text-zinc-400">{r.store_name || "—"}</td>
                <td className={`p-3 font-mono ${r.kind==="cash"?"text-green-400":"text-blue-400"}`}>{formatPrice(r.balance)}</td>
                <td className="p-3">{r.active ? <span className="text-green-400 text-xs">Active</span> : <span className="text-zinc-500 text-xs">Off</span>}</td>
                <td className="p-3 text-right">
                  <button onClick={() => { setForm({ ...r, store_id: r.store_id || "" }); setOpen(true); }} className="text-zinc-400 hover:text-white p-1"><Pencil className="h-4 w-4"/></button>
                  <button onClick={() => del(r.id)} className="text-zinc-400 hover:text-red-400 p-1"><Trash2 className="h-4 w-4"/></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-zinc-500">No accounts yet. Create one to track cash & bank balances.</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-md">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">{form.id?"Edit":"New"} Account</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Name</Label><Input data-testid="cash-account-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Kind</Label>
                <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}><SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue/></SelectTrigger><SelectContent className="bg-zinc-950 border-zinc-800 text-white"><SelectItem value="cash">Cash drawer</SelectItem><SelectItem value="bank">Bank account</SelectItem></SelectContent></Select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Outlet</Label>
                <Select value={form.store_id || "_none"} onValueChange={(v) => setForm({ ...form, store_id: v === "_none" ? "" : v })}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue placeholder="—"/></SelectTrigger>
                  <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                    <SelectItem value="_none">— None —</SelectItem>
                    {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Opening Balance</Label><Input type="number" step="0.01" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div className="flex items-center gap-2"><Label className="text-xs uppercase tracking-widest text-zinc-400">Active</Label><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div>
          </div>
          <DialogFooter><Button data-testid="save-cash-account-btn" onClick={save} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
