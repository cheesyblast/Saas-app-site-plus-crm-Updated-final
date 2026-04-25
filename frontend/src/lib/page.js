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

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { ...data, loading, refresh };
}

export function applyTheme(theme) {
  if (!theme || typeof window === "undefined") return;
  const root = document.documentElement;
  if (theme.primary_color) {
    root.style.setProperty("--theme-primary", theme.primary_color);
    root.style.setProperty("--theme-primary-hover", theme.primary_color_hover || theme.primary_color);
  }
  if (theme.background_color) {
    root.style.setProperty("--theme-bg", theme.background_color);
  }
}
