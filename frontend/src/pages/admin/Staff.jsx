import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const ROLES = ["super_admin", "manager", "sales_staff", "inventory_staff", "accountant"];
const empty = { user_id: null, email: "", name: "", phone: "", role: "sales_staff", base_salary: 0, active: true };

export default function Staff() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => setRows((await api.get("/admin/staff")).data);
  useEffect(() => { load(); }, []);

  if (user?.role !== "super_admin") {
    return (
      <div className="p-12 border border-zinc-900 text-center text-zinc-500">
        <div className="font-heading uppercase tracking-widest">Restricted</div>
        <div className="text-sm mt-2">Only Super Admin can manage staff.</div>
      </div>
    );
  }

  const save = async () => {
    try {
      const payload = { ...form, base_salary: form.base_salary ? parseFloat(form.base_salary) : null };
      if (form.user_id) await api.put(`/admin/staff/${form.user_id}`, payload);
      else await api.post("/admin/staff", payload);
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const deactivate = async (uid) => { if (!confirm("Deactivate?")) return; await api.delete(`/admin/staff/${uid}`); load(); };

  return (
    <div className="space-y-6" data-testid="admin-staff">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Staff</h1>
        <Button onClick={() => { setForm(empty); setOpen(true); }} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold" data-testid="new-staff-btn">
          <Plus className="h-4 w-4 mr-2" /> New Staff
        </Button>
      </div>
      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400"><tr><th className="text-left p-3">Name</th><th className="text-left p-3">Email</th><th className="text-left p-3">Role</th><th className="text-left p-3">Phone</th><th className="text-left p-3">Salary</th><th className="text-left p-3">Active</th><th className="p-3"></th></tr></thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.user_id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                <td className="p-3 font-semibold">{s.name}</td>
                <td className="p-3 text-zinc-400">{s.email}</td>
                <td className="p-3"><span className="text-[10px] uppercase tracking-widest px-2 py-1 border border-zinc-800">{s.role.replace("_", " ")}</span></td>
                <td className="p-3 text-zinc-400">{s.phone || "—"}</td>
                <td className="p-3 font-mono">{s.base_salary ? `$${s.base_salary}` : "—"}</td>
                <td className="p-3">{s.active ? <span className="text-green-400 text-xs">Active</span> : <span className="text-zinc-500 text-xs">Inactive</span>}</td>
                <td className="p-3 text-right">
                  <button onClick={() => { setForm(s); setOpen(true); }} className="text-zinc-400 hover:text-white p-1"><Pencil className="h-4 w-4" /></button>
                  {s.user_id !== user.user_id && <button onClick={() => deactivate(s.user_id)} className="text-zinc-400 hover:text-red-400 p-1"><Trash2 className="h-4 w-4" /></button>}
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-zinc-500">No staff yet</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-md">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">{form.user_id ? "Edit" : "New"} Staff</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Email (Google account)</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" data-testid="staff-email" /></div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Role</Label>
              <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}><SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-950 border-zinc-800 text-white">{ROLES.map(r => <SelectItem key={r} value={r}>{r.replace("_", " ")}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Phone</Label><Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Base Salary (for Payroll)</Label><Input type="number" step="0.01" value={form.base_salary || ""} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div className="flex items-center gap-2"><Label className="text-xs uppercase tracking-widest text-zinc-400">Active</Label><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div>
            <p className="text-[10px] text-zinc-500">Staff sign in using Google OAuth with this email. They'll be auto-assigned this role on first login.</p>
          </div>
          <DialogFooter><Button onClick={save} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold" data-testid="save-staff-btn">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
