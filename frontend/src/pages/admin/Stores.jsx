import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const empty = { id: null, name: "", address: "", phone: "", is_online: false, active: true };

export default function Stores() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => setRows((await api.get("/admin/stores")).data);
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (form.id) await api.put(`/admin/stores/${form.id}`, form);
      else await api.post("/admin/stores", form);
      toast.success("Saved"); setOpen(false); load();
    } catch { toast.error("Failed"); }
  };
  const del = async (id) => { if (!confirm("Delete?")) return; await api.delete(`/admin/stores/${id}`); load(); };

  return (
    <div className="space-y-6" data-testid="admin-stores">
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Stores</h1>
        <Button onClick={() => { setForm(empty); setOpen(true); }} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold">
          <Plus className="h-4 w-4 mr-2" /> New Store
        </Button>
      </div>
      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400"><tr><th className="text-left p-3">Name</th><th className="text-left p-3">Address</th><th className="text-left p-3">Phone</th><th className="text-left p-3">Type</th><th className="text-left p-3">Active</th><th className="p-3"></th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                <td className="p-3 font-semibold">{s.name}</td>
                <td className="p-3 text-zinc-400">{s.address || "—"}</td>
                <td className="p-3 text-zinc-400">{s.phone || "—"}</td>
                <td className="p-3 text-xs uppercase tracking-widest">{s.is_online ? "Online" : "Physical"}</td>
                <td className="p-3">{s.active ? <span className="text-green-400 text-xs uppercase tracking-widest">Active</span> : <span className="text-zinc-500 text-xs">Inactive</span>}</td>
                <td className="p-3 text-right">
                  <button onClick={() => { setForm(s); setOpen(true); }} className="text-zinc-400 hover:text-white p-1"><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del(s.id)} className="text-zinc-400 hover:text-red-400 p-1"><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={6} className="p-12 text-center text-zinc-500">No stores</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-md">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">{form.id ? "Edit" : "New"} Store</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2"><Label className="text-xs uppercase tracking-widest text-zinc-400">Online</Label><Switch checked={form.is_online} onCheckedChange={(v) => setForm({ ...form, is_online: v })} /></div>
              <div className="flex items-center gap-2"><Label className="text-xs uppercase tracking-widest text-zinc-400">Active</Label><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
