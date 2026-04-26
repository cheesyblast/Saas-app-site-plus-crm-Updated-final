import React, { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate, Link } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { useCompany, logoUrl } from "@/lib/company";
import {
  LayoutDashboard, Package, Tag, Warehouse, ShoppingCart, Users, ScanLine,
  Store as StoreIcon, Ticket, Wallet, UserCog, BarChart3, Megaphone,
  Bell, LogOut, ExternalLink, Layout, Settings as SettingsIcon,
  Truck, PiggyBank, FileUp, ChevronLeft, ChevronRight, DollarSign
} from "lucide-react";

const nav = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/builder", label: "Page Builder", icon: Layout, perm: "settings" },
  { to: "/admin/products", label: "Products", icon: Package, perm: "products" },
  { to: "/admin/categories", label: "Categories", icon: Tag, perm: "products" },
  { to: "/admin/inventory", label: "Inventory", icon: Warehouse, perm: "inventory" },
  { to: "/admin/import", label: "Bulk Import", icon: FileUp, perm: "products" },
  { to: "/admin/orders", label: "Orders", icon: ShoppingCart, perm: "orders" },
  { to: "/admin/customers", label: "Customers", icon: Users, perm: "customers" },
  { to: "/admin/suppliers", label: "Suppliers", icon: Truck, perm: "suppliers" },
  { to: "/admin/pos", label: "POS", icon: ScanLine, perm: "pos" },
  { to: "/admin/stores", label: "Stores", icon: StoreIcon, perm: "settings" },
  { to: "/admin/coupons", label: "Coupon & Discount", icon: Ticket, perm: "products" },
  { to: "/admin/expenses", label: "Inc & Exp", icon: Wallet, perm: "accounting" },
  { to: "/admin/cash-accounts", label: "Cash & Bank", icon: PiggyBank, perm: "accounting" },
  { to: "/admin/payroll", label: "Payroll", icon: DollarSign, perm: "accounting" },
  { to: "/admin/staff", label: "Staff", icon: UserCog, roles: ["super_admin"] },
  { to: "/admin/reports", label: "Reports", icon: BarChart3, perm: "reports" },
  { to: "/admin/marketing", label: "Marketing", icon: Megaphone, perm: "marketing" },
  { to: "/admin/notifications", label: "Notifications", icon: Bell, perm: "settings" },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon, perm: "settings" },
];

export default function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const { company } = useCompany();
  const n = useNavigate();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.localStorage.getItem("admin_sidebar_collapsed") === "1";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("admin_sidebar_collapsed", collapsed ? "1" : "0");
    }
  }, [collapsed]);

  useEffect(() => {
    if (loading) return;
    if (!user) { n("/admin/login"); return; }
    if (user.role === "customer") { n("/account"); return; }
  }, [user, loading, n]);

  if (!user || user.role === "customer") return null;

  const allowed = (item) => {
    if (item.roles) return item.roles.includes(user.role);
    if (!item.perm) return true;
    if (user.role === "super_admin") return true;
    return !!(user.permissions || {})[item.perm];
  };

  const brandName = company?.company_name || "Admin";
  const logo = logoUrl(company?.logo_light_id);
  const sidebarW = collapsed ? "w-16" : "w-64";

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex">
      <aside className={`${sidebarW} flex-shrink-0 border-r border-zinc-900 bg-zinc-950 flex flex-col transition-all duration-200`}>
        <div className="px-3 py-5 border-b border-zinc-900 flex items-center justify-between gap-2">
          <Link to="/admin" className="block min-w-0 flex-1 px-3">
            {collapsed ? (
              <div className="font-heading text-base font-black text-center tracking-tighter">{brandName.charAt(0)}</div>
            ) : logo ? (
              <img src={logo} alt={brandName} className="h-8 max-w-[170px] object-contain" />
            ) : (
              <div className="font-heading text-lg font-black tracking-tighter truncate">
                {brandName}<span className="text-[var(--theme-primary,#FF3B30)]">.</span>
              </div>
            )}
            {!collapsed && <div className="text-[9px] font-heading uppercase tracking-[0.3em] text-zinc-500 mt-1">Control Room</div>}
          </Link>
          <button data-testid="sidebar-collapse-btn" onClick={() => setCollapsed(!collapsed)} className="text-zinc-500 hover:text-white p-1 border border-zinc-800 hover:border-zinc-600" title={collapsed ? "Expand" : "Collapse"}>
            {collapsed ? <ChevronRight className="h-4 w-4"/> : <ChevronLeft className="h-4 w-4"/>}
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">
          {nav.filter(allowed).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              data-testid={`admin-nav-${item.label.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and")}`}
              title={collapsed ? item.label : undefined}
              className={({ isActive }) =>
                `flex items-center gap-3 ${collapsed ? "justify-center px-3" : "px-6"} py-2.5 text-sm transition-colors border-l-2 ${
                  isActive
                    ? "border-[var(--theme-primary,#FF3B30)] bg-zinc-900/60 text-white font-semibold"
                    : "border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900/40"
                }`
              }
            >
              <item.icon className="h-4 w-4 flex-shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-zinc-900 p-3">
          {!collapsed && (
            <div className="flex items-center gap-3 mb-3">
              {user.picture ? (
                <img src={user.picture} alt={user.name} className="h-8 w-8 border border-zinc-800" />
              ) : (
                <div className="h-8 w-8 bg-zinc-800 flex items-center justify-center text-xs font-bold">{user.name?.[0]}</div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{user.name}</div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 truncate">{user.role.replace("_", " ")}</div>
              </div>
            </div>
          )}
          <div className={`grid ${collapsed ? "grid-cols-1" : "grid-cols-2"} gap-1`}>
            <Link to="/" title="Storefront" className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest py-1.5 border border-zinc-800 hover:border-zinc-600 text-zinc-300">
              <ExternalLink className="h-3 w-3" /> {!collapsed && "Shop"}
            </Link>
            <button onClick={logout} title="Logout" className="flex items-center justify-center gap-1 text-[10px] uppercase tracking-widest py-1.5 border border-zinc-800 hover:border-[var(--theme-primary,#FF3B30)] hover:text-[var(--theme-primary,#FF3B30)] text-zinc-300" data-testid="admin-logout-btn">
              <LogOut className="h-3 w-3" /> {!collapsed && "Logout"}
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
