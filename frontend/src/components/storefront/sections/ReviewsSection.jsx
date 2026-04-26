import React, { useEffect, useState } from "react";
import { Star, ChevronLeft, ChevronRight } from "lucide-react";

export default function ReviewsSection({ config }) {
  const c = config || {};
  const items = Array.isArray(c.items) ? c.items : [];
  const layout = c.layout || "grid";
  const dir = c.direction === "rtl" ? "rtl" : "ltr";
  const speedMs = ({ slow: 60, medium: 35, fast: 18 }[c.speed] || 35) * 1000 / Math.max(1, items.length);
  const autoplay = c.autoplay !== false;

  if (layout === "carousel") {
    return <CarouselReviews items={items} dir={dir} speedMs={speedMs} autoplay={autoplay} c={c}/>;
  }

  return (
    <section className="border-y border-zinc-900 bg-zinc-950/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <Header c={c}/>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {items.map((r, i) => (<ReviewCard key={i} r={r}/>))}
          {items.length === 0 && <Empty/>}
        </div>
      </div>
    </section>
  );
}

function Header({ c }) {
  return (
    <div className="text-center mb-16">
      {c.eyebrow && <div className="text-xs uppercase tracking-[0.35em] mb-3" style={{ color: "var(--theme-primary, #FF3B30)", fontFamily: "var(--font-eyebrow)" }}>{c.eyebrow}</div>}
      {c.heading && <h2 className="text-4xl sm:text-6xl font-black uppercase tracking-tighter" style={{ fontFamily: "var(--font-heading)" }}>{c.heading}</h2>}
    </div>
  );
}
function Empty() { return <div className="col-span-full text-center text-zinc-500 text-sm py-12 border border-zinc-900">No reviews yet — add some from the Page Builder.</div>; }
function ReviewCard({ r }) {
  return (
    <div className="border border-zinc-900 bg-zinc-950 p-6 sm:p-8 flex flex-col min-w-[280px] sm:min-w-[320px]">
      <div className="flex gap-1 mb-4">{Array.from({ length: r.rating || 5 }).map((_, j) => (<Star key={j} className="h-3.5 w-3.5 fill-current" style={{ color: "var(--theme-primary, #FF3B30)" }}/>))}</div>
      <p className="text-zinc-300 text-sm leading-relaxed flex-1">"{r.text}"</p>
      <div className="mt-6 pt-4 border-t border-zinc-900">
        <div className="text-sm font-semibold">{r.name}</div>
        <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">{r.role || "Customer"}</div>
      </div>
    </div>
  );
}

function CarouselReviews({ items, dir, speedMs, autoplay, c }) {
  const [paused, setPaused] = useState(false);
  const animation = `carousel-${dir} ${speedMs}ms linear infinite`;
  const looped = items.length === 0 ? [] : [...items, ...items, ...items];
  return (
    <section className="border-y border-zinc-900 bg-zinc-950/50 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-20"><Header c={c}/></div>
      <div className="relative" onMouseEnter={()=>setPaused(true)} onMouseLeave={()=>setPaused(false)}>
        <div className="flex gap-6 px-4 pb-20" style={{ animation: autoplay ? animation : "none", animationPlayState: paused ? "paused" : "running", width: "max-content" }}>
          {looped.map((r, i) => <div key={i} className="w-[300px] sm:w-[360px] flex-shrink-0"><ReviewCard r={r}/></div>)}
          {items.length === 0 && <div className="px-12"><Empty/></div>}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-zinc-950 to-transparent"/>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-zinc-950 to-transparent"/>
      </div>
      <style>{`
        @keyframes carousel-ltr { 0% { transform: translateX(0) } 100% { transform: translateX(-33.333%) } }
        @keyframes carousel-rtl { 0% { transform: translateX(-33.333%) } 100% { transform: translateX(0) } }
      `}</style>
    </section>
  );
}
