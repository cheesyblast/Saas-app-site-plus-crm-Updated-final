import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { toast } from "sonner";

export default function Categories() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: null, name: "", description: "", sort_order: 0 });
  const [search, setSearch] = useState("");

  const load = async () => {
    const { data } = await api.get("/categories", { params: search?{q:search}:{} });
    setRows(data);
  };
  useEffect(() => { const t=setTimeout(load,200); return () => clearTimeout(t); }, [search]);

  const save = async () => {
    try {
      if (form.id) await api.put(`/admin/categories/${form.id}`, { name: form.name, description: form.description, sort_order: parseInt(form.sort_order) || 0 });
      else await api.post("/admin/categories", { name: form.name, description: form.description, sort_order: parseInt(form.sort_order) || 0 });
      toast.success("Saved");
      setOpen(false);
      load();
    } catch (e) { toast.error("Failed"); }
  };
  const del = async (id) => { if (!confirm("Delete?")) return; await api.delete(`/admin/categories/${id}`); load(); };

  return (
    <div className="space-y-6 text-white" data-testid="admin-categories">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Categories</h1>
        <div className="flex items-center gap-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"/><Input data-testid="categories-search" placeholder="Search category..." value={search} onChange={(e)=>setSearch(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none pl-9 w-56"/></div>
          <Button onClick={() => { setForm({ id: null, name: "", description: "", sort_order: 0 }); setOpen(true); }} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold" data-testid="new-cat-btn"><Plus className="h-4 w-4 mr-2" /> New</Button>
        </div>
      </div>
      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400">
            <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Slug</th><th className="text-left p-3">Description</th><th className="text-left p-3">Order</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                <td className="p-3 font-semibold">{c.name}</td>
                <td className="p-3 text-zinc-500 font-mono text-xs">{c.slug}</td>
                <td className="p-3 text-zinc-400">{c.description || "—"}</td>
                <td className="p-3 font-mono">{c.sort_order}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button onClick={() => { setForm(c); setOpen(true); }} className="text-zinc-400 hover:text-white p-1"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del(c.id)} className="text-zinc-400 hover:text-red-400 p-1"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-12 text-center text-zinc-500">No categories yet</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-md">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">{form.id ? "Edit" : "New"} Category</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" data-testid="cat-name" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Description</Label>
              <Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Sort Order</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={save} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold" data-testid="save-cat-btn">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
