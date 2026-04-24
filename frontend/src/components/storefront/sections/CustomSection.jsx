import React from "react";
import { Link } from "react-router-dom";
import { imgSrc } from "@/lib/api";
import { ArrowRight } from "lucide-react";

const MAX_WIDTHS = {
  narrow: "max-w-3xl",
  wide: "max-w-5xl",
  full: "max-w-7xl",
};
const PADDINGS = {
  sm: "py-12",
  md: "py-20",
  lg: "py-32",
};
const ALIGNS = {
  left: "text-left items-start",
  center: "text-center items-center",
  right: "text-right items-end",
};

export default function CustomSection({ config }) {
  const c = config || {};
  const blockType = c.block_type || "heading_text";
  const widthClass = MAX_WIDTHS[c.max_width] || MAX_WIDTHS.narrow;
  const padClass = PADDINGS[c.padding] || PADDINGS.md;
  const alignClass = ALIGNS[c.alignment] || ALIGNS.center;
  const imageSrc = c.image_id ? imgSrc({ url: `/api/media/${c.image_id}` }) : c.image_url;

  // image_hero — full-width hero image with optional overlay text
  if (blockType === "image_hero") {
    return (
      <section className="relative w-full overflow-hidden">
        {imageSrc && (
          <div className={`relative ${padClass}`} style={{ minHeight: "60vh" }}>
            <img src={imageSrc} alt={c.heading || ""} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-zinc-950/50" />
            <div className={`relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col justify-center ${alignClass}`} style={{ minHeight: "60vh" }}>
              {c.eyebrow && (
                <div className="text-xs font-heading uppercase tracking-[0.35em] mb-3" style={{ color: "var(--theme-primary, #FF3B30)" }}>{c.eyebrow}</div>
              )}
              {c.heading && (
                <h2 className="font-heading text-4xl sm:text-6xl font-black uppercase tracking-tighter mb-4">{c.heading}</h2>
              )}
              {c.text && <p className="max-w-2xl text-zinc-200 text-base sm:text-lg">{c.text}</p>}
              {c.cta_label && (
                <Link to={c.cta_link || "/shop"} className="mt-8 text-white font-heading font-bold uppercase tracking-[0.25em] text-sm px-8 py-4 inline-flex items-center gap-3" style={{ background: "var(--theme-primary, #FF3B30)" }}>
                  {c.cta_label} <ArrowRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        )}
      </section>
    );
  }

  // image_text — split image + text
  if (blockType === "image_text") {
    const imageSide = c.image_side || "left";
    const imageEl = imageSrc && (
      <div className="aspect-[5/4] border border-zinc-900 overflow-hidden">
        <img src={imageSrc} alt={c.heading || ""} className="w-full h-full object-cover" />
      </div>
    );
    const textEl = (
      <div className={`flex flex-col ${alignClass}`}>
        {c.eyebrow && <div className="text-xs font-heading uppercase tracking-[0.35em] mb-3" style={{ color: "var(--theme-primary, #FF3B30)" }}>{c.eyebrow}</div>}
        {c.heading && <h2 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter mb-4 whitespace-pre-line">{c.heading}</h2>}
        {c.text && <p className="text-zinc-400 leading-relaxed whitespace-pre-line">{c.text}</p>}
        {c.cta_label && (
          <Link to={c.cta_link || "/shop"} className="mt-6 text-white font-heading font-bold uppercase tracking-[0.25em] text-sm px-6 py-3 inline-flex items-center gap-3 self-start" style={{ background: "var(--theme-primary, #FF3B30)" }}>
            {c.cta_label} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    );
    return (
      <section className={`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 ${padClass}`}>
        <div className="grid md:grid-cols-2 gap-12 items-center">
          {imageSide === "left" ? imageEl : textEl}
          {imageSide === "left" ? textEl : imageEl}
        </div>
      </section>
    );
  }

  // heading_text — default
  return (
    <section className={`px-4 sm:px-6 lg:px-8 ${padClass}`}>
      <div className={`${widthClass} mx-auto flex flex-col ${alignClass}`}>
        {c.eyebrow && (
          <div className="text-xs font-heading uppercase tracking-[0.35em] mb-3" style={{ color: "var(--theme-primary, #FF3B30)" }}>{c.eyebrow}</div>
        )}
        {c.heading && (
          <h2 className="font-heading text-3xl sm:text-5xl font-black uppercase tracking-tighter mb-4 whitespace-pre-line">{c.heading}</h2>
        )}
        {c.text && (
          <p className="text-zinc-400 leading-relaxed text-base sm:text-lg whitespace-pre-line max-w-2xl">{c.text}</p>
        )}
        {c.cta_label && (
          <Link to={c.cta_link || "/shop"} className="mt-6 text-white font-heading font-bold uppercase tracking-[0.25em] text-sm px-6 py-3 inline-flex items-center gap-3" style={{ background: "var(--theme-primary, #FF3B30)" }}>
            {c.cta_label} <ArrowRight className="h-4 w-4" />
          </Link>
        )}
      </div>
    </section>
  );
}
