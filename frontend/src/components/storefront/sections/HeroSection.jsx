import React, { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Volume2, VolumeX, Play } from "lucide-react";
import { imgSrc, BACKEND_URL } from "@/lib/api";

const HEADLINE_SIZES = {
  xs: "text-2xl sm:text-3xl",
  sm: "text-3xl sm:text-4xl lg:text-5xl",
  md: "text-4xl sm:text-5xl lg:text-6xl",
  lg: "text-5xl sm:text-6xl lg:text-8xl",
  xl: "text-6xl sm:text-7xl lg:text-9xl",
  "2xl": "text-7xl sm:text-8xl lg:text-[10rem]",
};
const HEIGHTS = {
  compact: "min-h-[60vh]", standard: "min-h-[75vh]",
  tall: "min-h-[88vh]", fullscreen: "min-h-screen",
};
const POSITIONS = {
  left: "object-left", center: "object-center", right: "object-right",
  top: "object-top", bottom: "object-bottom",
};
const ALIGN = {
  left: "text-left items-start",
  center: "text-center items-center mx-auto",
  right: "text-right items-end ml-auto",
};

export default function HeroSection({ config }) {
  const c = config || {};
  const heightClass = HEIGHTS[c.height] || HEIGHTS.tall;
  const posClass = POSITIONS[c.image_position] || POSITIONS.right;
  const overlay = typeof c.overlay_opacity === "number" ? c.overlay_opacity / 100 : 0.6;
  const imageSrc = c.image_id ? imgSrc({ url: `/api/media/${c.image_id}` }) : c.image_url;
  const videoSrc = c.video_id ? `${BACKEND_URL}/api/media/${c.video_id}` : c.video_url;
  const fgImageSrc = c.fg_image_id ? imgSrc({ url: `/api/media/${c.fg_image_id}` }) : c.fg_image_url;
  const fgSide = c.fg_image_side || "right"; // left or right (only when present)

  // Sizes per line
  const line1Size = HEADLINE_SIZES[c.headline_line1_size] || HEADLINE_SIZES[c.headline_size] || HEADLINE_SIZES.lg;
  const line2Size = HEADLINE_SIZES[c.headline_line2_size] || HEADLINE_SIZES[c.headline_size] || HEADLINE_SIZES.lg;

  // Per-element alignment with sensible defaults
  const eyebrowAlign = ALIGN[c.eyebrow_align || c.text_align || "left"];
  const headingAlign = ALIGN[c.heading_align || c.text_align || "left"];
  const paraAlign = ALIGN[c.paragraph_align || c.text_align || "left"];
  const buttonsAlign = c.buttons_align || c.text_align || "left";
  const buttonsJustify = buttonsAlign === "center" ? "justify-center" : buttonsAlign === "right" ? "justify-end" : "";

  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(true);
  const videoRef = useRef(null);
  useEffect(() => { if (videoRef.current) videoRef.current.muted = muted; }, [muted]);
  const togglePlay = () => {
    if (!videoRef.current) return;
    if (playing) { videoRef.current.pause(); setPlaying(false); }
    else { videoRef.current.play(); setPlaying(true); }
  };

  return (
    <section className={`relative ${heightClass} grain-bg overflow-hidden`} data-testid="home-hero">
      {videoSrc ? (
        <div className="absolute inset-0">
          <video
            ref={videoRef}
            src={videoSrc}
            autoPlay loop muted={muted} playsInline preload="auto"
            className={`w-full h-full object-cover ${posClass}`}
            style={{ opacity: 1 - overlay * 0.3 }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" style={{ opacity: overlay }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
          <div className="absolute bottom-6 right-6 z-20 flex gap-2">
            <button data-testid="hero-video-toggle-play" onClick={togglePlay} className="h-10 w-10 flex items-center justify-center bg-black/60 backdrop-blur-md border border-white/10 hover:bg-black text-white">
              {playing ? <span className="h-3 w-3 inline-block bg-white"/> : <Play className="h-4 w-4"/>}
            </button>
            <button data-testid="hero-video-toggle-mute" onClick={()=>setMuted(!muted)} className="h-10 w-10 flex items-center justify-center bg-black/60 backdrop-blur-md border border-white/10 hover:bg-black text-white">
              {muted ? <VolumeX className="h-4 w-4"/> : <Volume2 className="h-4 w-4"/>}
            </button>
          </div>
        </div>
      ) : imageSrc && (
        <div className="absolute inset-0">
          <img src={imageSrc} alt="" className={`w-full h-full object-cover ${posClass}`} style={{ opacity: 1 - overlay * 0.4 }} />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/60 to-transparent" style={{ opacity: overlay }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black/40" />
        </div>
      )}

      <div className={`relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 ${heightClass} flex flex-col justify-center`}>
        <div className={`grid ${fgImageSrc ? "lg:grid-cols-2 gap-12 items-center" : "grid-cols-1"}`}>
          {fgImageSrc && fgSide === "left" && (
            <div className="order-2 lg:order-1 animate-fade-up">
              <img src={fgImageSrc} alt="" className="w-full max-h-[500px] object-contain"/>
            </div>
          )}
          <div className={`max-w-3xl animate-fade-up flex flex-col ${headingAlign} ${fgImageSrc ? (fgSide === "left" ? "order-1 lg:order-2" : "") : ""}`}>
            {c.badge_text && (
              <div className={`inline-flex items-center gap-3 mb-8 border border-zinc-700 px-4 py-1.5 ${eyebrowAlign}`}>
                <span className="h-1.5 w-1.5 bg-[var(--theme-primary,#FF3B30)] animate-pulse" />
                <span className="text-[10px] font-heading uppercase tracking-[0.35em] text-zinc-300" style={{ fontFamily: "var(--font-eyebrow)" }}>{c.badge_text}</span>
              </div>
            )}
            {(c.headline_line1 || c.headline_line2) && (
              <h1 className={`font-heading font-black uppercase tracking-tighter leading-[0.9] mb-6 ${headingAlign}`} style={{ fontFamily: "var(--font-heading)" }}>
                {c.headline_line1 && <span className={`block ${line1Size}`}>{c.headline_line1}</span>}
                {c.headline_line2 && (
                  <span className={`block ${line2Size}`} style={c.headline_line2_accent ? { color: "var(--theme-primary, #FF3B30)" } : undefined}>
                    {c.headline_line2}
                  </span>
                )}
              </h1>
            )}
            {c.subheading && (
              <p className={`text-zinc-300 max-w-xl text-base sm:text-lg leading-relaxed mb-10 ${paraAlign}`} style={{ fontFamily: "var(--font-body)" }}>
                {c.subheading}
              </p>
            )}
            <div className={`flex flex-wrap gap-4 ${buttonsJustify}`}>
              {c.cta_primary_label && (
                <Link to={c.cta_primary_link || "/shop"} data-testid="hero-shop-btn"
                      className="group text-white font-heading font-bold uppercase tracking-[0.25em] text-sm px-8 py-4 inline-flex items-center gap-3 transition-all hover:-translate-y-[1px]"
                      style={{ background: "var(--theme-primary, #FF3B30)" }}>
                  {c.cta_primary_label}<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1"/>
                </Link>
              )}
              {c.cta_secondary_label && (
                <Link to={c.cta_secondary_link || "/shop"}
                      className="border border-zinc-600 hover:border-white text-white font-heading font-bold uppercase tracking-[0.25em] text-sm px-8 py-4 inline-flex items-center gap-3">
                  {c.cta_secondary_label}
                </Link>
              )}
            </div>
          </div>
          {fgImageSrc && fgSide === "right" && (
            <div className="animate-fade-up">
              <img src={fgImageSrc} alt="" className="w-full max-h-[500px] object-contain"/>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
