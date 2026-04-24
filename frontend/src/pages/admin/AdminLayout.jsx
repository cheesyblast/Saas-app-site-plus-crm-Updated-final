import React, { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard, Package, Tag, Warehouse, ShoppingCart, Users, ScanLine,
  Store as StoreIcon, Ticket, DollarSign, Wallet, UserCog, BarChart3, Megaphone,
  Bell, LogOut, ExternalLink, ChevronRight
} from "lucide-react";

const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/products", label: "Products", icon: Package },
  { to: "/admin/categories", label: "Categories", icon: Tag },
  { to: "/admin/inventory", label: "Inventory", icon: Warehouse },
  { to: "/admin/orders", label: "Orders", icon: ShoppingCart },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/pos", label: "POS", icon: ScanLine, roles: ["super_admin", "manager", "sales_staff"] },
  { to: "/admin/stores", label: "Stores", icon: StoreIcon },
  { to: "/admin/coupons", label: "Coupons", icon: Ticket },
  { to: "/admin/expenses", label: "Expenses", icon: Wallet, roles: ["super_admin", "manager", "accountant"] },
  { to: "/admin/payroll", label: "Payroll", icon: DollarSign, roles: ["super_admin", "manager", "accountant"] },
  { to: "/admin/staff", label: "Staff", icon: UserCog, roles: ["super_admin"] },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
  { to: "/admin/marketing", label: "Marketing", icon: Megaphone },
  { to: "/admin/notifications", label: "Notifications", icon: Bell },
];

export default function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const n = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) { n("/admin/login"); return; }
    if (user.role === "customer") { n("/account"); return; }
  }, [user, loading, n]);

  if (!user || user.role === "customer") return null;

  const allowed = (item) => !item.roles || item.roles.includes(user.role);

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <aside className="w-64 flex-shrink-0 border-r border-zinc-900 bg-zinc-950 flex flex-col">
        <div className="px-6 py-6 border-b border-zinc-900">
          <Link to="/admin" className="block">
            <div className="font-heading text-lg font-black tracking-tighter">
              THREADLINE<span className="text-[#FF3B30]">.</span>
            </div>
            <div className="text-[9px] font-heading uppercase tracking-[0.3em] text-zinc-500 mt-1">
              Control Room
            </div>
          </Link>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 space-y-0.5">
          {nav.filter(allowed).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              data-testid={`admin-nav-${item.label.toLowerCase()}`}
              className={({ isActive }) =>
                `flex items-center gap-3 px-6 py-2.5 text-sm transition-colors border-l-2 ${
                  isActive
                    ? "border-[#FF3B30] bg-zinc-900/60 text-white font-semibold"
                    : "border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900/40"
                }`
              }
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-zinc-900 p-4">
          <div className="flex items-center gap-3 mb-3">
            {user.picture ? (
              <img src={user.picture} alt={user.name} className="h-8 w-8 border border-zinc-800" />
            ) : (
              <div className="h-8 w-8 bg-zinc-800" />
            )}
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold truncate">{user.name}</div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 truncate">{user.role.replace("_", " ")}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1">
            <Link to="/" className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest py-1.5 border border-zinc-800 hover:border-zinc-600 text-zinc-300">
              <ExternalLink className="h-3 w-3" /> Shop
            </Link>
            <button onClick={logout} className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest py-1.5 border border-zinc-800 hover:border-[#FF3B30] hover:text-[#FF3B30] text-zinc-300" data-testid="admin-logout-btn">
              <LogOut className="h-3 w-3" /> Logout
            </button>
          </div>
        </div>
      </aside>
      <div className="flex-1 min-w-0">
        <div className="p-6 lg:p-10">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
