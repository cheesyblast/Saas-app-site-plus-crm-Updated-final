import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "@/lib/api";
import { Printer } from "lucide-react";

export default function Receipt() {
  const { orderNumber } = useParams();
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/receipt/${orderNumber}`).then(({ data }) => setR(data)).catch(() => setError("Receipt not found"));
  }, [orderNumber]);

  if (error) return <div className="min-h-screen bg-white text-black flex items-center justify-center text-sm">{error}</div>;
  if (!r) return <div className="min-h-screen bg-white text-black flex items-center justify-center text-sm">Loading…</div>;

  const cur = (r.company.currency || "LKR");
  const fmt = (v) => `${cur} ${(v || 0).toFixed(2)}`;
  const dt = new Date(r.created_at).toLocaleString();

  return (
    <div className="min-h-screen bg-zinc-100 text-black flex justify-center p-4 print-bg" data-testid="public-receipt">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-bg { background: white !important; padding: 0 !important; }
          @page { size: 80mm auto; margin: 4mm; }
        }
        .receipt {
          width: 80mm; max-width: 100%; background: white; padding: 14px;
          font-family: 'Courier New', ui-monospace, monospace; font-size: 12px; line-height: 1.4;
        }
        .row { display: flex; justify-content: space-between; gap: 8px; }
        .dashed { border-top: 1px dashed #444; margin: 8px 0; }
        .center { text-align: center; }
        .small { font-size: 10px; color: #555; }
        .b { font-weight: 700; }
      `}</style>
      <div className="receipt" data-testid="receipt-card">
        <div className="center b" style={{ fontSize: 16 }}>{r.company.name}</div>
        {r.company.address && <div className="center small">{r.company.address}</div>}
        {r.company.phone && <div className="center small">Tel: {r.company.phone}</div>}
        <div className="dashed"/>
        <div className="row"><span className="small">Order</span><span className="b">{r.order_number}</span></div>
        <div className="row"><span className="small">Date</span><span>{dt}</span></div>
        <div className="row"><span className="small">Customer</span><span>{r.customer_name}</span></div>
        <div className="row"><span className="small">Payment</span><span>{r.payment_method.toUpperCase()} · {r.payment_status}</span></div>
        <div className="dashed"/>
        {r.items.map((it, i) => (
          <div key={i}>
            <div className="row"><span>{it.name}{it.variant?` (${it.variant})`:""}</span><span>{fmt(it.subtotal)}</span></div>
            <div className="row small"><span>&nbsp;&nbsp;{it.qty} × {fmt(it.unit)}</span><span></span></div>
          </div>
        ))}
        <div className="dashed"/>
        <div className="row"><span>Subtotal</span><span>{fmt(r.subtotal)}</span></div>
        {r.discount > 0 && <div className="row"><span>Discount</span><span>-{fmt(r.discount)}</span></div>}
        {r.shipping > 0 && <div className="row"><span>Shipping</span><span>{fmt(r.shipping)}</span></div>}
        <div className="row b" style={{ fontSize: 14 }}><span>TOTAL</span><span>{fmt(r.total)}</span></div>
        {r.cash_tendered != null && (
          <>
            <div className="row small"><span>Cash Tendered</span><span>{fmt(r.cash_tendered)}</span></div>
            <div className="row small"><span>Change</span><span>{fmt(r.cash_change || 0)}</span></div>
          </>
        )}
        {r.card_last4 && <div className="row small"><span>Card</span><span>•••• {r.card_last4}</span></div>}
        <div className="dashed"/>
        <div className="center small">Thank you for shopping with us.</div>
        <div className="center small">Keep this receipt for any returns.</div>
        <div className="no-print mt-4 text-center">
          <button onClick={() => window.print()} data-testid="print-receipt-btn" className="inline-flex items-center gap-2 bg-black text-white px-4 py-2 text-xs uppercase tracking-widest"><Printer className="h-4 w-4"/> Print</button>
        </div>
      </div>
    </div>
  );
}
