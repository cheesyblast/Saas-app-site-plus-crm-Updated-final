import React, { useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

export function usePage(pageName = "home") {
  const [data, setData] = useState({ sections: [], theme: null, meta: null });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { data } = await api.get(`/page/${pageName}`);
      setData(data);
    } catch {
      setData({ sections: [], theme: null, meta: null });
    } finally {
      setLoading(false);
    }
  }, [pageName]);

  useEffect(() => { refresh(); }, [refresh]);

  return { ...data, loading, refresh };
}

export function applyTheme(theme) {
  if (!theme || typeof window === "undefined") return;
  const root = document.documentElement;
  const set = (k, v) => v && root.style.setProperty(k, v);
  set("--theme-primary", theme.primary_color);
  set("--theme-primary-hover", theme.primary_color_hover || theme.primary_color);
  set("--theme-bg", theme.background_color);
  set("--theme-text", theme.text_color);
  set("--theme-text-muted", theme.text_muted_color);
  set("--font-eyebrow", theme.font_eyebrow);
  set("--font-heading", theme.font_heading);
  set("--font-body", theme.font_body);
  if (theme.heading_scale) root.style.setProperty("--heading-scale", String(theme.heading_scale));
  if (theme.line_height) root.style.setProperty("--body-line-height", String(theme.line_height));
  if (theme.background_color) {
    document.body.style.backgroundColor = theme.background_color;
  }
  if (theme.text_color) {
    document.body.style.color = theme.text_color;
  }
}

/* Wrap a section to apply per-section style overrides */
export function sectionWrapperStyle(cfg) {
  const s = {};
  if (cfg?.bg_color) s.backgroundColor = cfg.bg_color;
  if (cfg?.text_color) s.color = cfg.text_color;
  return s;
}

export const PADDING_CLASS = {
  none: "",
  sm: "py-8",
  md: "py-16",
  lg: "py-24",
  xl: "py-32",
};
export const MAX_WIDTH_CLASS = {
  narrow: "max-w-3xl",
  medium: "max-w-5xl",
  wide: "max-w-7xl",
  full: "max-w-none",
};

export const FONT_CHOICES = [
  { value: "'Archivo Black', sans-serif", label: "Archivo Black (Bold Display)" },
  { value: "'Anton', sans-serif", label: "Anton (Condensed)" },
  { value: "'Bebas Neue', sans-serif", label: "Bebas Neue (Sans Tall)" },
  { value: "'Inter', sans-serif", label: "Inter (Modern)" },
  { value: "'Space Grotesk', sans-serif", label: "Space Grotesk (Geometric)" },
  { value: "'Playfair Display', serif", label: "Playfair Display (Elegant Serif)" },
  { value: "'Lora', serif", label: "Lora (Modern Serif)" },
  { value: "'DM Sans', sans-serif", label: "DM Sans (Clean)" },
  { value: "'Poppins', sans-serif", label: "Poppins (Friendly)" },
  { value: "'Montserrat', sans-serif", label: "Montserrat (Versatile)" },
  { value: "'Oswald', sans-serif", label: "Oswald (Industrial)" },
  { value: "'Raleway', sans-serif", label: "Raleway (Light)" },
];
