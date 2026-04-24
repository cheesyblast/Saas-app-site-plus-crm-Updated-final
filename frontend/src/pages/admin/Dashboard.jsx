import React, { useEffect, useState } from "react";
import api, { formatPrice } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { DollarSign, Package, Users, AlertTriangle, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid } from "recharts";

function KPI({ icon: Icon, label, value, accent }) {
  return (
    <div className="bg-zinc-950 border border-zinc-900 p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 mb-2">{label}</div>
          <div className="font-heading text-3xl font-black tracking-tighter">{value}</div>
        </div>
        <div className={`h-10 w-10 border ${accent ? "border-[#FF3B30] text-[#FF3B30]" : "border-zinc-800 text-zinc-400"} flex items-center justify-center`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api.get("/admin/dashboard").then(({ data }) => setData(data)).catch(() => {});
  }, []);

  if (!data) {
    return <div className="text-zinc-500">Loading...</div>;
  }

  return (
    <div className="space-y-8" data-testid="admin-dashboard">
      <div>
        <div className="text-xs font-heading uppercase tracking-[0.35em] text-[#FF3B30] mb-2">Overview</div>
        <h1 className="font-heading text-4xl sm:text-5xl font-black uppercase tracking-tighter">Control Room</h1>
        <p className="text-sm text-zinc-500 mt-2">Last 30 days snapshot.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI icon={DollarSign} label="Revenue (30d)" value={formatPrice(data.total_revenue)} />
        <KPI icon={Package} label="Orders" value={data.total_orders} />
        <KPI icon={Users} label="Customers" value={data.customer_count} />
        <KPI icon={AlertTriangle} label="Low Stock" value={data.low_stock_count} accent={data.low_stock_count > 0} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-zinc-950 border border-zinc-900 p-5">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-heading uppercase tracking-widest text-sm">Revenue — Last 14 Days</h2>
            <TrendingUp className="h-4 w-4 text-[#FF3B30]" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.sales_chart}>
                <CartesianGrid stroke="#18181b" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#52525b" fontSize={10} />
                <YAxis stroke="#52525b" fontSize={10} />
                <Tooltip contentStyle={{ background: "#09090B", border: "1px solid #27272a", borderRadius: 0 }} />
                <Line type="monotone" dataKey="revenue" stroke="#FF3B30" strokeWidth={2} dot={{ r: 3, fill: "#FF3B30" }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-zinc-950 border border-zinc-900 p-5">
          <h2 className="font-heading uppercase tracking-widest text-sm mb-5">Top Products</h2>
          {data.top_products.length === 0 ? (
            <p className="text-xs text-zinc-500">No sales yet.</p>
          ) : (
            <div className="space-y-3">
              {data.top_products.map((p, i) => (
                <div key={i} className="flex items-center justify-between border-b border-zinc-900 pb-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="font-heading text-xs text-zinc-600 w-4">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-sm truncate">{p.name}</span>
                  </div>
                  <span className="font-mono text-xs">×{p.qty}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-900 p-5">
        <h2 className="font-heading uppercase tracking-widest text-sm mb-5">Order Status Breakdown</h2>
        {data.status_breakdown.length === 0 ? (
          <p className="text-xs text-zinc-500">No orders.</p>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.status_breakdown}>
                <CartesianGrid stroke="#18181b" strokeDasharray="3 3" />
                <XAxis dataKey="status" stroke="#52525b" fontSize={10} />
                <YAxis stroke="#52525b" fontSize={10} />
                <Tooltip contentStyle={{ background: "#09090B", border: "1px solid #27272a", borderRadius: 0 }} />
                <Bar dataKey="count" fill="#FF3B30" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}
