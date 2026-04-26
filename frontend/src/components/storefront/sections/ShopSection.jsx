import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api, { imgSrc, formatPrice } from "@/lib/api";
import { ArrowRight } from "lucide-react";

const COLS = { 2: "grid-cols-2", 3: "grid-cols-2 md:grid-cols-3", 4: "grid-cols-2 md:grid-cols-4", 5: "grid-cols-2 md:grid-cols-5" };

export default function ShopSection({ config }) {
  const c = config || {};
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (c._resolvedProducts) { setItems(c._resolvedProducts); return; }
    const params = { limit: c.max_items || 12 };
    if (c.scope === "category" && c.category_slug) params.category = c.category_slug;
    api.get("/products", { params }).then(({ data }) => setItems(data)).catch(() => {});
  }, [c.max_items, c.category_slug, c.scope, c._resolvedProducts]);

  const cols = COLS[c.columns] || COLS[3];
  return (
    <section className="bg-[var(--theme-bg,#09090B)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="flex items-end justify-between mb-12 flex-wrap gap-4">
          <div>
            {c.eyebrow && <div className="text-[10px] uppercase tracking-[0.35em] mb-3" style={{ color: "var(--theme-primary, #FF3B30)", fontFamily: "var(--font-eyebrow)" }}>{c.eyebrow}</div>}
            {c.heading && <h2 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter" style={{ fontFamily: "var(--font-heading)" }}>{c.heading}</h2>}
            {c.subheading && <p className="text-zinc-400 mt-3 max-w-xl">{c.subheading}</p>}
          </div>
          <Link to={c.scope === "category" && c.category_slug ? `/shop?category=${c.category_slug}` : "/shop"}
                className="border border-zinc-700 hover:border-white text-white font-heading font-bold uppercase tracking-[0.25em] text-xs px-6 py-3 inline-flex items-center gap-2">
            Shop All <ArrowRight className="h-3 w-3"/>
          </Link>
        </div>
        <div className={`grid ${cols} gap-4 sm:gap-6`}>
          {items.map((p) => (
            <Link key={p.id} to={`/shop/${p.slug}`} className="group block">
              <div className="aspect-[4/5] bg-zinc-900 border border-zinc-900 overflow-hidden mb-3">
                {p.images?.[0] ? <img src={imgSrc(p.images[0])} alt={p.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"/> : null}
              </div>
              <div className="text-sm font-semibold truncate">{p.name}</div>
              <div className="font-mono text-xs text-zinc-400 mt-1">{formatPrice(p.base_price)}</div>
            </Link>
          ))}
          {items.length === 0 && <div className="col-span-full text-center py-12 text-zinc-500 text-sm">No products yet.</div>}
        </div>
      </div>
    </section>
  );
}
