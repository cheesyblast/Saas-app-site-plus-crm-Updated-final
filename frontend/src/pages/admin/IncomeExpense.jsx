import React, { useEffect, useState } from "react";
import api, { formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Search } from "lucide-react";
import { toast } from "sonner";
import Pagination from "@/components/admin/Pagination";

const EXP_CATEGORIES = ["Rent", "Utilities", "Supplies", "Marketing", "Shipping", "Salaries", "Equipment", "Other"];
const INC_CATEGORIES = ["Investment", "Refund", "Loan", "Interest", "Other"];
const PAGE_SIZE = 50;

function Pane({ kind }) {
  const isExp = kind === "expense";
  const path = isExp ? "/admin/expenses" : "/admin/income";
  const dateField = isExp ? "expense_date" : "income_date";
  const cats = isExp ? EXP_CATEGORIES : INC_CATEGORIES;

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("_all");
  const [stores, setStores] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ category: cats[0], amount: 0, description: "", store_id: "", method: "cash", cash_account_id: "" });

  const load = async () => {
    const params = { page, page_size: PAGE_SIZE };
    if (search) params.q = search;
    if (storeFilter && storeFilter !== "_all") params.store_id = storeFilter;
    const { data } = await api.get(path, { params });
    setRows(data.items || []); setTotal(data.total || 0);
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [search, page, storeFilter]);
  useEffect(() => { setPage(1); }, [search, storeFilter]);
  useEffect(() => {
    api.get("/admin/stores").then(({ data }) => setStores(data || []));
    api.get("/admin/cash-accounts").then(({ data }) => setAccounts(data || []));
  }, []);

  const save = async () => {
    try {
      const payload = { ...form, amount: parseFloat(form.amount), store_id: form.store_id || null, cash_account_id: form.cash_account_id || null };
      await api.post(path, payload);
      toast.success("Saved"); setOpen(false); load();
      setForm({ category: cats[0], amount: 0, description: "", store_id: "", method: "cash", cash_account_id: "" });
    } catch { toast.error("Failed"); }
  };
  const del = async (id) => { if (!confirm("Delete?")) return; await api.delete(`${path}/${id}`); load(); };
  const sumTotal = rows.reduce((s, r) => s + r.amount, 0);
  const storeName = (sid) => sid ? (stores.find(s => s.id === sid)?.name || "—") : "—";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-zinc-500">Total on this page: <span className="font-mono text-white">{formatPrice(sumTotal)}</span> · {total} total</p>
        <div className="flex items-center gap-3">
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none w-44 h-9 text-xs"><SelectValue placeholder="All outlets"/></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              <SelectItem value="_all">All outlets</SelectItem>
              {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"/><Input data-testid={`${kind}-search`} placeholder="Search..." value={search} onChange={(e)=>setSearch(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none pl-9 w-56 h-9"/></div>
          <Button data-testid={`new-${kind}-btn`} onClick={() => setOpen(true)} className={`${isExp?"bg-[#FF3B30] hover:bg-[#D92D23]":"bg-green-600 hover:bg-green-700"} rounded-none uppercase tracking-widest font-bold h-9`}>
            <Plus className="h-4 w-4 mr-2" /> Log {isExp?"Expense":"Income"}
          </Button>
        </div>
      </div>
      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400"><tr><th className="text-left p-3">Date</th><th className="text-left p-3">Category</th><th className="text-left p-3">Outlet</th><th className="text-left p-3">Method</th><th className="text-left p-3">Amount</th><th className="text-left p-3">Description</th><th className="p-3"></th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                <td className="p-3 text-zinc-500 font-mono text-xs">{new Date(r[dateField]).toLocaleDateString()}</td>
                <td className="p-3 text-xs uppercase tracking-widest">{r.category}</td>
                <td className="p-3 text-zinc-400 text-xs">{storeName(r.store_id)}</td>
                <td className="p-3 text-zinc-400 text-xs uppercase tracking-widest">{r.method || "cash"}</td>
                <td className={`p-3 font-mono ${isExp ? "text-[#FF3B30]" : "text-green-400"}`}>{formatPrice(r.amount)}</td>
                <td className="p-3 text-zinc-400">{r.description || "—"}</td>
                <td className="p-3 text-right"><button onClick={() => del(r.id)} className="text-zinc-400 hover:text-red-400"><Trash2 className="h-4 w-4" /></button></td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-zinc-500">No {isExp?"expenses":"income"} logged</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-md">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">Log {isExp?"Expense":"Income"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue /></SelectTrigger><SelectContent className="bg-zinc-950 border-zinc-800 text-white">{cats.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Amount</Label><Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Outlet</Label>
                <Select value={form.store_id || "_none"} onValueChange={(v) => setForm({ ...form, store_id: v === "_none" ? "" : v })}><SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue placeholder="—"/></SelectTrigger><SelectContent className="bg-zinc-950 border-zinc-800 text-white"><SelectItem value="_none">— None —</SelectItem>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select>
              </div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Method</Label>
                <Select value={form.method} onValueChange={(v) => setForm({ ...form, method: v })}><SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue/></SelectTrigger><SelectContent className="bg-zinc-950 border-zinc-800 text-white"><SelectItem value="cash">Cash</SelectItem><SelectItem value="bank">Bank</SelectItem></SelectContent></Select>
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Cash / Bank Account (auto-updates balance)</Label>
              <Select value={form.cash_account_id || "_none"} onValueChange={(v) => setForm({ ...form, cash_account_id: v === "_none" ? "" : v })}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectItem value="_none">— None —</SelectItem>
                  {accounts.filter(a => a.kind === form.method).map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({formatPrice(a.balance)})</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Description</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
          </div>
          <DialogFooter><Button onClick={save} className={`${isExp?"bg-[#FF3B30] hover:bg-[#D92D23]":"bg-green-600 hover:bg-green-700"} rounded-none uppercase tracking-widest font-bold`}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function IncomeExpense() {
  const [tab, setTab] = useState("expense");
  return (
    <div className="space-y-6 text-white" data-testid="admin-inc-exp">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Inc &amp; Exp</h1>
          <p className="text-sm text-zinc-500 mt-1">Track your money in &amp; out per outlet, drawer, and account.</p>
        </div>
        <div className="flex gap-1 border border-zinc-800">
          <button data-testid="tab-expense" onClick={() => setTab("expense")} className={`px-4 py-2 text-xs uppercase tracking-widest font-heading ${tab==="expense"?"bg-[#FF3B30] text-white":"text-zinc-400 hover:text-white"}`}>Expenses</button>
          <button data-testid="tab-income" onClick={() => setTab("income")} className={`px-4 py-2 text-xs uppercase tracking-widest font-heading ${tab==="income"?"bg-green-600 text-white":"text-zinc-400 hover:text-white"}`}>Income</button>
        </div>
      </div>
      <Pane key={tab} kind={tab} />
    </div>
  );
}
