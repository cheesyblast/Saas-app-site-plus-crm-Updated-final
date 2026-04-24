import React from "react";
import { imgSrc } from "@/lib/api";

export default function StorySection({ config }) {
  const c = config || {};
  const imageSide = c.image_side || "left";
  const imageSrc = c.image_id ? imgSrc({ url: `/api/media/${c.image_id}` }) : c.image_url;
  const hasImage = !!imageSrc;

  const imageEl = hasImage && (
    <div className="aspect-[5/4] relative border border-zinc-900 overflow-hidden">
      <img src={imageSrc} alt={c.headline || ""} className="w-full h-full object-cover" />
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
        <h3 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter mb-6 leading-tight whitespace-pre-line">
          {c.headline}
        </h3>
      )}
      {c.paragraph && (
        <p className="text-zinc-400 leading-relaxed text-base sm:text-lg whitespace-pre-line">{c.paragraph}</p>
      )}
    </div>
  );

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
      {hasImage ? (
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {imageSide === "left" ? imageEl : textEl}
          {imageSide === "left" ? textEl : imageEl}
        </div>
      ) : (
        <div className="max-w-3xl mx-auto text-center">{textEl}</div>
      )}
    </section>
  );
}
