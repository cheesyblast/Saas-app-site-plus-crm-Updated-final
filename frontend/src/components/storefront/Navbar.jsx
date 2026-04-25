import React, { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { ShoppingBag, User as UserIcon, Search, Menu, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useCompany, logoUrl } from "@/lib/company";
import { usePage } from "@/lib/page";

export default function Navbar() {
  const { count, setOpen } = useCart();
  const { user, logout } = useAuth();
  const { company } = useCompany();
  const { sections } = usePage("_header");
  const [mobileOpen, setMobileOpen] = useState(false);

  const headerCfg = sections?.[0]?.config || {};
  const menu = headerCfg.menu && headerCfg.menu.length > 0 ? headerCfg.menu : [
    { label: "Home", url: "/" },
    { label: "Shop", url: "/shop" },
    { label: "Account", url: "/account" },
  ];

  const brandName = company?.company_name || "Brand";
  const logo = logoUrl(company?.logo_light_id);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3" data-testid="brand-link">
            {logo ? (
              <img src={logo} alt={brandName} className="h-8 max-w-[140px] object-contain"/>
            ) : (
              <span className="font-heading text-xl font-black tracking-tighter">
                {brandName}<span className="text-[var(--theme-primary,#FF3B30)]">.</span>
              </span>
            )}
          </Link>

          <nav className="hidden md:flex items-center gap-10">
            {menu.map((n, i) => (
              <NavLink
                key={i}
                to={n.url}
                end={n.url === "/"}
                data-testid={`nav-${(n.label||"").toLowerCase()}`}
                className={({ isActive }) =>
                  `font-heading text-xs uppercase tracking-[0.25em] transition-colors ${
                    isActive ? "text-white" : "text-zinc-400 hover:text-white"
                  }`
                }
              >
                {n.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {user ? (
              <Link to={user.role === "customer" ? "/account" : "/admin"} data-testid="nav-user-btn"
                    className="hidden sm:flex items-center gap-2 text-zinc-400 hover:text-white">
                <UserIcon className="h-4 w-4" />
                <span className="text-xs font-heading uppercase tracking-widest">{user.name?.split(" ")[0]}</span>
              </Link>
            ) : (
              <Link to="/login" data-testid="nav-login-btn"
                    className="hidden sm:block text-xs font-heading uppercase tracking-widest text-zinc-400 hover:text-white">
                Sign in
              </Link>
            )}

            {(headerCfg.show_cart === undefined || headerCfg.show_cart) && (
              <button data-testid="cart-toggle-btn" onClick={() => setOpen(true)} className="relative text-white hover:text-[var(--theme-primary,#FF3B30)] transition-colors">
                <ShoppingBag className="h-5 w-5" />
                {count > 0 && (
                  <span className="absolute -top-2 -right-2 bg-[var(--theme-primary,#FF3B30)] text-white text-[10px] font-bold h-4 min-w-[16px] flex items-center justify-center px-1">{count}</span>
                )}
              </button>
            )}

            <button className="md:hidden text-white" onClick={() => setMobileOpen(!mobileOpen)} data-testid="mobile-menu-btn">
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-950">
          <div className="px-6 py-4 space-y-3">
            {menu.map((n, i) => (
              <Link key={i} to={n.url} onClick={() => setMobileOpen(false)} className="block font-heading uppercase tracking-widest text-sm py-2 text-zinc-300 hover:text-white">
                {n.label}
              </Link>
            ))}
            {user ? (
              <button onClick={logout} className="text-sm text-zinc-500 uppercase tracking-widest pt-2">Sign out</button>
            ) : (
              <Link to="/login" className="block text-sm text-zinc-500 uppercase tracking-widest pt-2">Sign in</Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
