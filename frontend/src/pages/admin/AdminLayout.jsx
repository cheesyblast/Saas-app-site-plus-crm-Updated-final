import React, { useEffect, useState } from "react";
import { Outlet, NavLink, useNavigate, Link, useLocation } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useCompany, logoUrl } from "@/lib/company";
import {
  LayoutDashboard, Package, Tag, Warehouse, ShoppingCart, Users, ScanLine,
  Store as StoreIcon, Ticket, Wallet, UserCog, BarChart3, Megaphone,
  Bell, LogOut, ExternalLink, Layout, Settings as SettingsIcon,
  Truck, PiggyBank, FileUp, ChevronLeft, ChevronRight, ChevronDown, DollarSign
} from "lucide-react";

// Item shapes:
// { to, label, icon, exact?, perm?, roles? }                           — leaf
// { to, label, icon, perm?, roles?, children: [{ to, label, ... }] }   — group; clicking the parent navigates to its `to`,
//                                                                        clicking the chevron toggles the children panel
const navTree = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/builder", label: "Page Builder", icon: Layout, perm: "settings" },
  {
    to: "/admin/inventory", label: "Inventory", icon: Warehouse, perm: "inventory",
    children: [
      { to: "/admin/products", label: "Products", icon: Package, perm: "products" },
      { to: "/admin/categories", label: "Categories", icon: Tag, perm: "products" },
      { to: "/admin/import", label: "Bulk Import", icon: FileUp, perm: "products" },
    ],
  },
  { to: "/admin/orders", label: "Orders", icon: ShoppingCart, perm: "orders", showPendingBadge: true },
  { to: "/admin/customers", label: "Customers", icon: Users, perm: "customers" },
  { to: "/admin/suppliers", label: "Suppliers", icon: Truck, perm: "suppliers" },
  { to: "/admin/pos", label: "POS", icon: ScanLine, perm: "pos" },
  { to: "/admin/stores", label: "Stores", icon: StoreIcon, perm: "settings" },
  { to: "/admin/coupons", label: "Coupon & Discount", icon: Ticket, perm: "products" },
  {
    to: "/admin/expenses", label: "Inc & Exp", icon: Wallet, perm: "accounting",
    children: [
      { to: "/admin/cash-accounts", label: "Cash & Bank", icon: PiggyBank, perm: "accounting" },
      { to: "/admin/reports", label: "Reports", icon: BarChart3, perm: "reports" },
    ],
  },
  {
    to: "/admin/staff", label: "Staff", icon: UserCog, roles: ["super_admin"],
    children: [
      { to: "/admin/payroll", label: "Payroll", icon: DollarSign, perm: "accounting" },
    ],
  },
  { to: "/admin/marketing", label: "Marketing", icon: Megaphone, perm: "marketing" },
  { to: "/admin/notifications", label: "Notifications", icon: Bell, perm: "settings" },
  { to: "/admin/settings", label: "Settings", icon: SettingsIcon, perm: "settings" },
];

export default function AdminLayout() {
  const { user, loading, logout } = useAuth();
  const { company } = useCompany();
  const n = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("admin_sidebar_collapsed") === "1");
  const [openGroups, setOpenGroups] = useState(() => {
    if (typeof window === "undefined") return {};
    try { return JSON.parse(window.localStorage.getItem("admin_open_groups") || "{}"); }
    catch { return {}; }
  });
  const [pending, setPending] = useState(0);

  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem("admin_sidebar_collapsed", collapsed ? "1" : "0"); }, [collapsed]);
  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem("admin_open_groups", JSON.stringify(openGroups)); }, [openGroups]);

  useEffect(() => {
    if (loading) return;
    if (!user) { n("/admin/login"); return; }
    if (user.role === "customer") { n("/account"); return; }
  }, [user, loading, n]);

  // Auto-open the group that contains the active route (so the user sees their context)
  useEffect(() => {
    const path = location.pathname;
    const grp = navTree.find(item => item.children && (item.to === path || item.children.some(c => path.startsWith(c.to))));
    if (grp && !openGroups[grp.to]) setOpenGroups(g => ({ ...g, [grp.to]: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  // Poll order stats every 30s for the pending badge
  useEffect(() => {
    if (!user || user.role === "customer") return;
    let mounted = true;
    const fetchStats = () => api.get("/admin/orders/stats").then(({ data }) => mounted && setPending(data.pending || 0)).catch(() => {});
    fetchStats();
    const t = setInterval(fetchStats, 30000);
    return () => { mounted = false; clearInterval(t); };
  }, [user]);

  if (!user || user.role === "customer") return null;

  const allowed = (item) => {
    if (item.roles) return item.roles.includes(user.role);
    if (!item.perm) return true;
    if (user.role === "super_admin") return true;
    return !!(user.permissions || {})[item.perm];
  };

  const visibleNav = navTree.map(item => {
    if (!allowed(item)) return null;
    if (item.children) {
      const kids = item.children.filter(allowed);
      return { ...item, children: kids };
    }
    return item;
  }).filter(Boolean);

  const brandName = company?.company_name || "Admin";
  const logo = logoUrl(company?.logo_light_id);
  const sidebarW = collapsed ? "w-16" : "w-64";

  const renderLink = (item, isChild = false) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.exact}
      data-testid={`admin-nav-${item.label.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and")}`}
      title={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `flex items-center gap-3 ${collapsed ? "justify-center px-3" : (isChild ? "pl-10 pr-4" : "px-6")} py-2.5 text-sm transition-colors border-l-2 ${
          isActive
            ? "border-[var(--theme-primary,#FF3B30)] bg-zinc-900/60 text-white font-semibold"
            : "border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900/40"
        }`
      }
    >
      <item.icon className="h-4 w-4 flex-shrink-0" />
      {!collapsed && <span className="truncate flex-1">{item.label}</span>}
      {!collapsed && item.showPendingBadge && pending > 0 && (
        <span data-testid="orders-pending-badge" className="bg-[#FF3B30] text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center">{pending}</span>
      )}
    </NavLink>
  );

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
          {visibleNav.map((item) => {
            if (!item.children) return renderLink(item);
            const isOpen = !!openGroups[item.to];
            return (
              <div key={item.to}>
                <div className={`flex items-center ${collapsed ? "justify-center" : ""}`}>
                  <NavLink
                    to={item.to}
                    end
                    data-testid={`admin-nav-${item.label.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and")}`}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `flex items-center gap-3 ${collapsed ? "justify-center px-3" : "px-6"} py-2.5 text-sm transition-colors border-l-2 flex-1 ${
                        isActive
                          ? "border-[var(--theme-primary,#FF3B30)] bg-zinc-900/60 text-white font-semibold"
                          : "border-transparent text-zinc-400 hover:text-white hover:bg-zinc-900/40"
                      }`
                    }
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    {!collapsed && <span className="truncate flex-1">{item.label}</span>}
                  </NavLink>
                  {!collapsed && (
                    <button
                      type="button"
                      data-testid={`admin-nav-toggle-${item.label.toLowerCase().replace(/\s+/g, "-").replace(/&/g, "and")}`}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenGroups(g => ({ ...g, [item.to]: !g[item.to] })); }}
                      title={isOpen ? "Hide subsections" : "Show subsections"}
                      className="px-3 py-2.5 text-zinc-500 hover:text-white hover:bg-zinc-900/40"
                    >
                      <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`} />
                    </button>
                  )}
                </div>
                {!collapsed && isOpen && item.children.map(c => renderLink(c, true))}
              </div>
            );
          })}
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
