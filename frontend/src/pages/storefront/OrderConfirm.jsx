import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import api, { formatPrice } from "@/lib/api";
import { Check } from "lucide-react";

export default function OrderConfirm() {
  const { orderNumber } = useParams();
  const [order, setOrder] = useState(null);

  useEffect(() => {
    api.get(`/orders/${orderNumber}`).then(({ data }) => setOrder(data)).catch(() => {});
  }, [orderNumber]);

  if (!order) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-24 text-center">
        <div className="inline-block h-8 w-8 border-2 border-zinc-700 border-t-[#FF3B30] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-16 pb-24" data-testid="order-confirm">
      <div className="h-14 w-14 border-2 border-[#FF3B30] flex items-center justify-center mb-8">
        <Check className="h-7 w-7 text-[#FF3B30]" />
      </div>
      <div className="text-xs font-heading uppercase tracking-[0.35em] text-[#FF3B30] mb-3">Order Received</div>
      <h1 className="font-heading text-5xl font-black uppercase tracking-tighter mb-4">Thank you.</h1>
      <p className="text-zinc-400 mb-10">
        Order <span className="font-mono text-white">{order.order_number}</span> has been placed. A confirmation was sent to {order.customer_email || "your inbox"}.
      </p>

      <div className="border border-zinc-800 bg-zinc-950/60 p-6 mb-6">
        <h2 className="font-heading uppercase tracking-widest text-xs text-zinc-400 mb-4 pb-3 border-b border-zinc-900">Items</h2>
        <div className="space-y-3">
          {order.items.map((i) => (
            <div key={i.id} className="flex justify-between items-start gap-4 text-sm">
              <div>
                <div className="font-semibold">{i.product_name}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest">
                  {i.variant_label} · ×{i.quantity}
                </div>
              </div>
              <div className="font-mono">{formatPrice(i.subtotal)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="border border-zinc-800 bg-zinc-950/60 p-6 mb-10">
        <h2 className="font-heading uppercase tracking-widest text-xs text-zinc-400 mb-4 pb-3 border-b border-zinc-900">Summary</h2>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-zinc-500">Subtotal</dt><dd className="font-mono">{formatPrice(order.subtotal)}</dd></div>
          {order.discount > 0 && <div className="flex justify-between text-[#FF3B30]"><dt>Discount ({order.coupon_code})</dt><dd className="font-mono">-{formatPrice(order.discount)}</dd></div>}
          <div className="flex justify-between"><dt className="text-zinc-500">Shipping</dt><dd className="font-mono">{formatPrice(order.shipping)}</dd></div>
          <div className="flex justify-between pt-3 border-t border-zinc-900 font-heading uppercase tracking-widest"><dt>Total</dt><dd className="font-mono text-lg">{formatPrice(order.total)}</dd></div>
          <div className="flex justify-between pt-3"><dt className="text-zinc-500 text-xs uppercase tracking-widest">Status</dt><dd className="text-[#FF3B30] text-xs uppercase tracking-widest">{order.status}</dd></div>
        </dl>
      </div>

      <div className="flex gap-4">
        <Link to="/shop" className="bg-[#FF3B30] hover:bg-[#D92D23] text-white font-heading font-bold uppercase tracking-widest px-8 py-4">
          Continue Shopping
        </Link>
        <Link to="/account" className="border border-zinc-700 hover:border-white text-white font-heading font-bold uppercase tracking-widest px-8 py-4">
          View Orders
        </Link>
      </div>
    </div>
  );
}
