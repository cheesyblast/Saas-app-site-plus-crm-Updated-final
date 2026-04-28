import React, { useEffect, useState } from "react";
import api, { formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, CheckCircle2, Lock, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import Pagination from "@/components/admin/Pagination";

const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"];
const PAGE_SIZE = 50;

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState(null);

  const load = async () => {
    const params = { page, page_size: PAGE_SIZE };
    if (status !== "all") params.status = status;
    if (search) params.q = search;
    const { data } = await api.get("/admin/orders", { params });
    setOrders(data.items || []); setTotal(data.total || 0);
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [status, search, page]);
  useEffect(() => { setPage(1); }, [status, search]);

  const setOrderStatus = async (id, s) => {
    try {
      const { data } = await api.put(`/admin/orders/${id}/status`, { status: s });
      if (data.status === "completed") {
        toast.success(`Order completed · payment booked to bank`, { description: "Cash ledger updated automatically." });
      } else {
        toast.success(`Marked ${s}`);
      }
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const cashReceived = async (id, num) => {
    if (!window.confirm(`Mark order ${num} as paid (cash received) and complete it? This cannot be undone.`)) return;
    try {
      const { data } = await api.post(`/admin/orders/${id}/cash-received`);
      toast.success(`Banked to "${data.credited_account_name}" · order completed`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div className="space-y-6 text-white" data-testid="admin-orders">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Orders</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input data-testid="orders-search" placeholder="Order #, name, phone, email..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none pl-9 w-72" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none w-44" data-testid="order-status-filter"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400">
            <tr><th className="text-left p-3">Order</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Date</th><th className="text-left p-3">Total</th><th className="text-left p-3">Pay</th><th className="text-left p-3">Status</th><th className="text-left p-3">Source</th><th className="text-right p-3"></th></tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const completed = o.status === "completed";
              const isCOD = o.payment_method === "cod" && o.payment_status !== "paid";
              return (
                <tr key={o.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                  <td className="p-3 font-mono text-xs">{o.order_number}</td>
                  <td className="p-3">{o.customer_name}<div className="text-[10px] text-zinc-500">{o.customer_phone || o.customer_email}</div></td>
                  <td className="p-3 text-zinc-500 font-mono text-xs">{new Date(o.created_at).toLocaleString()}</td>
                  <td className="p-3 font-mono">{formatPrice(o.total)}</td>
                  <td className="p-3 text-xs uppercase tracking-widest">
                    <span className="text-zinc-500">{o.payment_method}</span>
                    <span className={`block mt-0.5 ${o.payment_status === "paid" ? "text-green-400" : "text-amber-400"}`}>{o.payment_status}</span>
                  </td>
                  <td className="p-3">
                    {completed ? (
                      <span data-testid={`order-completed-${o.order_number}`} className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest px-3 py-1.5 bg-green-600/15 text-green-400 border border-green-600/40">
                        <BadgeCheck className="h-3 w-3"/>Completed{o.cash_account_id && o.payment_method !== "cod" ? <span className="text-[9px] opacity-80 ml-1">· Banked</span> : null}<Lock className="h-2.5 w-2.5 ml-1 opacity-70"/>
                      </span>
                    ) : (
                      <Select value={o.status} onValueChange={(v) => setOrderStatus(o.id, v)}>
                        <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none h-7 w-36 text-xs" data-testid={`order-status-${o.order_number}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="p-3 text-xs uppercase tracking-widest text-zinc-500">{o.source}</td>
                  <td className="p-3 text-right whitespace-nowrap">
                    {isCOD && !completed && (
                      <Button onClick={() => cashReceived(o.id, o.order_number)} data-testid={`cash-received-${o.order_number}`} className="bg-green-600/15 hover:bg-green-600/30 text-green-400 border border-green-600/40 rounded-none text-[10px] uppercase tracking-widest gap-1 mr-1 h-8">
                        <CheckCircle2 className="h-3 w-3" /> Cash Received
                      </Button>
                    )}
                    <Button onClick={() => setView(o)} className="bg-transparent border border-zinc-800 hover:border-[var(--theme-primary,#FF3B30)] rounded-none text-xs uppercase tracking-widest h-8">View</Button>
                  </td>
                </tr>
              );
            })}
            {orders.length === 0 && <tr><td colSpan={8} className="p-12 text-center text-zinc-500">No orders</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      <Dialog open={!!view} onOpenChange={() => setView(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl rounded-none max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">Order {view?.order_number}</DialogTitle></DialogHeader>
          {view && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Customer</div>{view.customer_name}<div className="text-xs text-zinc-500">{view.customer_email}</div><div className="text-xs text-zinc-500">{view.customer_phone}</div></div>
                <div><div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Shipping Address</div><div className="text-xs whitespace-pre-line">{view.shipping_address || "—"}</div><div className="text-[10px] text-zinc-500 mt-1">{view.shipping_city}{view.shipping_district ? `, ${view.shipping_district}` : ""}</div></div>
              </div>
              <div className="border border-zinc-900">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-900/60 text-[10px] uppercase tracking-widest text-zinc-400"><tr><th className="text-left p-2">Item</th><th className="text-left p-2">Var</th><th className="text-left p-2">Qty</th><th className="text-right p-2">Total</th></tr></thead>
                  <tbody>
                    {view.items.map((i) => (
                      <tr key={i.id} className="border-t border-zinc-900">
                        <td className="p-2">{i.product_name}</td>
                        <td className="p-2 text-zinc-500 text-xs">{i.variant_label}</td>
                        <td className="p-2 font-mono">{i.quantity}</td>
                        <td className="p-2 text-right font-mono">{formatPrice(i.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <dl className="text-sm space-y-1">
                <div className="flex justify-between"><dt className="text-zinc-500">Subtotal</dt><dd className="font-mono">{formatPrice(view.subtotal)}</dd></div>
                {view.discount > 0 && <div className="flex justify-between text-[var(--theme-primary,#FF3B30)]"><dt>Discount</dt><dd className="font-mono">-{formatPrice(view.discount)}</dd></div>}
                <div className="flex justify-between"><dt className="text-zinc-500">Shipping</dt><dd className="font-mono">{formatPrice(view.shipping)}</dd></div>
                <div className="flex justify-between border-t border-zinc-900 pt-2"><dt className="font-heading uppercase tracking-widest">Total</dt><dd className="font-mono text-lg">{formatPrice(view.total)}</dd></div>
              </dl>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
