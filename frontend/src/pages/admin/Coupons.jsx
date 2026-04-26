import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Search } from "lucide-react";
import { toast } from "sonner";
import Pagination from "@/components/admin/Pagination";

const empty = { id: null, code: "", type: "percent", value: 10, min_order: 0, usage_limit: 0, active: true, expires_at: null };
const PAGE_SIZE = 50;

export default function Coupons() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [search, setSearch] = useState("");

  const load = async () => {
    const { data } = await api.get("/admin/coupons", { params: { ...(search ? { q: search } : {}), page, page_size: PAGE_SIZE } });
    setRows(data.items || []); setTotal(data.total || 0);
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [search, page]);
  useEffect(() => { setPage(1); }, [search]);

  const save = async () => {
    try {
      const payload = { ...form, value: parseFloat(form.value), min_order: parseFloat(form.min_order), usage_limit: parseInt(form.usage_limit) };
      if (form.id) await api.put(`/admin/coupons/${form.id}`, payload);
      else await api.post("/admin/coupons", payload);
      toast.success("Saved"); setOpen(false); load();
    } catch { toast.error("Failed"); }
  };
  const del = async (id) => { if (!confirm("Delete?")) return; await api.delete(`/admin/coupons/${id}`); load(); };

  return (
    <div className="space-y-6 text-white" data-testid="admin-coupons">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Coupons</h1>
        <div className="flex items-center gap-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"/><Input data-testid="coupons-search" placeholder="Search code..." value={search} onChange={(e)=>setSearch(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none pl-9 w-56"/></div>
          <Button onClick={() => { setForm(empty); setOpen(true); }} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold" data-testid="new-coupon-btn"><Plus className="h-4 w-4 mr-2" /> New Coupon</Button>
        </div>
      </div>
      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400"><tr><th className="text-left p-3">Code</th><th className="text-left p-3">Type</th><th className="text-left p-3">Value</th><th className="text-left p-3">Min Order</th><th className="text-left p-3">Usage</th><th className="text-left p-3">Active</th><th className="p-3"></th></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                <td className="p-3 font-mono">{c.code}</td>
                <td className="p-3 text-xs uppercase tracking-widest">{c.type}</td>
                <td className="p-3 font-mono">{c.type === "percent" ? `${c.value}%` : `$${c.value}`}</td>
                <td className="p-3 font-mono">${c.min_order}</td>
                <td className="p-3 font-mono">{c.used_count}/{c.usage_limit || "∞"}</td>
                <td className="p-3">{c.active ? <span className="text-green-400 text-xs">Active</span> : <span className="text-zinc-500 text-xs">Off</span>}</td>
                <td className="p-3 text-right">
                  <button onClick={() => { setForm(c); setOpen(true); }} className="text-zinc-400 hover:text-white p-1"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del(c.id)} className="text-zinc-400 hover:text-red-400 p-1"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-zinc-500">No coupons</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-md">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">{form.id ? "Edit" : "New"} Coupon</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Code</Label><Input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1 font-mono" data-testid="coupon-code" /></div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-950 border-zinc-800 text-white"><SelectItem value="percent">Percent (%)</SelectItem><SelectItem value="fixed">Fixed ($)</SelectItem></SelectContent></Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Value</Label><Input type="number" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Min Order</Label><Input type="number" step="0.01" value={form.min_order} onChange={(e) => setForm({ ...form, min_order: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            </div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Usage Limit (0=∞)</Label><Input type="number" value={form.usage_limit} onChange={(e) => setForm({ ...form, usage_limit: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div className="flex items-center gap-2"><Label className="text-xs uppercase tracking-widest text-zinc-400">Active</Label><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold" data-testid="save-coupon-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
