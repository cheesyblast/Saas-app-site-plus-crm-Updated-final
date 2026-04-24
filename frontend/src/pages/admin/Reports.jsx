import React, { useEffect, useState } from "react";
import api, { formatPrice } from "@/lib/api";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, BarChart, Bar } from "recharts";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function Reports() {
  const [range, setRange] = useState("30");
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/admin/reports/sales", { params: { days: parseInt(range) } }).then(({ data }) => setData(data)); }, [range]);
  if (!data) return <div className="text-zinc-500">Loading...</div>;

  return (
    <div className="space-y-6" data-testid="admin-reports">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Sales Report</h1>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none w-40"><SelectValue /></SelectTrigger>
          <SelectContent className="bg-zinc-950 border-zinc-800 text-white"><SelectItem value="7">Last 7 days</SelectItem><SelectItem value="30">Last 30 days</SelectItem><SelectItem value="90">Last 90 days</SelectItem><SelectItem value="365">Last 365 days</SelectItem></SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-zinc-950 border border-zinc-900 p-5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-2">Revenue</div>
          <div className="font-heading text-3xl font-black tracking-tighter text-green-400">{formatPrice(data.total_paid_revenue)}</div>
        </div>
        <div className="bg-zinc-950 border border-zinc-900 p-5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-2">Expenses</div>
          <div className="font-heading text-3xl font-black tracking-tighter text-[#FF3B30]">{formatPrice(data.total_expenses)}</div>
        </div>
        <div className="bg-zinc-950 border border-zinc-900 p-5">
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-2">Profit</div>
          <div className={`font-heading text-3xl font-black tracking-tighter ${data.profit >= 0 ? "text-white" : "text-[#FF3B30]"}`}>{formatPrice(data.profit)}</div>
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-900 p-5">
        <h2 className="font-heading uppercase tracking-widest text-sm mb-5">Revenue Over Time</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <LineChart data={data.by_day}>
              <CartesianGrid stroke="#18181b" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#52525b" fontSize={10} />
              <YAxis stroke="#52525b" fontSize={10} />
              <Tooltip contentStyle={{ background: "#09090B", border: "1px solid #27272a", borderRadius: 0 }} />
              <Line type="monotone" dataKey="revenue" stroke="#FF3B30" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-900 p-5">
        <h2 className="font-heading uppercase tracking-widest text-sm mb-5">By Channel</h2>
        <div className="h-56">
          <ResponsiveContainer>
            <BarChart data={data.by_channel}>
              <CartesianGrid stroke="#18181b" strokeDasharray="3 3" />
              <XAxis dataKey="channel" stroke="#52525b" fontSize={10} />
              <YAxis stroke="#52525b" fontSize={10} />
              <Tooltip contentStyle={{ background: "#09090B", border: "1px solid #27272a", borderRadius: 0 }} />
              <Bar dataKey="revenue" fill="#FF3B30" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
