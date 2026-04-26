import React, { useEffect, useState } from "react";
import api, { formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Search, DollarSign, Receipt } from "lucide-react";
import { toast } from "sonner";
import Pagination from "@/components/admin/Pagination";

const PAGE_SIZE = 50;
const empty = { id: null, name: "", contact_person: "", phone: "", email: "", address: "", notes: "", active: true };

export default function Suppliers() {
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [payOpen, setPayOpen] = useState(null); // supplier object
  const [pay, setPay] = useState({ amount: 0, method: "cash", cash_account_id: "", notes: "" });
  const [invOpen, setInvOpen] = useState(null);
  const [inv, setInv] = useState({ amount: 0, reference: "", notes: "" });
  const [accounts, setAccounts] = useState([]);

  const load = async () => {
    const { data } = await api.get("/admin/suppliers", { params: { ...(search ? { q: search } : {}), page, page_size: PAGE_SIZE } });
    setRows(data.items || []); setTotal(data.total || 0);
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [search, page]);
  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { api.get("/admin/cash-accounts").then(({ data }) => setAccounts(data || [])); }, []);

  const save = async () => {
    try {
      if (form.id) await api.put(`/admin/suppliers/${form.id}`, form);
      else await api.post("/admin/suppliers", form);
      toast.success("Saved"); setOpen(false); load();
    } catch { toast.error("Failed"); }
  };
  const del = async (id) => { if (!confirm("Delete supplier?")) return; await api.delete(`/admin/suppliers/${id}`); load(); };

  const submitPay = async () => {
    try {
      await api.post("/admin/supplier-payments", { supplier_id: payOpen.id, amount: parseFloat(pay.amount),
        method: pay.method, cash_account_id: pay.cash_account_id || null, notes: pay.notes || null });
      toast.success("Payment recorded"); setPayOpen(null); setPay({ amount: 0, method: "cash", cash_account_id: "", notes: "" }); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const submitInv = async () => {
    try {
      await api.post("/admin/supplier-invoices", { supplier_id: invOpen.id, amount: parseFloat(inv.amount),
        reference: inv.reference || null, notes: inv.notes || null });
      toast.success("Invoice added"); setInvOpen(null); setInv({ amount: 0, reference: "", notes: "" }); load();
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6 text-white" data-testid="admin-suppliers">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Suppliers</h1>
          <p className="text-sm text-zinc-500 mt-1">{total} suppliers</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"/><Input data-testid="suppliers-search" placeholder="Search..." value={search} onChange={(e)=>setSearch(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none pl-9 w-56"/></div>
          <Button data-testid="new-supplier-btn" onClick={() => { setForm(empty); setOpen(true); }} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold"><Plus className="h-4 w-4 mr-2" /> New Supplier</Button>
        </div>
      </div>

      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400">
            <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Contact</th><th className="text-left p-3">Phone</th><th className="text-left p-3">Purchases</th><th className="text-left p-3">Owed</th><th className="text-left p-3">Active</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                <td className="p-3 font-semibold">{s.name}</td>
                <td className="p-3 text-zinc-400">{s.contact_person || s.email || "—"}</td>
                <td className="p-3 text-zinc-400">{s.phone || "—"}</td>
                <td className="p-3 font-mono">{formatPrice(s.total_purchases)}</td>
                <td className={`p-3 font-mono ${s.balance_owed > 0 ? "text-[#FF3B30]" : "text-zinc-500"}`}>{formatPrice(s.balance_owed)}</td>
                <td className="p-3">{s.active ? <span className="text-green-400 text-xs">Active</span> : <span className="text-zinc-500 text-xs">Off</span>}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button data-testid={`add-invoice-${s.id}`} title="Add stock-in invoice (payable)" onClick={() => setInvOpen(s)} className="text-zinc-400 hover:text-yellow-300 p-1"><Receipt className="h-4 w-4"/></button>
                  <button data-testid={`pay-supplier-${s.id}`} title="Pay supplier" onClick={() => setPayOpen(s)} className="text-zinc-400 hover:text-green-400 p-1"><DollarSign className="h-4 w-4"/></button>
                  <button onClick={() => { setForm(s); setOpen(true); }} className="text-zinc-400 hover:text-white p-1"><Pencil className="h-4 w-4"/></button>
                  <button onClick={() => del(s.id)} className="text-zinc-400 hover:text-red-400 p-1"><Trash2 className="h-4 w-4"/></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-zinc-500">No suppliers yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-md">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">{form.id ? "Edit" : "New"} Supplier</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Name</Label><Input data-testid="supplier-form-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Contact Person</Label><Input value={form.contact_person || ""} onChange={(e) => setForm({ ...form, contact_person: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Phone</Label><Input value={form.phone || ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            </div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Email</Label><Input value={form.email || ""} onChange={(e) => setForm({ ...form, email: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Address</Label><Textarea value={form.address || ""} onChange={(e) => setForm({ ...form, address: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Notes</Label><Textarea value={form.notes || ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div className="flex items-center gap-2"><Label className="text-xs uppercase tracking-widest text-zinc-400">Active</Label><Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} /></div>
          </div>
          <DialogFooter><Button data-testid="save-supplier-btn" onClick={save} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!invOpen} onOpenChange={() => setInvOpen(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-md">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">Stock-In Invoice — {invOpen?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">Logs a payable. Adds to supplier balance owed.</p>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Amount</Label><Input type="number" step="0.01" value={inv.amount} onChange={(e) => setInv({ ...inv, amount: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Reference / PO #</Label><Input value={inv.reference} onChange={(e) => setInv({ ...inv, reference: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Notes</Label><Textarea value={inv.notes} onChange={(e) => setInv({ ...inv, notes: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
          </div>
          <DialogFooter><Button onClick={submitInv} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold">Add Invoice</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!payOpen} onOpenChange={() => setPayOpen(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-md">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">Pay Supplier — {payOpen?.name}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-zinc-500">Outstanding: <span className="text-white font-mono">{formatPrice(payOpen?.balance_owed || 0)}</span></p>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Amount</Label><Input data-testid="pay-amount" type="number" step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Method</Label>
              <Select value={pay.method} onValueChange={(v) => setPay({ ...pay, method: v })}><SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-950 border-zinc-800 text-white"><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank">Bank</SelectItem></SelectContent></Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Cash / Bank Account (optional)</Label>
              <Select value={pay.cash_account_id || "_none"} onValueChange={(v) => setPay({ ...pay, cash_account_id: v === "_none" ? "" : v })}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectItem value="_none">— None —</SelectItem>
                  {accounts.filter(a => a.kind === pay.method).map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({formatPrice(a.balance)})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Notes</Label><Textarea value={pay.notes} onChange={(e) => setPay({ ...pay, notes: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
          </div>
          <DialogFooter><Button data-testid="submit-pay-btn" onClick={submitPay} className="bg-green-600 hover:bg-green-700 rounded-none uppercase tracking-widest font-bold">Pay</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
