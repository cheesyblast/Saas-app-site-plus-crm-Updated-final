import React from "react";
import { Link } from "react-router-dom";
import { useCompany, logoUrl } from "@/lib/company";
import { usePage } from "@/lib/page";

export default function Footer() {
  const { company } = useCompany();
  const { sections, theme } = usePage("_footer");
  const cfg = sections?.[0]?.config || {};

  const phrases = (theme?.marquee_phrases && theme.marquee_phrases.length > 0)
    ? theme.marquee_phrases : ["NEW DROP", "EST. 2026"];
  const sep = theme?.marquee_separator || "//";
  const showMarquee = cfg.show_marquee !== false;
  const cols = cfg.columns || [];
  const brandName = company?.company_name || "Brand";

  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 mt-24">
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
          {company?.logo_light_id ? (
            <img src={logoUrl(company.logo_light_id)} alt={brandName} className="h-10 max-w-[180px] object-contain mb-3"/>
          ) : (
            <div className="font-heading text-2xl font-black tracking-tighter mb-2">
              {brandName}<span className="text-[var(--theme-primary,#FF3B30)]">.</span>
            </div>
          )}
          {cfg.tagline && <p className="text-sm text-zinc-500 max-w-sm">{cfg.tagline}</p>}
          {company?.tagline && !cfg.tagline && <p className="text-sm text-zinc-500 max-w-sm">{company.tagline}</p>}
          {(cfg.support_email || company?.email) && <p className="text-xs text-zinc-600 mt-3">{cfg.support_email || company?.email}</p>}
          {(cfg.support_phone || company?.phone) && <p className="text-xs text-zinc-600">{cfg.support_phone || company?.phone}</p>}
        </div>
        {cols.map((col, idx) => (
          <div key={idx}>
            <div className="font-heading uppercase tracking-[0.25em] text-[10px] text-zinc-400 mb-4">{col.title}</div>
            <div className="space-y-2 text-sm">
              {(col.links || []).map((l, j) => (
                l.url?.startsWith("http") ? (
                  <a key={j} href={l.url} target="_blank" rel="noreferrer" className="block text-zinc-400 hover:text-white">{l.label}</a>
                ) : (
                  <Link key={j} to={l.url || "#"} className="block text-zinc-400 hover:text-white">{l.label}</Link>
                )
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="border-t border-zinc-800 py-6 text-center text-xs text-zinc-600 uppercase tracking-[0.25em] font-heading">
        © {new Date().getFullYear()} {brandName} — {cfg.copyright || "All rights reserved."}
      </div>
    </footer>
  );
}
