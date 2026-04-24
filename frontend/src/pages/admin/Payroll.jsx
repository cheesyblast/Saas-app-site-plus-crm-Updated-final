import React, { useEffect, useState } from "react";
import api, { formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus } from "lucide-react";
import { toast } from "sonner";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function Payroll() {
  const [rows, setRows] = useState([]);
  const [staff, setStaff] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ staff_user_id: "", month: new Date().getMonth() + 1, year: new Date().getFullYear(), base_salary: 0, bonus: 0, deduction: 0, status: "pending" });

  const load = async () => {
    setRows((await api.get("/admin/payroll")).data);
    setStaff((await api.get("/admin/staff")).data);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/admin/payroll", {
        ...form,
        base_salary: parseFloat(form.base_salary), bonus: parseFloat(form.bonus),
        deduction: parseFloat(form.deduction), month: parseInt(form.month), year: parseInt(form.year),
      });
      toast.success("Saved"); setOpen(false); load();
    } catch { toast.error("Failed"); }
  };
  const pay = async (id) => { await api.put(`/admin/payroll/${id}/pay`); toast.success("Marked paid"); load(); };

  return (
    <div className="space-y-6" data-testid="admin-payroll">
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Payroll</h1>
        <Button onClick={() => setOpen(true)} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold"><Plus className="h-4 w-4 mr-2" /> Run</Button>
      </div>
      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400"><tr><th className="text-left p-3">Staff</th><th className="text-left p-3">Period</th><th className="text-left p-3">Base</th><th className="text-left p-3">Bonus</th><th className="text-left p-3">Deduction</th><th className="text-left p-3">Net</th><th className="text-left p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                <td className="p-3 font-semibold">{p.staff_name}</td>
                <td className="p-3 font-mono text-xs">{MONTHS[p.month-1]} {p.year}</td>
                <td className="p-3 font-mono">{formatPrice(p.base_salary)}</td>
                <td className="p-3 font-mono text-green-400">{formatPrice(p.bonus)}</td>
                <td className="p-3 font-mono text-red-400">{formatPrice(p.deduction)}</td>
                <td className="p-3 font-mono">{formatPrice(p.net)}</td>
                <td className="p-3"><span className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${p.status === "paid" ? "border-green-700 text-green-400" : "border-[#FF3B30] text-[#FF3B30]"}`}>{p.status}</span></td>
                <td className="p-3 text-right">{p.status !== "paid" && <Button onClick={() => pay(p.id)} className="bg-transparent border border-zinc-800 hover:border-green-500 rounded-none text-xs uppercase tracking-widest">Mark Paid</Button>}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="p-12 text-center text-zinc-500">No payroll runs</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-md">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">Run Payroll</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Staff</Label>
              <Select value={form.staff_user_id} onValueChange={(v) => { setForm({ ...form, staff_user_id: v, base_salary: staff.find(s => s.user_id === v)?.base_salary || 0 }); }}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                  {staff.map(s => <SelectItem key={s.user_id} value={s.user_id}>{s.name} — {s.role}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Month</Label><Input type="number" min={1} max={12} value={form.month} onChange={(e) => setForm({ ...form, month: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Year</Label><Input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            </div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Base Salary</Label><Input type="number" step="0.01" value={form.base_salary} onChange={(e) => setForm({ ...form, base_salary: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Bonus</Label><Input type="number" step="0.01" value={form.bonus} onChange={(e) => setForm({ ...form, bonus: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Deduction</Label><Input type="number" step="0.01" value={form.deduction} onChange={(e) => setForm({ ...form, deduction: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            </div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
