import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import api, { formatPrice } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";

export default function Account() {
  const { user, loading, logout } = useAuth();
  const [orders, setOrders] = useState([]);
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && !user) nav("/login");
    if (user) {
      api.get("/my/orders").then(({ data }) => setOrders(data)).catch(() => {});
    }
  }, [user, loading, nav]);

  if (!user) return null;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-6 mb-12 pb-8 border-b border-zinc-900">
        <div>
          <div className="text-xs font-heading uppercase tracking-[0.35em] text-[#FF3B30] mb-3">Account</div>
          <h1 className="font-heading text-5xl font-black uppercase tracking-tighter">{user.name}</h1>
          <p className="text-zinc-400 mt-2">{user.email}</p>
        </div>
        <div className="flex gap-2">
          {user.role !== "customer" && (
            <Link to="/admin" className="bg-white text-black font-heading font-bold uppercase tracking-widest px-6 py-3 text-xs">
              Admin Panel
            </Link>
          )}
          <Button
            onClick={logout}
            data-testid="account-logout-btn"
            className="bg-transparent border border-zinc-700 hover:border-white text-white rounded-none font-bold uppercase tracking-widest"
          >
            Sign out
          </Button>
        </div>
      </div>

      <h2 className="font-heading uppercase tracking-widest text-xs text-zinc-400 mb-4">My Orders</h2>
      {orders.length === 0 ? (
        <div className="border border-zinc-900 p-12 text-center">
          <p className="text-zinc-500 text-sm mb-6">No orders yet.</p>
          <Link to="/shop" className="bg-[#FF3B30] hover:bg-[#D92D23] text-white font-heading font-bold uppercase tracking-widest px-6 py-3 text-xs">
            Browse Shop
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              to={`/order/${o.order_number}`}
              className="border border-zinc-900 hover:border-zinc-700 bg-zinc-950/60 p-5 flex flex-wrap items-center justify-between gap-4 transition-colors"
              data-testid={`order-row-${o.order_number}`}
            >
              <div>
                <div className="font-mono text-sm">{o.order_number}</div>
                <div className="text-[10px] text-zinc-500 uppercase tracking-widest mt-1">
                  {new Date(o.created_at).toLocaleDateString()} · {o.items.length} item(s)
                </div>
              </div>
              <div className="flex items-center gap-6">
                <span className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${
                  o.status === "paid" ? "border-green-500 text-green-400" :
                  o.status === "shipped" || o.status === "delivered" ? "border-zinc-400 text-zinc-300" :
                  "border-zinc-700 text-zinc-500"
                }`}>{o.status}</span>
                <span className="font-mono">{formatPrice(o.total)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
