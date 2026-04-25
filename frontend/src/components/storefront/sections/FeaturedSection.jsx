import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import api from "@/lib/api";
import ProductCard from "@/components/storefront/ProductCard";

export default function FeaturedSection({ config }) {
  const c = config || {};
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (config?._resolvedProducts) { setItems(config._resolvedProducts); return; }
    const params = { limit: c.max_items || 8 };
    if (c.category_slug && c.category_slug !== "_same_category") params.category = c.category_slug;
    else if (!c.category_slug) params.featured = true;
    api.get("/products", { params }).then(({ data }) => setItems(data)).catch(() => {});
  }, [c.max_items, c.category_slug, config?._resolvedProducts]);

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      <div className="flex items-end justify-between mb-12">
        <div>
          {c.eyebrow && (
            <div className="text-xs font-heading uppercase tracking-[0.35em] mb-3" style={{ color: "var(--theme-primary, #FF3B30)" }}>
              {c.eyebrow}
            </div>
          )}
          {c.heading && (
            <h2 className="font-heading text-4xl sm:text-6xl font-black uppercase tracking-tighter">
              {c.heading}
            </h2>
          )}
        </div>
        {c.show_view_all_button && (
          <Link
            to={c.view_all_link || "/shop"}
            className="hidden sm:inline-flex items-center gap-2 text-xs font-heading uppercase tracking-widest text-zinc-400 hover:text-white"
          >
            {c.view_all_label || "View All"} <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-24 border border-zinc-900">
          <p className="text-zinc-500 font-heading uppercase tracking-widest text-xs">
            No products yet — add some from the admin panel.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      )}

      {c.show_view_all_button && items.length > 0 && (
        <div className="mt-14 flex justify-center">
          <Link
            to={c.view_all_link || "/shop"}
            data-testid="featured-view-all-btn"
            className="group text-white font-heading font-bold uppercase tracking-[0.25em] text-sm px-10 py-4 inline-flex items-center gap-3 transition-all hover:-translate-y-[1px]"
            style={{ background: "var(--theme-primary, #FF3B30)" }}
          >
            {c.view_all_label || "Shop The Full Collection"}
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      )}
    </section>
  );
}
