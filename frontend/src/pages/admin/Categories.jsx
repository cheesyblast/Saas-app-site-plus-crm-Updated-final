import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2, Search, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import Pagination from "@/components/admin/Pagination";

const PAGE_SIZE = 50;

export default function Categories() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ id: null, name: "", description: "", parent_id: null, sort_order: 0 });
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const load = async () => {
    const { data } = await api.get("/categories", { params: search ? { q: search } : {} });
    // Recent first by sort_order ascending then id; we don't have created_at on /categories — keep server order then reverse for "recent on top" feel
    setRows([...data].reverse());
    setPage(1);
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [search]);

  // Build tree only for parent picker dropdown
  const flatForPicker = useMemo(() => {
    // Order children under parents
    const list = [];
    const all = [...rows].sort((a, b) => a.name.localeCompare(b.name));
    const visited = new Set();
    const visit = (parentId, depth) => {
      all.filter((c) => (c.parent_id || null) === parentId).forEach((c) => {
        if (visited.has(c.id)) return;
        visited.add(c.id);
        list.push({ ...c, depth });
        visit(c.id, depth + 1);
      });
    };
    visit(null, 0);
    return list;
  }, [rows]);

  const save = async () => {
    try {
      const payload = {
        name: form.name,
        description: form.description,
        parent_id: form.parent_id || null,
        sort_order: parseInt(form.sort_order) || 0,
      };
      if (form.id) await api.put(`/admin/categories/${form.id}`, payload);
      else await api.post("/admin/categories", payload);
      toast.success("Saved");
      setOpen(false);
      load();
    } catch { toast.error("Failed"); }
  };
  const del = async (id) => { if (!window.confirm("Delete? Sub-categories become top-level.")) return; await api.delete(`/admin/categories/${id}`); load(); };

  const start = (page - 1) * PAGE_SIZE;
  const pageRows = flatForPicker.slice(start, start + PAGE_SIZE);

  return (
    <div className="space-y-6 text-white" data-testid="admin-categories">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Categories</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input data-testid="categories-search" placeholder="Search category..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none pl-9 w-56" />
          </div>
          <Button onClick={() => { setForm({ id: null, name: "", description: "", parent_id: null, sort_order: 0 }); setOpen(true); }} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold" data-testid="new-cat-btn"><Plus className="h-4 w-4 mr-2" /> New</Button>
        </div>
      </div>
      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400">
            <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Parent</th><th className="text-left p-3">Slug</th><th className="text-left p-3">Description</th><th className="text-left p-3">Order</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {pageRows.map((c) => {
              const parent = rows.find((r) => r.id === c.parent_id);
              return (
                <tr key={c.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                  <td className="p-3 font-semibold">
                    <span style={{ paddingLeft: `${c.depth * 18}px` }} className="inline-flex items-center gap-1">
                      {c.depth > 0 && <ChevronRight className="h-3 w-3 text-zinc-600" />}
                      {c.name}
                    </span>
                  </td>
                  <td className="p-3 text-zinc-400">{parent ? parent.name : "—"}</td>
                  <td className="p-3 text-zinc-500 font-mono text-xs">{c.slug}</td>
                  <td className="p-3 text-zinc-400 truncate max-w-xs">{c.description || "—"}</td>
                  <td className="p-3 font-mono">{c.sort_order}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button onClick={() => { setForm({ id: c.id, name: c.name, description: c.description || "", parent_id: c.parent_id, sort_order: c.sort_order }); setOpen(true); }} className="text-zinc-400 hover:text-white p-1" data-testid={`edit-cat-${c.id}`}><Pencil className="h-4 w-4" /></button>
                    <button onClick={() => del(c.id)} className="text-zinc-400 hover:text-red-400 p-1"><Trash2 className="h-4 w-4" /></button>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-zinc-500">No categories yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={flatForPicker.length} onChange={setPage} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-md">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">{form.id ? "Edit" : "New"} Category</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Name *</Label><Input data-testid="cat-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Parent Category (optional)</Label>
              <Select value={form.parent_id || "_none"} onValueChange={(v) => setForm({ ...form, parent_id: v === "_none" ? null : v })}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1" data-testid="cat-parent"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">— None (top level) —</SelectItem>
                  {flatForPicker.filter((c) => c.id !== form.id).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{"— ".repeat(c.depth)}{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Sort Order</Label><Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-[var(--theme-primary,#FF3B30)] rounded-none font-heading uppercase tracking-widest" data-testid="save-cat-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
