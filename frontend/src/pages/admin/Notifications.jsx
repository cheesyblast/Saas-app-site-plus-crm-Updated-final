import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Mail, MessageSquare } from "lucide-react";

export default function Notifications() {
  const [rows, setRows] = useState([]);
  useEffect(() => { api.get("/admin/notifications").then(({ data }) => setRows(data)); }, []);

  return (
    <div className="space-y-6" data-testid="admin-notifications">
      <div>
        <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Notifications Log</h1>
        <p className="text-sm text-zinc-500 mt-1">Sent emails &amp; SMS messages (mocked — connect a provider via Staff config)</p>
      </div>
      <div className="space-y-2">
        {rows.map((n) => (
          <div key={n.id} className="border border-zinc-900 bg-zinc-950/60 p-4">
            <div className="flex items-center gap-3 mb-2">
              {n.channel === "email" ? <Mail className="h-4 w-4 text-zinc-400" /> : <MessageSquare className="h-4 w-4 text-zinc-400" />}
              <span className="text-[10px] uppercase tracking-widest text-zinc-500">{n.channel}</span>
              <span className="text-xs font-mono text-white">{n.to}</span>
              <span className="ml-auto text-[10px] font-mono text-zinc-600">{new Date(n.created_at).toLocaleString()}</span>
            </div>
            {n.subject && <div className="text-sm font-semibold mb-1">{n.subject}</div>}
            <div className="text-xs text-zinc-400">{n.body}</div>
          </div>
        ))}
        {rows.length === 0 && <div className="p-12 text-center text-zinc-500 border border-zinc-900">No notifications yet — place an order to test.</div>}
      </div>
    </div>
  );
}
