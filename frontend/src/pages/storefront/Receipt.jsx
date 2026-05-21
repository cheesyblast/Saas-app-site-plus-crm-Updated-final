import React, { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import api from "@/lib/api";
import { Printer } from "lucide-react";

// Receipt sizing presets — drives both screen + print width / @page rules.
const SIZES = {
  "80mm": { width: "80mm", page: "80mm auto", margin: "4mm", padding: 14, font: 12 },
  "58mm": { width: "58mm", page: "58mm auto", margin: "2mm", padding: 8,  font: 11 },
  "a4":   { width: "180mm", page: "A4",        margin: "12mm", padding: 24, font: 13 },
};

// Render {{placeholder}} strings on the client so admins can use the same
// vocabulary as the email templates ({{brand_name}}, {{customer_name}}, etc).
function renderTpl(s, ctx) {
  if (!s) return "";
  return Object.entries(ctx).reduce(
    (acc, [k, v]) => acc.replaceAll(`{{${k}}}`, v == null ? "" : String(v)),
    s,
  );
}

export default function Receipt() {
  const { orderNumber } = useParams();
  const [r, setR] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/receipt/${orderNumber}`)
      .then(({ data }) => setR(data))
      .catch(() => setError("Receipt not found"));
  }, [orderNumber]);

  if (error) return <div className="min-h-screen bg-white text-black flex items-center justify-center text-sm">{error}</div>;
  if (!r) return <div className="min-h-screen bg-white text-black flex items-center justify-center text-sm">Loading…</div>;

  const cur = (r.company.currency || "LKR");
  const fmt = (v) => `${cur} ${(v || 0).toFixed(2)}`;
  const dt = new Date(r.created_at).toLocaleString();
  const sizeKey = r.receipt?.size || "80mm";
  const size = SIZES[sizeKey] || SIZES["80mm"];
  const showLogo = r.receipt?.show_logo !== false;
  const showQr = r.receipt?.show_qr !== false;
  const showBarcode = !!r.receipt?.show_barcode;
  const showTax = !!r.receipt?.show_tax;

  const ctx = {
    brand_name: r.company.name, customer_name: r.customer_name,
    order_number: r.order_number, total: fmt(r.total),
  };
  const headerText = renderTpl(r.receipt?.header_text, ctx);
  const footerText = renderTpl(r.receipt?.footer_text, ctx) || "Thank you for shopping with us.";

  const logoSrc = showLogo && r.company.logo_id
    ? `${process.env.REACT_APP_BACKEND_URL}/api/media/${r.company.logo_id}` : null;
  const qrUrl = showQr
    ? `https://api.qrserver.com/v1/create-qr-code/?size=110x110&data=${encodeURIComponent(window.location.href)}` : null;
  const barcodeUrl = showBarcode
    ? `https://barcodeapi.org/api/code128/${encodeURIComponent(r.order_number)}` : null;

  return (
    <div className="min-h-screen bg-zinc-100 text-black flex justify-center p-4 print-bg" data-testid="public-receipt">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-bg { background: white !important; padding: 0 !important; }
          @page { size: ${size.page}; margin: ${size.margin}; }
        }
        .receipt {
          width: ${size.width}; max-width: 100%; background: white; padding: ${size.padding}px;
          font-family: 'Courier New', ui-monospace, monospace;
          font-size: ${size.font}px; line-height: 1.4;
        }
        .row { display: flex; justify-content: space-between; gap: 8px; }
        .dashed { border-top: 1px dashed #444; margin: 8px 0; }
        .center { text-align: center; }
        .small { font-size: ${Math.max(9, size.font - 2)}px; color: #555; }
        .b { font-weight: 700; }
      `}</style>
      <div className="receipt" data-testid="receipt-card">
        {logoSrc && <div className="center" style={{ marginBottom: 6 }}><img src={logoSrc} alt={r.company.name} style={{ maxWidth: "70%", maxHeight: 70, margin: "0 auto" }}/></div>}
        <div className="center b" style={{ fontSize: size.font + 4 }}>{r.company.name}</div>
        {r.company.address && <div className="center small">{r.company.address}</div>}
        {r.company.phone && <div className="center small">Tel: {r.company.phone}</div>}
        {headerText && (<><div className="dashed"/><div className="center small" style={{ whiteSpace: "pre-wrap" }}>{headerText}</div></>)}
        <div className="dashed"/>
        <div className="row"><span className="small">Order</span><span className="b">{r.order_number}</span></div>
        <div className="row"><span className="small">Date</span><span>{dt}</span></div>
        <div className="row"><span className="small">Customer</span><span>{r.customer_name}</span></div>
        <div className="row"><span className="small">Payment</span><span>{(r.payment_method || "").toUpperCase()} · {r.payment_status}</span></div>
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
        {showTax && r.tax > 0 && <div className="row"><span>Tax</span><span>{fmt(r.tax)}</span></div>}
        <div className="row b" style={{ fontSize: size.font + 2 }}><span>TOTAL</span><span>{fmt(r.total)}</span></div>
        {r.cash_tendered != null && (
          <>
            <div className="row small"><span>Cash Tendered</span><span>{fmt(r.cash_tendered)}</span></div>
            <div className="row small"><span>Change</span><span>{fmt(r.cash_change || 0)}</span></div>
          </>
        )}
        {r.card_last4 && <div className="row small"><span>Card</span><span>•••• {r.card_last4}</span></div>}
        <div className="dashed"/>
        {barcodeUrl && <div className="center" style={{ margin: "6px 0" }}><img src={barcodeUrl} alt={r.order_number} style={{ maxWidth: "100%", maxHeight: 50 }}/></div>}
        {qrUrl && <div className="center" style={{ margin: "6px 0" }}><img src={qrUrl} alt="receipt qr" style={{ width: 110, height: 110 }}/></div>}
        <div className="center small" style={{ whiteSpace: "pre-wrap" }}>{footerText}</div>
        <div className="no-print mt-4 text-center">
          <button onClick={() => window.print()} data-testid="print-receipt-btn" className="inline-flex items-center gap-2 bg-black text-white px-4 py-2 text-xs uppercase tracking-widest"><Printer className="h-4 w-4"/> Print</button>
        </div>
      </div>
    </div>
  );
}
