import React from "react";
import { useParams } from "react-router-dom";
import { usePage } from "@/lib/page";
import PageRenderer from "@/components/storefront/sections/PageRenderer";

export default function StaticPage() {
  const { slug } = useParams();
  const { sections, meta, loading } = usePage(slug);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-24 text-center">
        <div className="inline-block h-8 w-8 border-2 border-zinc-700 border-t-[#FF3B30] rounded-full animate-spin" />
      </div>
    );
  }

  if (!sections || sections.length === 0) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-24 text-center">
        <h1 className="font-heading text-4xl font-black uppercase tracking-tighter mb-4">{meta?.title || slug}</h1>
        <p className="text-zinc-500">This page is empty. Edit it from the admin Page Builder.</p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-950 min-h-screen">
      <PageRenderer sections={sections} />
    </div>
  );
}
