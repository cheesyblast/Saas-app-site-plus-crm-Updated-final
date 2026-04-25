import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Search, ArrowLeftRight } from "lucide-react";
import { toast } from "sonner";
import { formatApiErrorDetail } from "@/lib/errors";

export default function Inventory() {
  const [rows, setRows] = useState([]);
  const [moves, setMoves] = useState([]);
  const [stores, setStores] = useState([]);
  const [search, setSearch] = useState("");
  const [storeFilter, setStoreFilter] = useState("all");
  const [dlg, setDlg] = useState(false);
  const [target, setTarget] = useState(null);
  const [form, setForm] = useState({ type: "in", quantity: 0, reason: "" });
  const [transferDlg, setTransferDlg] = useState(false);
  const [transferForm, setTransferForm] = useState({ variant_id: "", from_store_id: "", to_store_id: "", quantity: 1, reason: "" });

  const load = async () => {
    const params = {};
    if (search) params.q = search;
    if (storeFilter !== "all") params.store_id = storeFilter;
    const { data } = await api.get("/admin/inventory", { params });
    setRows(data);
    const { data: m } = await api.get("/admin/stock-movements", { params: { limit: 30 } });
    setMoves(m);
  };
  useEffect(() => { const t = setTimeout(load, 150); return () => clearTimeout(t); }, [search, storeFilter]);
  useEffect(() => { api.get("/admin/stores").then(({ data }) => setStores(data)); }, []);

  const submit = async () => {
    try {
      await api.post("/admin/stock-movements", {
        variant_id: target.variant_id, store_id: target.store_id,
        type: form.type, quantity: parseInt(form.quantity), reason: form.reason,
      });
      toast.success("Stock updated"); setDlg(false); load();
    } catch { toast.error("Failed"); }
  };

  const startTransfer = (row) => {
    setTransferForm({ variant_id: row.variant_id, from_store_id: row.store_id, to_store_id: "", quantity: 1, reason: "" });
    setTransferDlg(true);
  };

  const submitTransfer = async () => {
    try {
      const { data } = await api.post("/admin/inventory/transfer", { ...transferForm, quantity: parseInt(transferForm.quantity) });
      toast.success(`Transfer ${data.reference} complete`);
      setTransferDlg(false); load();
    } catch (e) { toast.error(formatApiErrorDetail(e?.response?.data?.detail) || "Transfer failed"); }
  };

  const lowCount = rows.filter((r) => r.low).length;
  const transferTarget = useMemo(() => rows.find((r) => r.variant_id === transferForm.variant_id && r.store_id === transferForm.from_store_id), [rows, transferForm.variant_id, transferForm.from_store_id]);

  return (
    <div className="space-y-6 text-white" data-testid="admin-inventory">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Inventory</h1>
        <div className="flex items-center gap-3 flex-wrap">
          {lowCount > 0 && (
            <div className="flex items-center gap-2 border border-[var(--theme-primary,#FF3B30)] text-[var(--theme-primary,#FF3B30)] px-4 py-2 text-xs font-heading uppercase tracking-widest">
              <AlertTriangle className="h-4 w-4" /> {lowCount} low stock
            </div>
          )}
          <Select value={storeFilter} onValueChange={setStoreFilter}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none w-44"><SelectValue/></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stores</SelectItem>
              {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.is_online?" (Online)":""}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"/>
            <Input data-testid="inventory-search" placeholder="Search product, SKU, color..." value={search} onChange={(e)=>setSearch(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none pl-9 w-72"/>
          </div>
        </div>
      </div>

      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400">
            <tr>
              <th className="text-left p-3">Product</th><th className="text-left p-3">Variant</th>
              <th className="text-left p-3">SKU</th><th className="text-left p-3">Store</th>
              <th className="text-left p-3">Qty</th><th className="text-left p-3">Threshold</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-t border-zinc-900 hover:bg-zinc-900/40 ${r.low ? "bg-[#FF3B30]/5" : ""}`}>
                <td className="p-3 font-semibold">{r.product_name}</td>
                <td className="p-3 text-zinc-400">{r.variant_label}</td>
                <td className="p-3 text-zinc-500 font-mono text-xs">{r.sku || "—"}</td>
                <td className="p-3 text-zinc-400">{r.store_name}</td>
                <td className="p-3 font-mono">{r.quantity} {r.low && <AlertTriangle className="h-3 w-3 inline ml-1 text-[var(--theme-primary,#FF3B30)]" />}</td>
                <td className="p-3 font-mono text-zinc-500">{r.low_stock_threshold}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <Button onClick={() => { setTarget(r); setForm({ type: "in", quantity: 10, reason: "" }); setDlg(true); }} className="bg-transparent border border-zinc-800 hover:border-[var(--theme-primary,#FF3B30)] rounded-none text-xs uppercase tracking-widest mr-1" data-testid={`stock-move-${r.variant_id}`}>Move</Button>
                  <Button onClick={() => startTransfer(r)} className="bg-transparent border border-zinc-800 hover:border-blue-400 hover:text-blue-400 rounded-none text-xs uppercase tracking-widest gap-1" data-testid={`stock-transfer-${r.variant_id}`}><ArrowLeftRight className="h-3 w-3"/>Transfer</Button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-zinc-500">No inventory matching filter.</td></tr>}
          </tbody>
        </table>
      </div>

      <div>
        <h2 className="font-heading uppercase tracking-widest text-sm mb-3">Recent Movements</h2>
        <div className="border border-zinc-900 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400">
              <tr><th className="text-left p-3">Date</th><th className="text-left p-3">Type</th><th className="text-left p-3">Store</th><th className="text-left p-3">Product</th><th className="text-left p-3">Variant</th><th className="text-left p-3">Qty</th><th className="text-left p-3">Reason</th></tr>
            </thead>
            <tbody>
              {moves.map((m) => (
                <tr key={m.id} className="border-t border-zinc-900">
                  <td className="p-3 text-zinc-500 font-mono text-xs">{new Date(m.created_at).toLocaleString()}</td>
                  <td className="p-3"><span className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${
                    m.type==="in"||m.type==="transfer_in" ? "border-green-700 text-green-400" :
                    m.type==="sale"||m.type==="transfer_out" ? "border-[#FF3B30] text-[#FF3B30]" : "border-zinc-700 text-zinc-400"}`}>{m.type}</span></td>
                  <td className="p-3 text-zinc-400 text-xs">{m.store_name}</td>
                  <td className="p-3">{m.product_name}</td>
                  <td className="p-3 text-zinc-400">{m.variant_label}</td>
                  <td className="p-3 font-mono">{m.quantity}</td>
                  <td className="p-3 text-zinc-500">{m.reason || "—"}</td>
                </tr>
              ))}
              {moves.length === 0 && <tr><td colSpan={7} className="p-6 text-center text-zinc-500 text-xs">No movements yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Move dialog (in/out/adjust) */}
      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-md">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">Stock Movement</DialogTitle></DialogHeader>
          {target && (
            <div className="space-y-3">
              <div className="text-xs text-zinc-400">{target.product_name} — {target.variant_label} <span className="text-zinc-500">@ {target.store_name}</span></div>
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="in">Stock In</SelectItem><SelectItem value="out">Stock Out</SelectItem><SelectItem value="adjust">Adjust (Set to)</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Quantity</Label><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" data-testid="stock-qty" /></div>
              <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Reason</Label><Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            </div>
          )}
          <DialogFooter><Button onClick={submit} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold" data-testid="stock-submit">Apply</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Transfer dialog */}
      <Dialog open={transferDlg} onOpenChange={setTransferDlg}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-md">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest gap-2 flex items-center"><ArrowLeftRight className="h-4 w-4"/>Transfer Stock</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {transferTarget && <div className="text-xs text-zinc-400">{transferTarget.product_name} — {transferTarget.variant_label}</div>}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">From</Label>
                <Select value={transferForm.from_store_id} onValueChange={(v)=>setTransferForm(f=>({...f, from_store_id: v}))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue/></SelectTrigger>
                  <SelectContent>{stores.map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                {transferTarget && <p className="text-[10px] text-zinc-500 mt-1">Available: {transferTarget.quantity}</p>}
              </div>
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">To</Label>
                <Select value={transferForm.to_store_id} onValueChange={(v)=>setTransferForm(f=>({...f, to_store_id: v}))}>
                  <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1" data-testid="transfer-to-store"><SelectValue placeholder="Select destination"/></SelectTrigger>
                  <SelectContent>{stores.filter(s=>s.id!==transferForm.from_store_id).map(s=><SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Quantity</Label><Input type="number" min="1" value={transferForm.quantity} onChange={(e)=>setTransferForm(f=>({...f, quantity:e.target.value}))} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" data-testid="transfer-qty"/></div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Reason (optional)</Label><Input value={transferForm.reason} onChange={(e)=>setTransferForm(f=>({...f, reason:e.target.value}))} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" placeholder="Restocking offline branch"/></div>
          </div>
          <DialogFooter><Button onClick={submitTransfer} className="bg-blue-600 hover:bg-blue-700 rounded-none uppercase tracking-widest font-bold" data-testid="transfer-submit">Transfer</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
