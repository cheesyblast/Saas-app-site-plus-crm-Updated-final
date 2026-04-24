import React from "react";
import { Star } from "lucide-react";

export default function ReviewsSection({ config }) {
  const c = config || {};
  const items = Array.isArray(c.items) ? c.items : [];

  return (
    <section className="border-y border-zinc-900 bg-zinc-950/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center mb-16">
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

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((r, i) => (
            <div key={i} className="border border-zinc-900 bg-zinc-950 p-6 sm:p-8 flex flex-col">
              <div className="flex gap-1 mb-4">
                {Array.from({ length: r.rating || 5 }).map((_, j) => (
                  <Star key={j} className="h-3.5 w-3.5 fill-current" style={{ color: "var(--theme-primary, #FF3B30)" }} />
                ))}
              </div>
              <p className="text-zinc-300 text-sm leading-relaxed flex-1">"{r.text}"</p>
              <div className="mt-6 pt-4 border-t border-zinc-900">
                <div className="text-sm font-semibold">{r.name}</div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">{r.role || "Customer"}</div>
              </div>
            </div>
          ))}
          {items.length === 0 && (
            <div className="col-span-full text-center text-zinc-500 text-sm py-12 border border-zinc-900">
              No reviews configured yet — add some from the page builder.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
