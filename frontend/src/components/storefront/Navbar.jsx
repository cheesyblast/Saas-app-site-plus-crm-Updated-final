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
  const { company, loading: companyLoading } = useCompany();
  const { sections } = usePage("_header");
  const [mobileOpen, setMobileOpen] = useState(false);

  const headerCfg = sections?.[0]?.config || {};
  const menu = headerCfg.menu && headerCfg.menu.length > 0 ? headerCfg.menu : [
    { label: "Home", url: "/" },
    { label: "Shop", url: "/shop" },
    { label: "Account", url: "/account" },
  ];

  const brandName = company?.company_name || "";
  const logo = logoUrl(company?.logo_light_id);
  const logoHeight = company?.header_logo_height || 32;
  const logoFit = company?.logo_display_mode === "fit-width" ? "object-cover" : "object-contain";
  const layout = company?.header_layout || "classic";
  const bgColor = company?.header_bg_color;
  const textColor = company?.header_text_color;
  const hoverColor = company?.header_hover_color || "var(--theme-primary,#FF3B30)";

  const headerStyle = {
    backgroundColor: bgColor || undefined,
    color: textColor || undefined,
    // Inject a CSS variable so child links can use it on :hover
    "--nav-hover": hoverColor,
  };
  const linkStyle = textColor ? { color: textColor } : undefined;

  // Build the menu links once — re-used by all 3 layout presets
  const menuNodes = (extraClass = "") => menu.map((n, i) => (
    <NavLink
      key={i} to={n.url} end={n.url === "/"}
      data-testid={`nav-${(n.label || "").toLowerCase()}`}
      style={linkStyle}
      className={({ isActive }) =>
        `font-heading text-xs uppercase tracking-[0.25em] transition-colors hover:!text-[var(--nav-hover)] ${extraClass} ${
          isActive ? "text-white" : "text-zinc-400"
        }`
      }
    >{n.label}</NavLink>
  ));

  return (
    <header
      style={headerStyle}
      className={`sticky top-0 z-40 border-b border-zinc-800 ${bgColor ? "" : "bg-zinc-950/90 backdrop-blur-xl"}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {layout === "centered" ? (
          <div className="py-4 flex flex-col items-center gap-3">
            <Link to="/" className="flex items-center gap-3" data-testid="brand-link">
              {logo ? (
                <img src={logo} alt={brandName} style={{ height: `${logoHeight}px`, maxWidth: "240px" }} className={logoFit}/>
              ) : brandName ? (
                <span className="font-heading text-2xl font-black tracking-tighter">{brandName}<span className="text-[var(--theme-primary,#FF3B30)]">.</span></span>
              ) : null}
            </Link>
            <nav className="hidden md:flex items-center gap-10 pt-1">{menuNodes()}</nav>
            <div className="absolute right-4 top-4 flex items-center gap-4">
              <CartLogin user={user} company={company} count={count} setOpen={setOpen} cfg={headerCfg} linkStyle={linkStyle}/>
              <button className="md:hidden" style={linkStyle} onClick={() => setMobileOpen(!mobileOpen)} data-testid="mobile-menu-btn">{mobileOpen ? <X className="h-5 w-5"/> : <Menu className="h-5 w-5"/>}</button>
            </div>
          </div>
        ) : layout === "split" ? (
          <div className="h-16 grid grid-cols-3 items-center">
            <nav className="hidden md:flex items-center gap-6 justify-start">{menuNodes().slice(0, Math.ceil(menu.length / 2))}</nav>
            <div className="flex justify-center">
              <Link to="/" data-testid="brand-link">
                {logo ? (
                  <img src={logo} alt={brandName} style={{ height: `${logoHeight}px`, maxWidth: "200px" }} className={logoFit}/>
                ) : brandName ? (
                  <span className="font-heading text-xl font-black tracking-tighter">{brandName}<span className="text-[var(--theme-primary,#FF3B30)]">.</span></span>
                ) : null}
              </Link>
            </div>
            <div className="hidden md:flex items-center gap-6 justify-end">{menuNodes().slice(Math.ceil(menu.length / 2))}</div>
            <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center gap-4 md:relative md:right-0 md:top-0 md:translate-y-0 md:justify-self-end md:col-span-3 md:hidden">
              <CartLogin user={user} company={company} count={count} setOpen={setOpen} cfg={headerCfg} linkStyle={linkStyle}/>
              <button className="md:hidden" style={linkStyle} onClick={() => setMobileOpen(!mobileOpen)} data-testid="mobile-menu-btn">{mobileOpen ? <X className="h-5 w-5"/> : <Menu className="h-5 w-5"/>}</button>
            </div>
          </div>
        ) : (
          // classic
          <div className="h-16 flex items-center justify-between">
            <Link to="/" className="flex items-center gap-3" data-testid="brand-link">
              {logo ? (
                <img src={logo} alt={brandName} style={{ height: `${logoHeight}px`, maxWidth: "180px" }} className={logoFit}/>
              ) : companyLoading ? (
                <span style={{ height: `${logoHeight}px` }} className="w-32 bg-zinc-900 animate-pulse"/>
              ) : brandName ? (
                <span className="font-heading text-xl font-black tracking-tighter">{brandName}<span className="text-[var(--theme-primary,#FF3B30)]">.</span></span>
              ) : null}
            </Link>
            <nav className="hidden md:flex items-center gap-10">{menuNodes()}</nav>
            <div className="flex items-center gap-4">
              <CartLogin user={user} company={company} count={count} setOpen={setOpen} cfg={headerCfg} linkStyle={linkStyle}/>
              <button className="md:hidden" style={linkStyle} onClick={() => setMobileOpen(!mobileOpen)} data-testid="mobile-menu-btn">{mobileOpen ? <X className="h-5 w-5"/> : <Menu className="h-5 w-5"/>}</button>
            </div>
          </div>
        )}
      </div>

      {mobileOpen && (
        <div className="md:hidden border-t border-zinc-800" style={{ backgroundColor: bgColor || "#0a0a0a" }}>
          <div className="px-6 py-4 space-y-3">
            {menu.map((n, i) => (
              <Link key={i} to={n.url} onClick={() => setMobileOpen(false)} style={linkStyle} className="block font-heading uppercase tracking-widest text-sm py-2 hover:!text-[var(--nav-hover)]">
                {n.label}
              </Link>
            ))}
            {user ? (
              <button onClick={logout} style={linkStyle} className="text-sm uppercase tracking-widest pt-2">Sign out</button>
            ) : (
              <Link to="/login" style={linkStyle} className="block text-sm uppercase tracking-widest pt-2">Sign in</Link>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

// Cart + Sign-in cluster — extracted so each layout can position it differently.
function CartLogin({ user, company, count, setOpen, cfg, linkStyle }) {
  return (
    <>
      {user ? (
        <Link to={user.role === "customer" ? "/account" : "/admin"} data-testid="nav-user-btn" style={linkStyle}
              className="hidden sm:flex items-center gap-2 hover:!text-[var(--nav-hover)]">
          <UserIcon className="h-4 w-4"/>
          <span className="text-xs font-heading uppercase tracking-widest">{user.name?.split(" ")[0]}</span>
        </Link>
      ) : (
        <Link to="/login" data-testid="nav-login-btn" style={linkStyle} className="hidden sm:block text-xs font-heading uppercase tracking-widest hover:!text-[var(--nav-hover)]">
          Sign in
        </Link>
      )}
      {(cfg.show_cart === undefined || cfg.show_cart) && (
        <button data-testid="cart-toggle-btn" onClick={() => setOpen(true)} style={linkStyle} className="relative hover:!text-[var(--nav-hover)] transition-colors">
          <ShoppingBag className="h-5 w-5"/>
          {count > 0 && (
            <span className="absolute -top-2 -right-2 bg-[var(--theme-primary,#FF3B30)] text-white text-[10px] font-bold h-4 min-w-[16px] flex items-center justify-center px-1">{count}</span>
          )}
        </button>
      )}
    </>
  );
}
