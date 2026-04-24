import React from "react";
import { imgSrc } from "@/lib/api";

export default function BrandSection({ config }) {
  const c = config || {};
  const imageSide = c.image_side || "right";
  const imageSrc = c.image_id ? imgSrc({ url: `/api/media/${c.image_id}` }) : c.image_url;
  const imageEl = imageSrc && (
    <div className="aspect-[4/5] relative border border-zinc-900 overflow-hidden">
      <img src={imageSrc} alt={c.headline || ""} className="w-full h-full object-cover" />
      {c.tagline && (
        <div className="absolute bottom-4 left-4 font-heading uppercase tracking-widest text-xs text-zinc-400">
          {c.tagline}
        </div>
      )}
    </div>
  );
  const textEl = (
    <div>
      {c.eyebrow && (
        <div className="text-xs font-heading uppercase tracking-[0.35em] mb-3" style={{ color: "var(--theme-primary, #FF3B30)" }}>
          {c.eyebrow}
        </div>
      )}
      {c.headline && (
        <h3 className="font-heading text-4xl sm:text-5xl font-black uppercase tracking-tighter mb-6 whitespace-pre-line">
          {c.headline}
        </h3>
      )}
      {c.paragraph && (
        <p className="text-zinc-400 leading-relaxed mb-6">{c.paragraph}</p>
      )}
      {Array.isArray(c.stats) && c.stats.length > 0 && (
        <div className="grid grid-cols-3 gap-6 mt-10">
          {c.stats.map((s, i) => (
            <div key={i} className="border-l-2 pl-4" style={{ borderColor: "var(--theme-primary, #FF3B30)" }}>
              <div className="font-heading text-3xl font-black">{s.value}</div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">{s.label}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <section className="border-y border-zinc-900">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 grid md:grid-cols-2 gap-12 items-center">
        {imageSide === "left" ? imageEl : textEl}
        {imageSide === "left" ? textEl : imageEl}
      </div>
    </section>
  );
}
