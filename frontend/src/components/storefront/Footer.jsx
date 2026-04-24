import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";

export default function Footer() {
  const [theme, setTheme] = useState({});
  useEffect(() => {
    api.get("/theme").then(({ data }) => setTheme(data)).catch(() => {});
  }, []);
  const phrases = (theme.marquee_phrases && theme.marquee_phrases.length > 0)
    ? theme.marquee_phrases
    : ["HERITAGE POLOS", "EST. 2026", "QUIETLY BOLD"];
  const sep = theme.marquee_separator || "//";

  return (
    <footer className="border-t border-zinc-800 bg-zinc-950 mt-24">
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 grid grid-cols-2 md:grid-cols-4 gap-8">
        <div className="col-span-2">
          <div className="font-heading text-2xl font-black tracking-tighter mb-2">
            THREADLINE<span className="text-[#FF3B30]">.</span>
          </div>
          <p className="text-sm text-zinc-500 max-w-sm">
            Heritage polos with embroidered crests, contrast tipping and a fit that holds. Designed in the studio, finished by hand.
          </p>
        </div>
        <div>
          <div className="font-heading uppercase tracking-[0.25em] text-[10px] text-zinc-400 mb-4">Shop</div>
          <div className="space-y-2 text-sm">
            <Link to="/shop" className="block text-zinc-400 hover:text-white">All</Link>
            <Link to="/shop?featured=1" className="block text-zinc-400 hover:text-white">Featured</Link>
          </div>
        </div>
        <div>
          <div className="font-heading uppercase tracking-[0.25em] text-[10px] text-zinc-400 mb-4">Support</div>
          <div className="space-y-2 text-sm">
            <Link to="/account" className="block text-zinc-400 hover:text-white">Account</Link>
            <span className="block text-zinc-400">support@threadline.co</span>
          </div>
        </div>
      </div>
      <div className="border-t border-zinc-800 py-6 text-center text-xs text-zinc-600 uppercase tracking-[0.25em] font-heading">
        © 2026 Threadline — Heritage Polos
      </div>
    </footer>
  );
}
