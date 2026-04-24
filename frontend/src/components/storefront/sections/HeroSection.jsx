import React from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { imgSrc } from "@/lib/api";

const HEADLINE_SIZES = {
  sm: "text-3xl sm:text-4xl lg:text-5xl",
  md: "text-4xl sm:text-5xl lg:text-6xl",
  lg: "text-5xl sm:text-6xl lg:text-8xl",
  xl: "text-6xl sm:text-7xl lg:text-9xl",
};

const HEIGHTS = {
  compact: "min-h-[60vh]",
  standard: "min-h-[75vh]",
  tall: "min-h-[88vh]",
  fullscreen: "min-h-screen",
};

const POSITIONS = {
  left: "object-left",
  center: "object-center",
  right: "object-right",
  top: "object-top",
  bottom: "object-bottom",
};

export default function HeroSection({ config }) {
  const c = config || {};
  const sizeClass = HEADLINE_SIZES[c.headline_size] || HEADLINE_SIZES.lg;
  const heightClass = HEIGHTS[c.height] || HEIGHTS.tall;
  const posClass = POSITIONS[c.image_position] || POSITIONS.right;
  const overlay = typeof c.overlay_opacity === "number" ? c.overlay_opacity / 100 : 0.6;
  const imageSrc = c.image_id ? imgSrc({ url: `/api/media/${c.image_id}` }) : c.image_url;

  return (
    <section className={`relative ${heightClass} grain-bg overflow-hidden`} data-testid="home-hero">
      {imageSrc && (
        <div className="absolute inset-0">
          <img
            src={imageSrc}
            alt=""
            className={`w-full h-full object-cover ${posClass}`}
            style={{ opacity: 1 - overlay * 0.4 }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/60 to-transparent" style={{ opacity: overlay }} />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-zinc-950/40" />
        </div>
      )}

      <div className={`relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 ${heightClass} flex flex-col justify-center`}>
        <div className="max-w-3xl animate-fade-up">
          {c.badge_text && (
            <div className="inline-flex items-center gap-3 mb-8 border border-zinc-700 px-4 py-1.5">
              <span className="h-1.5 w-1.5 bg-[var(--theme-primary,#FF3B30)] animate-pulse" />
              <span className="text-[10px] font-heading uppercase tracking-[0.35em] text-zinc-300">
                {c.badge_text}
              </span>
            </div>
          )}
          {(c.headline_line1 || c.headline_line2) && (
            <h1 className={`font-heading ${sizeClass} font-black uppercase tracking-tighter leading-[0.9] mb-6`}>
              {c.headline_line1 && <>{c.headline_line1}<br /></>}
              {c.headline_line2 && (
                c.headline_line2_accent
                  ? <span style={{ color: "var(--theme-primary, #FF3B30)" }}>{c.headline_line2}</span>
                  : c.headline_line2
              )}
            </h1>
          )}
          {c.subheading && (
            <p className="text-zinc-300 max-w-xl text-base sm:text-lg leading-relaxed mb-10">
              {c.subheading}
            </p>
          )}
          <div className="flex flex-wrap gap-4">
            {c.cta_primary_label && (
              <Link
                to={c.cta_primary_link || "/shop"}
                data-testid="hero-shop-btn"
                className="group text-white font-heading font-bold uppercase tracking-[0.25em] text-sm px-8 py-4 inline-flex items-center gap-3 transition-all hover:-translate-y-[1px]"
                style={{ background: "var(--theme-primary, #FF3B30)" }}
              >
                {c.cta_primary_label}
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            )}
            {c.cta_secondary_label && (
              <Link
                to={c.cta_secondary_link || "/shop"}
                className="border border-zinc-600 hover:border-white text-white font-heading font-bold uppercase tracking-[0.25em] text-sm px-8 py-4 inline-flex items-center gap-3"
              >
                {c.cta_secondary_label}
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-heading uppercase tracking-[0.5em] text-zinc-600">
        Scroll
      </div>
    </section>
  );
}
