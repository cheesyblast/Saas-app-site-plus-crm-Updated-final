import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Printer, Loader2 } from "lucide-react";
import JsBarcode from "jsbarcode";

/**
 * Printable barcode labels sheet.
 *
 * Loads every variant + its barcode (falling back to SKU or variant-id)
 * and renders an A4 sheet with 4 columns × N rows that a regular
 * laser printer can punch onto Avery 5160-style label stock.
 *
 * Each label shows: product name, variant info, price, and the scannable
 * Code128 barcode beneath. Printing hides UI chrome (see @media print).
 */
export default function BarcodeLabels() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);
  const [perRow, setPerRow] = useState(4);

  useEffect(() => {
    api.get("/admin/barcode/labels")
      .then(({ data }) => setRows(data))
      .catch(() => setError("Could not load barcode data"));
  }, []);

  // After data renders, generate each barcode SVG into its placeholder.
  useEffect(() => {
    if (!rows) return;
    rows.forEach((r) => {
      const el = document.getElementById(`bc-${r.variant_id}`);
      if (el) {
        try {
          JsBarcode(el, r.barcode, { format: "CODE128", width: 1.3, height: 36, fontSize: 11, displayValue: true });
        } catch (e) { /* invalid char — skip */ }
      }
    });
  }, [rows, perRow]);

  if (error) return <div className="p-8 text-center text-red-400">{error}</div>;
  if (!rows) return <div className="p-8 text-center text-zinc-500"><Loader2 className="h-5 w-5 animate-spin inline"/> Loading…</div>;

  return (
    <div className="min-h-screen bg-white text-black">
      <style>{`
        @media print {
          .no-print { display: none !important; }
          @page { size: A4; margin: 8mm; }
        }
        .sheet { display: grid; grid-template-columns: repeat(${perRow}, 1fr); gap: 6px; padding: 12px; }
        .label { border: 1px dashed #999; padding: 6px; text-align: center; break-inside: avoid; }
        .label .nm { font-size: 11px; font-weight: 700; line-height: 1.2; max-height: 26px; overflow: hidden; }
        .label .vt { font-size: 9px; color: #555; margin-top: 2px; }
        .label .pr { font-size: 11px; margin-top: 2px; font-weight: 700; }
        .label svg { width: 100%; max-height: 38px; margin-top: 4px; }
      `}</style>
      <div className="no-print flex items-center justify-between p-4 border-b border-zinc-200">
        <div>
          <h1 className="font-heading uppercase tracking-widest text-sm">Print Barcode Labels</h1>
          <p className="text-xs text-zinc-500 mt-1">Total: {rows.length} labels. Use Avery 5160 (1"×2-5/8") sheets or any plain A4.</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="text-xs uppercase tracking-widest">Per row
            <select value={perRow} onChange={(e) => setPerRow(parseInt(e.target.value))} className="ml-2 border border-zinc-300 px-2 py-1 text-xs">
              {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button onClick={() => window.print()} className="inline-flex items-center gap-2 bg-black text-white px-4 py-2 text-xs uppercase tracking-widest" data-testid="print-labels-btn">
            <Printer className="h-3.5 w-3.5"/> Print
          </button>
        </div>
      </div>
      <div className="sheet" data-testid="barcode-sheet">
        {rows.map((r) => (
          <div key={r.variant_id} className="label">
            <div className="nm">{r.product_name}</div>
            <div className="vt">{[r.size, r.color].filter(Boolean).join(" · ") || "—"}</div>
            <div className="pr">LKR {(r.price || 0).toFixed(2)}</div>
            <svg id={`bc-${r.variant_id}`}/>
          </div>
        ))}
      </div>
    </div>
  );
}
