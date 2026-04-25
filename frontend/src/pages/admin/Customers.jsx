import React, { useEffect, useState } from "react";
import api, { formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pencil, Search } from "lucide-react";
import { toast } from "sonner";

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [edit, setEdit] = useState(null);
  const [search, setSearch] = useState("");

  const load = async () => setRows((await api.get("/admin/customers", { params: search ? { q: search } : {} })).data);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [search]);

  const save = async () => {
    try {
      await api.put(`/admin/customers/${edit.id}`, edit);
      toast.success("Saved");
      setEdit(null);
      load();
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6 text-white" data-testid="admin-customers">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Customers</h1>
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"/>
          <Input data-testid="customers-search" placeholder="Search by name, phone, email or order #..." value={search} onChange={(e)=>setSearch(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none pl-9"/>
        </div>
      </div>
      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400">
            <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3">Phone</th><th className="text-left p-3">Orders</th><th className="text-left p-3">Spent</th><th className="text-left p-3">Since</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                <td className="p-3 font-semibold">{c.name}</td>
                <td className="p-3 text-zinc-400">{c.email || "—"}</td>
                <td className="p-3 text-zinc-400">{c.phone || "—"}</td>
                <td className="p-3 font-mono">{c.total_orders}</td>
                <td className="p-3 font-mono">{formatPrice(c.total_spent)}</td>
                <td className="p-3 text-zinc-500 font-mono text-xs">{new Date(c.created_at).toLocaleDateString()}</td>
                <td className="p-3 text-right">
                  <button onClick={() => setEdit(c)} className="text-zinc-400 hover:text-white p-1"><Pencil className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-zinc-500">No customers yet</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={!!edit} onOpenChange={() => setEdit(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">Edit Customer</DialogTitle></DialogHeader>
          {edit && (
            <div className="space-y-3">
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Name</Label><Input value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Email</Label><Input value={edit.email || ""} onChange={(e) => setEdit({ ...edit, email: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Phone</Label><Input value={edit.phone || ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Address</Label><Textarea value={edit.address || ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Notes</Label><Textarea value={edit.notes || ""} onChange={(e) => setEdit({ ...edit, notes: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            </div>
          )}
          <DialogFooter><Button onClick={save} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
