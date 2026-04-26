import React from "react";
import HeroSection from "./HeroSection";
import FeaturedSection from "./FeaturedSection";
import BrandSection from "./BrandSection";
import StorySection from "./StorySection";
import ReviewsSection from "./ReviewsSection";
import CustomSection from "./CustomSection";
import ShopSection from "./ShopSection";
import { sectionWrapperStyle, PADDING_CLASS, MAX_WIDTH_CLASS } from "@/lib/page";

const components = {
  hero: HeroSection,
  featured: FeaturedSection,
  brand: BrandSection,
  story: StorySection,
  reviews: ReviewsSection,
  custom: CustomSection,
  shop: ShopSection,
};

export default function PageRenderer({ sections }) {
  return (
    <>
      {(sections || []).map((s) => {
        const Cmp = components[s.section_type];
        if (!Cmp) return null;
        const cfg = s.config || {};
        const style = sectionWrapperStyle(cfg);
        const padCls = PADDING_CLASS[cfg.padding] || "";
        // For hero we want full bleed — only wrap non-hero with style div if any custom style
        const hasStyleOverride = cfg.bg_color || cfg.text_color || cfg.padding;
        const inner = <Cmp config={cfg} key={s.id} />;
        if (s.section_type === "hero" || !hasStyleOverride) return inner;
        return (
          <div key={s.id} style={style} className={padCls}>
            {inner}
          </div>
        );
      })}
    </>
  );
}
