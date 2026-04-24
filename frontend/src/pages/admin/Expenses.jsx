import React, { useEffect, useState } from "react";
import api, { formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["Rent", "Utilities", "Supplies", "Marketing", "Shipping", "Salaries", "Equipment", "Other"];

export default function Expenses() {
  const [rows, setRows] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: "Supplies", amount: 0, description: "" });

  const load = async () => setRows((await api.get("/admin/expenses")).data);
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      await api.post("/admin/expenses", { ...form, amount: parseFloat(form.amount) });
      toast.success("Saved"); setOpen(false); load();
    } catch { toast.error("Failed"); }
  };
  const del = async (id) => { if (!confirm("Delete?")) return; await api.delete(`/admin/expenses/${id}`); load(); };

  const total = rows.reduce((s, e) => s + e.amount, 0);

  return (
    <div className="space-y-6" data-testid="admin-expenses">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Expenses</h1>
          <p className="text-sm text-zinc-500 mt-1">Total logged: <span className="font-mono text-white">{formatPrice(total)}</span></p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold">
          <Plus className="h-4 w-4 mr-2" /> Log Expense
        </Button>
      </div>
      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400"><tr><th className="text-left p-3">Date</th><th className="text-left p-3">Category</th><th className="text-left p-3">Amount</th><th className="text-left p-3">Description</th><th className="p-3"></th></tr></thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                <td className="p-3 text-zinc-500 font-mono text-xs">{new Date(e.expense_date).toLocaleDateString()}</td>
                <td className="p-3 text-xs uppercase tracking-widest">{e.category}</td>
                <td className="p-3 font-mono text-[#FF3B30]">{formatPrice(e.amount)}</td>
                <td className="p-3 text-zinc-400">{e.description || "—"}</td>
                <td className="p-3 text-right"><button onClick={() => del(e.id)} className="text-zinc-400 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="p-12 text-center text-zinc-500">No expenses logged</td></tr>}
          </tbody>
        </table>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-md">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">Log Expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Category</Label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-none text-white p-2 text-sm">
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
