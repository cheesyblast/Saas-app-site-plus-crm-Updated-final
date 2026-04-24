import React from "react";
import { Link, NavLink } from "react-router-dom";
import { ShoppingBag, User as UserIcon, Search, Menu, X } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { useState } from "react";

export default function Navbar() {
  const { count, setOpen } = useCart();
  const { user, login, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between">
          <Link to="/" className="font-heading text-xl font-black tracking-tighter" data-testid="brand-link">
            THREADLINE<span className="text-[#FF3B30]">.</span>
          </Link>

          <nav className="hidden md:flex items-center gap-10">
            {[
              { to: "/", label: "Home" },
              { to: "/shop", label: "Shop" },
              { to: "/shop?category=heritage", label: "Heritage" },
              { to: "/account", label: "Account" },
            ].map((n) => (
              <NavLink
                key={n.label}
                to={n.to}
                data-testid={`nav-${n.label.toLowerCase()}`}
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
              <Link
                to={user.role === "customer" ? "/account" : "/admin"}
                data-testid="nav-user-btn"
                className="hidden sm:flex items-center gap-2 text-zinc-400 hover:text-white"
              >
                <UserIcon className="h-4 w-4" />
                <span className="text-xs font-heading uppercase tracking-widest">
                  {user.name?.split(" ")[0]}
                </span>
              </Link>
            ) : (
              <button
                data-testid="nav-login-btn"
                onClick={login}
                className="hidden sm:block text-xs font-heading uppercase tracking-widest text-zinc-400 hover:text-white"
              >
                Sign in
              </button>
            )}

            <button
              data-testid="cart-toggle-btn"
              onClick={() => setOpen(true)}
              className="relative text-white hover:text-[#FF3B30] transition-colors"
            >
              <ShoppingBag className="h-5 w-5" />
              {count > 0 && (
                <span className="absolute -top-2 -right-2 bg-[#FF3B30] text-white text-[10px] font-bold h-4 min-w-[16px] flex items-center justify-center px-1">
                  {count}
                </span>
              )}
            </button>

            <button
              className="md:hidden text-white"
              onClick={() => setMobileOpen(!mobileOpen)}
              data-testid="mobile-menu-btn"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-zinc-800 bg-zinc-950">
          <div className="px-6 py-4 space-y-3">
            {["/", "/shop", "/account"].map((to, i) => (
              <Link
                key={i}
                to={to}
                onClick={() => setMobileOpen(false)}
                className="block font-heading uppercase tracking-widest text-sm py-2 text-zinc-300 hover:text-white"
              >
                {["Home", "Shop", "Account"][i]}
              </Link>
            ))}
            {user ? (
              <button onClick={logout} className="text-sm text-zinc-500 uppercase tracking-widest pt-2">
                Sign out
              </button>
            ) : (
              <button onClick={login} className="text-sm text-zinc-500 uppercase tracking-widest pt-2">
                Sign in
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
