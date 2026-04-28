import React, { useEffect, useState } from "react";
import api from "@/lib/api";

// Auto-rolling marquee that pulls active discounts from /api/discounts/active
// and renders the visible ones with their description text. Pinned just below
// the navbar on every storefront page.
const SIZE_MAP = { xs: 26, sm: 32, md: 40 };
const SPEED_MAP = { slow: 60, normal: 35, fast: 20 };

export default function DiscountMarquee() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    api.get("/discounts/active")
      .then(({ data }) => setItems((data || []).filter(d => d.show_marquee && d.description)))
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  // Render one marquee per discount stacked. Using the largest size + first colour for simplicity if multiple.
  const d = items[0];
  const height = SIZE_MAP[d.marquee_size] || SIZE_MAP.sm;
  const duration = SPEED_MAP[d.marquee_speed] || SPEED_MAP.normal;
  const repeats = Array.from({ length: 6 });

  // For multiple discounts, join their descriptions with a separator
  const text = items.map(i => i.description).join("    •    ");

  return (
    <div data-testid="discount-marquee" className="relative overflow-hidden border-b" style={{ background: d.marquee_bg, color: d.marquee_fg, borderColor: "rgba(0,0,0,0.15)" }}>
      <style>{`
        @keyframes dm-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        .dm-track { animation: dm-scroll ${duration}s linear infinite; will-change: transform; }
      `}</style>
      <div className="dm-track flex whitespace-nowrap" style={{ height }}>
        {repeats.map((_, i) => (
          <span key={i} className="font-heading uppercase tracking-widest text-xs sm:text-sm font-bold flex items-center px-8" style={{ height }}>
            {text}
          </span>
        ))}
      </div>
    </div>
  );
}
