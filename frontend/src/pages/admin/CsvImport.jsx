import React, { useState } from "react";
import api, { BACKEND_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Upload, Download, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";

function parseCSV(text) {
  // Minimal CSV parser supporting quoted fields & commas
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter(l => l.trim().length);
  if (lines.length === 0) return [];
  const headers = parseLine(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const fields = parseLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => { row[h] = fields[j] !== undefined ? fields[j] : ""; });
    rows.push(row);
  }
  return rows;
}
function parseLine(line) {
  const out = []; let cur = ""; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ",") { out.push(cur); cur = ""; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export default function CsvImport() {
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  const onFile = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    const txt = await f.text();
    setRows(parseCSV(txt));
    setPreview(null);
  };

  const dryRun = async () => {
    if (rows.length === 0) return toast.error("Pick a CSV first");
    setBusy(true);
    try {
      const { data } = await api.post("/admin/import/products", { rows, commit: false });
      setPreview(data);
      const ready = data.summary.created + data.summary.updated;
      toast.success(`Preview: ${ready} rows ready, ${data.summary.errors.length} errors`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };
  const commit = async () => {
    if (rows.length === 0) return toast.error("Pick a CSV first");
    setBusy(true);
    try {
      const { data } = await api.post("/admin/import/products", { rows, commit: true });
      setPreview(data);
      toast.success(`Imported · ${data.summary.created} new, ${data.summary.updated} updated, ${data.summary.errors.length} errors`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-6 text-white max-w-4xl" data-testid="admin-csv-import">
      <div>
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Bulk Import</h1>
        <p className="text-sm text-zinc-500 mt-1">CSV upload for Products + Variants + Inventory in one go.</p>
      </div>

      <div className="border border-zinc-900 p-6 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <a href={`${BACKEND_URL}/api/admin/import/products/template`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2 border border-zinc-700 hover:border-white text-xs uppercase tracking-widest" data-testid="download-template-btn">
            <Download className="h-4 w-4"/> Download Template
          </a>
          <label className="inline-flex items-center gap-2 px-4 py-2 border border-zinc-700 hover:border-white text-xs uppercase tracking-widest cursor-pointer">
            <Upload className="h-4 w-4"/> {file?.name || "Choose CSV"}
            <input type="file" accept=".csv" hidden onChange={onFile} data-testid="csv-file-input"/>
          </label>
          <Button onClick={dryRun} disabled={busy || rows.length===0} className="bg-zinc-900 border border-zinc-700 hover:border-white rounded-none uppercase tracking-widest text-xs" data-testid="csv-dryrun-btn">Preview ({rows.length})</Button>
          <Button onClick={commit} disabled={busy || rows.length === 0} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest text-xs font-bold" data-testid="csv-commit-btn">Commit Import</Button>
        </div>
        <p className="text-[11px] text-zinc-500">Columns: name, sku, base_price, compare_price, cost_price, category, supplier, description, size, color, color_hex, stock, featured, status. Empty fields are skipped — for existing products only the filled fields are updated. Multiple rows with the same name+sku create variants.</p>
      </div>

      {preview && (
        <div className="border border-zinc-900 p-6 space-y-4">
          <div className="flex gap-6 text-sm">
            <div><div className="text-xs uppercase tracking-widest text-zinc-500">Created</div><div className="font-mono text-2xl text-green-400">{preview.summary.created}</div></div>
            <div><div className="text-xs uppercase tracking-widest text-zinc-500">Updated</div><div className="font-mono text-2xl text-blue-400">{preview.summary.updated}</div></div>
            <div><div className="text-xs uppercase tracking-widest text-zinc-500">Errors</div><div className="font-mono text-2xl text-[#FF3B30]">{preview.summary.errors.length}</div></div>
            <div><div className="text-xs uppercase tracking-widest text-zinc-500">Status</div><div className="font-mono text-sm">{preview.committed?"Committed":"Dry run"}</div></div>
          </div>
          {preview.summary.errors.length > 0 && (
            <div className="border border-red-900 bg-red-950/30 p-3 text-xs space-y-1">
              {preview.summary.errors.map((er, i) => <div key={i}><XCircle className="inline h-3 w-3 mr-2 text-red-400"/>Row {er.row}: {er.error}</div>)}
            </div>
          )}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-zinc-900/60 text-zinc-400 uppercase tracking-widest">
                <tr><th className="p-2 text-left">Row</th><th className="p-2 text-left">Action</th><th className="p-2 text-left">Name</th><th className="p-2 text-left">Variant</th><th className="p-2 text-left">Stock</th></tr>
              </thead>
              <tbody>
                {preview.preview.slice(0, 100).map((r, i) => (
                  <tr key={i} className="border-t border-zinc-900">
                    <td className="p-2 font-mono">{r.row}</td>
                    <td className="p-2 uppercase tracking-widest"><CheckCircle className={`inline h-3 w-3 mr-2 ${r.action==="created"?"text-green-400":"text-blue-400"}`}/>{r.action}</td>
                    <td className="p-2">{r.name}</td>
                    <td className="p-2 text-zinc-400">{[r.size, r.color].filter(Boolean).join(" / ")}</td>
                    <td className="p-2 font-mono">{r.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
