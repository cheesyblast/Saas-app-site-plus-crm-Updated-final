import React from "react";
import { Link } from "react-router-dom";
import { useCompany, logoUrl } from "@/lib/company";
import { usePage } from "@/lib/page";

export default function Footer() {
  const { company, loading: companyLoading } = useCompany();
  const { sections, theme } = usePage("_footer");
  const cfg = sections?.[0]?.config || {};

  const phrases = (theme?.marquee_phrases && theme.marquee_phrases.length > 0)
    ? theme.marquee_phrases : ["NEW DROP", "EST. 2026"];
  const sep = theme?.marquee_separator || "//";
  const showMarquee = cfg.show_marquee !== false;
  const cols = cfg.columns || [];
  const brandName = company?.company_name || "";
  const logoHeight = company?.footer_logo_height || 40;
  const logoFit = company?.logo_display_mode === "fit-width" ? "object-cover" : "object-contain";
  const layout = company?.footer_layout || "columns";
  const bgColor = company?.footer_bg_color;
  const textColor = company?.footer_text_color;
  const hoverColor = company?.footer_hover_color || "#ffffff";
  const footerStyle = {
    backgroundColor: bgColor || undefined,
    color: textColor || undefined,
    "--footer-hover": hoverColor,
  };
  const linkStyle = textColor ? { color: textColor } : undefined;
  const tagline = cfg.tagline || company?.tagline;
  const email = cfg.support_email || company?.email;
  const phone = cfg.support_phone || company?.phone;
  const logo = company?.logo_light_id;

  if (layout === "minimal") {
    return (
      <footer style={footerStyle} className={`border-t border-zinc-800 mt-24 ${bgColor ? "" : "bg-zinc-950"}`}>
        <div className="max-w-7xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs uppercase tracking-[0.25em] font-heading">
          <div className="text-zinc-500" style={linkStyle}>© {new Date().getFullYear()}{brandName ? ` · ${brandName}` : ""} — {cfg.copyright || "All rights reserved."}</div>
          <div className="flex gap-6">
            {(cols[0]?.links || []).slice(0, 4).map((l, j) => (
              <Link key={j} to={l.url || "#"} style={linkStyle} className="text-zinc-500 hover:!text-[var(--footer-hover)]">{l.label}</Link>
            ))}
          </div>
        </div>
      </footer>
    );
  }

  if (layout === "brand") {
    return (
      <footer style={footerStyle} className={`border-t border-zinc-800 mt-24 ${bgColor ? "" : "bg-zinc-950"}`}>
        <div className="max-w-7xl mx-auto px-6 py-16 text-center space-y-6">
          {logo ? (
            <img src={logoUrl(logo)} alt={brandName} style={{ height: `${logoHeight * 1.8}px`, maxWidth: "320px" }} className={`${logoFit} mx-auto`}/>
          ) : brandName && (
            <div className="font-heading text-5xl sm:text-7xl font-black tracking-tighter">{brandName}<span className="text-[var(--theme-primary,#FF3B30)]">.</span></div>
          )}
          {tagline && <p className="text-zinc-400 max-w-xl mx-auto" style={linkStyle}>{tagline}</p>}
          <div className="flex flex-wrap justify-center gap-6 text-xs uppercase tracking-[0.25em] font-heading pt-2">
            {(cols[0]?.links || []).map((l, j) => (
              <Link key={j} to={l.url || "#"} style={linkStyle} className="text-zinc-400 hover:!text-[var(--footer-hover)]">{l.label}</Link>
            ))}
          </div>
          <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-600 pt-6">© {new Date().getFullYear()}{brandName ? ` ${brandName}` : ""}</div>
        </div>
      </footer>
    );
  }

  // ---- default: columns ----
  return (
    <footer style={footerStyle} className={`border-t border-zinc-800 mt-24 ${bgColor ? "" : "bg-zinc-950"}`}>
      {showMarquee && (
        <div className="max-w-7xl mx-auto overflow-hidden py-10 border-b border-zinc-800">
          <div className="marquee">
            <div className="marquee-track">
              {Array.from({ length: 8 }).map((_, i) => (
                <span key={i} className="font-heading text-5xl sm:text-7xl font-black tracking-tighter uppercase text-zinc-900">
                  {phrases.map((p, j) => (
                    <React.Fragment key={j}>
                      {p}
                      {j < phrases.length - 1 && <span style={{ color: "var(--theme-primary, #FF3B30)" }}> {sep} </span>}
                    </React.Fragment>
                  ))}
                  &nbsp;<span style={{ color: "var(--theme-primary, #FF3B30)" }}>{sep}</span>&nbsp;
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-2 md:grid-cols-${Math.max(2, cols.length + 1)} gap-8`}>
        <div className="col-span-2">
          {logo ? (
            <img src={logoUrl(logo)} alt={brandName} style={{ height: `${logoHeight}px`, maxWidth: "200px" }} className={`${logoFit} mb-3`}/>
          ) : companyLoading ? (
            <div style={{ height: `${logoHeight}px` }} className="w-40 bg-zinc-900 animate-pulse mb-2"/>
          ) : brandName ? (
            <div className="font-heading text-2xl font-black tracking-tighter mb-2">
              {brandName}<span className="text-[var(--theme-primary,#FF3B30)]">.</span>
            </div>
          ) : null}
          {tagline && <p className="text-sm max-w-sm" style={linkStyle ? { ...linkStyle, opacity: 0.7 } : { color: "#71717a" }}>{tagline}</p>}
          {email && <p className="text-xs mt-3" style={linkStyle ? { ...linkStyle, opacity: 0.55 } : { color: "#52525b" }}>{email}</p>}
          {phone && <p className="text-xs" style={linkStyle ? { ...linkStyle, opacity: 0.55 } : { color: "#52525b" }}>{phone}</p>}
        </div>
        {cols.map((col, idx) => (
          <div key={idx}>
            <div className="font-heading uppercase tracking-[0.25em] text-[10px] mb-4" style={linkStyle ? { ...linkStyle, opacity: 0.65 } : { color: "#a1a1aa" }}>{col.title}</div>
            <div className="space-y-2 text-sm">
              {(col.links || []).map((l, j) => (
                l.url?.startsWith("http") ? (
                  <a key={j} href={l.url} target="_blank" rel="noreferrer" style={linkStyle} className="block text-zinc-400 hover:!text-[var(--footer-hover)]">{l.label}</a>
                ) : (
                  <Link key={j} to={l.url || "#"} style={linkStyle} className="block text-zinc-400 hover:!text-[var(--footer-hover)]">{l.label}</Link>
                )
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-800 py-6 text-center text-xs uppercase tracking-[0.25em] font-heading" style={linkStyle ? { ...linkStyle, opacity: 0.5 } : { color: "#52525b" }}>
        © {new Date().getFullYear()}{brandName ? ` ${brandName}` : ""} — {cfg.copyright || "All rights reserved."}
      </div>
    </footer>
  );
}
