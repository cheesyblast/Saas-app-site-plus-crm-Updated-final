import React, { useEffect, useState } from "react";
import api, { formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["pending", "paid", "processing", "shipped", "delivered", "cancelled"];

export default function Orders() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [view, setView] = useState(null);

  const load = async () => {
    const params = {};
    if (status !== "all") params.status = status;
    if (search) params.q = search;
    const { data } = await api.get("/admin/orders", { params });
    setOrders(data);
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [status, search]);

  const setOrderStatus = async (id, s) => {
    try {
      await api.put(`/admin/orders/${id}/status`, { status: s });
      toast.success(`Marked ${s}`);
      load();
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6 text-white" data-testid="admin-orders">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Orders</h1>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"/>
            <Input data-testid="orders-search" placeholder="Order #, name, phone, email..." value={search} onChange={(e)=>setSearch(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none pl-9 w-72"/>
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400">
            <tr><th className="text-left p-3">Order</th><th className="text-left p-3">Customer</th><th className="text-left p-3">Date</th><th className="text-left p-3">Total</th><th className="text-left p-3">Status</th><th className="text-left p-3">Source</th><th className="text-right p-3"></th></tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                <td className="p-3 font-mono text-xs">{o.order_number}</td>
                <td className="p-3">{o.customer_name}<div className="text-[10px] text-zinc-500">{o.customer_email}</div></td>
                <td className="p-3 text-zinc-500 font-mono text-xs">{new Date(o.created_at).toLocaleString()}</td>
                <td className="p-3 font-mono">{formatPrice(o.total)}</td>
                <td className="p-3">
                  <Select value={o.status} onValueChange={(v) => setOrderStatus(o.id, v)}>
                    <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none h-7 w-36 text-xs" data-testid={`order-status-${o.order_number}`}><SelectValue /></SelectTrigger>
                    <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                      {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="p-3 text-xs uppercase tracking-widest text-zinc-500">{o.source}</td>
                <td className="p-3 text-right">
                  <Button onClick={() => setView(o)} className="bg-transparent border border-zinc-800 hover:border-[#FF3B30] rounded-none text-xs uppercase tracking-widest">View</Button>
                </td>
              </tr>
            ))}
            {orders.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-zinc-500">No orders</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={!!view} onOpenChange={() => setView(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl rounded-none max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">Order {view?.order_number}</DialogTitle></DialogHeader>
          {view && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Customer</div>{view.customer_name}<div className="text-xs text-zinc-500">{view.customer_email}</div><div className="text-xs text-zinc-500">{view.customer_phone}</div></div>
                <div><div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Shipping Address</div><div className="text-xs whitespace-pre-line">{view.shipping_address || "—"}</div></div>
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
                {view.discount > 0 && <div className="flex justify-between text-[#FF3B30]"><dt>Discount</dt><dd className="font-mono">-{formatPrice(view.discount)}</dd></div>}
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
