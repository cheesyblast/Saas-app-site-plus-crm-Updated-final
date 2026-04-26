import React, { useEffect, useMemo, useState } from "react";
import api, { formatPrice, BACKEND_URL } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar, Legend } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";

function fmtDate(d) { return d.toISOString().slice(0, 10); }

export default function Reports() {
  const [groupBy, setGroupBy] = useState("day"); // day or month
  const [storeId, setStoreId] = useState("_all");
  const [stores, setStores] = useState([]);
  const [data, setData] = useState(null);
  const [legacy, setLegacy] = useState(null); // /admin/reports/sales (channel split)
  const [from, setFrom] = useState(() => { const d = new Date(); d.setDate(d.getDate() - 30); return fmtDate(d); });
  const [to, setTo] = useState(() => fmtDate(new Date()));

  useEffect(() => {
    api.get("/admin/stores").then(({ data }) => setStores(data || []));
  }, []);

  useEffect(() => {
    const params = { from_date: from, to_date: to, group_by: groupBy };
    if (storeId !== "_all") params.store_id = storeId;
    api.get("/admin/reports/pnl", { params }).then(({ data }) => setData(data));
    api.get("/admin/reports/sales", { params: { days: 30 } }).then(({ data }) => setLegacy(data));
  }, [groupBy, storeId, from, to]);

  const exportXlsx = () => {
    const params = new URLSearchParams({ from_date: from, to_date: to, group_by: groupBy });
    if (storeId !== "_all") params.set("store_id", storeId);
    // Use a temporary fetch to include cookies/JWT through axios isn't easy for download; use anchor with axios-blob fallback
    api.get(`/admin/reports/pnl/export?${params.toString()}`, { responseType: "blob" }).then((res) => {
      const blob = new Blob([res.data], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `pnl_${groupBy}_${from}_${to}.xlsx`; a.click();
      URL.revokeObjectURL(url);
    });
  };

  // Monthly growth = month-over-month revenue change
  const growth = useMemo(() => {
    if (!data?.series || groupBy !== "month") return [];
    const out = [];
    for (let i = 1; i < data.series.length; i++) {
      const prev = data.series[i-1].revenue;
      const cur = data.series[i].revenue;
      const pct = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
      out.push({ date: data.series[i].date, growth: parseFloat(pct.toFixed(1)) });
    }
    return out;
  }, [data, groupBy]);

  if (!data) return <div className="text-zinc-500">Loading...</div>;

  return (
    <div className="space-y-6 text-white" data-testid="admin-reports">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Reports</h1>
        <div className="flex flex-wrap items-center gap-3">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-zinc-900 border border-zinc-800 px-3 h-9 text-xs text-white" data-testid="report-from"/>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-zinc-900 border border-zinc-800 px-3 h-9 text-xs text-white" data-testid="report-to"/>
          <Select value={groupBy} onValueChange={setGroupBy}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none w-32 h-9" data-testid="report-groupby"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white"><SelectItem value="day">Daily</SelectItem><SelectItem value="month">Monthly</SelectItem></SelectContent>
          </Select>
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none w-44 h-9" data-testid="report-store"><SelectValue placeholder="All outlets" /></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white"><SelectItem value="_all">All outlets</SelectItem>{stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={exportXlsx} className="bg-zinc-900 border border-zinc-700 hover:border-white rounded-none uppercase tracking-widest text-xs h-9" data-testid="report-export-xlsx">
            <Download className="h-4 w-4 mr-2"/> Excel
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-zinc-950 border border-zinc-900 p-5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-2">Revenue</div>
          <div className="font-heading text-2xl font-black tracking-tighter text-green-400">{formatPrice(data.total_revenue)}</div>
        </div>
        <div className="bg-zinc-950 border border-zinc-900 p-5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-2">Other Income</div>
          <div className="font-heading text-2xl font-black tracking-tighter text-emerald-300">{formatPrice(data.total_income)}</div>
        </div>
        <div className="bg-zinc-950 border border-zinc-900 p-5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-2">Expenses</div>
          <div className="font-heading text-2xl font-black tracking-tighter text-[#FF3B30]">{formatPrice(data.total_expense)}</div>
        </div>
        <div className="bg-zinc-950 border border-zinc-900 p-5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-2">Profit</div>
          <div className={`font-heading text-2xl font-black tracking-tighter ${data.profit >= 0 ? "text-white" : "text-[#FF3B30]"}`}>{formatPrice(data.profit)}</div>
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-900 p-5">
        <h2 className="font-heading uppercase tracking-widest text-sm mb-5">P&amp;L — {groupBy === "month" ? "Monthly" : "Daily"}</h2>
        <div className="h-72">
          <ResponsiveContainer>
            <LineChart data={data.series}>
              <CartesianGrid stroke="#18181b" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#52525b" fontSize={10} />
              <YAxis stroke="#52525b" fontSize={10} />
              <Tooltip contentStyle={{ background: "#09090B", border: "1px solid #27272a", borderRadius: 0 }} />
              <Legend wrapperStyle={{ fontSize: 11 }}/>
              <Line type="monotone" dataKey="revenue" stroke="#22c55e" strokeWidth={2} />
              <Line type="monotone" dataKey="income" stroke="#10b981" strokeWidth={1.5} strokeDasharray="3 3" />
              <Line type="monotone" dataKey="expense" stroke="#FF3B30" strokeWidth={2} />
              <Line type="monotone" dataKey="profit" stroke="#FFFFFF" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {groupBy === "month" && growth.length > 0 && (
        <div className="bg-zinc-950 border border-zinc-900 p-5">
          <h2 className="font-heading uppercase tracking-widest text-sm mb-5">Monthly Sales Growth %</h2>
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={growth}>
                <CartesianGrid stroke="#18181b" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#52525b" fontSize={10} />
                <YAxis stroke="#52525b" fontSize={10} />
                <Tooltip contentStyle={{ background: "#09090B", border: "1px solid #27272a", borderRadius: 0 }} formatter={(v) => `${v}%`}/>
                <Bar dataKey="growth" fill="#FF3B30" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="bg-zinc-950 border border-zinc-900 p-5">
          <h2 className="font-heading uppercase tracking-widest text-sm mb-5">By Outlet</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-widest text-zinc-400">
                <tr><th className="text-left p-2">Outlet</th><th className="text-left p-2">Revenue</th><th className="text-left p-2">Income</th><th className="text-left p-2">Expense</th><th className="text-left p-2">Profit</th></tr>
              </thead>
              <tbody>
                {data.by_outlet.map((o, i) => (
                  <tr key={i} className="border-t border-zinc-900">
                    <td className="p-2">{o.store_name}</td>
                    <td className="p-2 font-mono text-green-400">{formatPrice(o.revenue)}</td>
                    <td className="p-2 font-mono text-emerald-300">{formatPrice(o.income)}</td>
                    <td className="p-2 font-mono text-[#FF3B30]">{formatPrice(o.expense)}</td>
                    <td className={`p-2 font-mono ${o.profit >= 0 ? "text-white" : "text-[#FF3B30]"}`}>{formatPrice(o.profit)}</td>
                  </tr>
                ))}
                {data.by_outlet.length === 0 && <tr><td colSpan={5} className="p-6 text-center text-zinc-500">No data</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {legacy && (
          <div className="bg-zinc-950 border border-zinc-900 p-5">
            <h2 className="font-heading uppercase tracking-widest text-sm mb-5">Channel Split (last 30d)</h2>
            <div className="h-56">
              <ResponsiveContainer>
                <BarChart data={legacy.by_channel}>
                  <CartesianGrid stroke="#18181b" strokeDasharray="3 3" />
                  <XAxis dataKey="channel" stroke="#52525b" fontSize={10} />
                  <YAxis stroke="#52525b" fontSize={10} />
                  <Tooltip contentStyle={{ background: "#09090B", border: "1px solid #27272a", borderRadius: 0 }} />
                  <Bar dataKey="revenue" fill="#FF3B30" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
