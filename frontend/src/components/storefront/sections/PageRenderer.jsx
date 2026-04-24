import React from "react";
import HeroSection from "./HeroSection";
import FeaturedSection from "./FeaturedSection";
import BrandSection from "./BrandSection";
import StorySection from "./StorySection";
import ReviewsSection from "./ReviewsSection";
import CustomSection from "./CustomSection";

const REGISTRY = {
  hero: HeroSection,
  featured: FeaturedSection,
  brand: BrandSection,
  story: StorySection,
  reviews: ReviewsSection,
  custom: CustomSection,
};

export default function PageRenderer({ sections = [] }) {
  return (
    <>
      {sections.map((s) => {
        const Component = REGISTRY[s.section_type];
        if (!Component) return null;
        return <Component key={s.id} config={s.config || {}} />;
      })}
    </>
  );
}
