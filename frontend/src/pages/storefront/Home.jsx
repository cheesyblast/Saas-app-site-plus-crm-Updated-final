import React, { useEffect } from "react";
import PageRenderer from "@/components/storefront/sections/PageRenderer";
import { usePage, applyTheme } from "@/lib/page";

export default function Home() {
  const { sections, theme, loading } = usePage("home");

  useEffect(() => {
    if (theme) applyTheme(theme);
  }, [theme]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="inline-block h-8 w-8 border-2 border-zinc-800 border-t-[var(--theme-primary,#FF3B30)] rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="bg-zinc-950">
      <PageRenderer sections={sections} />
    </div>
  );
}
