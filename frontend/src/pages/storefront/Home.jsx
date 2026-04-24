import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import ProductCard from "@/components/storefront/ProductCard";
import { ArrowRight } from "lucide-react";

export default function Home() {
  const [featured, setFeatured] = useState([]);

  useEffect(() => {
    api.get("/products", { params: { featured: true, limit: 8 } })
      .then(({ data }) => setFeatured(data))
      .catch(() => {});
  }, []);

  return (
    <div className="bg-zinc-950">
      {/* HERO */}
      <section className="relative min-h-[88vh] grain-bg overflow-hidden" data-testid="home-hero">
        <div className="absolute inset-0">
          <img
            src="https://images.unsplash.com/photo-1768084356884-22bb77e76931?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzF8MHwxfHNlYXJjaHwyfHxzdHJlZXR3ZWFyJTIwbW9kZWwlMjBkYXJrJTIwdXJiYW4lMjBmYXNoaW9ufGVufDB8fHx8MTc3NzA0NjYyMHww&ixlib=rb-4.1.0&q=85"
            alt="Streetwear Hero"
            className="w-full h-full object-cover opacity-60"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-950/60 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-zinc-950/40" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-32 pb-24 min-h-[88vh] flex flex-col justify-center">
          <div className="max-w-3xl animate-fade-up">
            <div className="inline-flex items-center gap-3 mb-8 border border-zinc-700 px-4 py-1.5">
              <span className="h-1.5 w-1.5 bg-[#FF3B30] animate-pulse" />
              <span className="text-[10px] font-heading uppercase tracking-[0.35em] text-zinc-300">
                DROP 04 — LIVE NOW
              </span>
            </div>
            <h1 className="font-heading text-5xl sm:text-6xl lg:text-8xl font-black uppercase tracking-tighter leading-[0.9] mb-6">
              Built for the <br />
              <span className="text-[#FF3B30]">underground.</span>
            </h1>
            <p className="text-zinc-300 max-w-xl text-base sm:text-lg leading-relaxed mb-10">
              Heavyweight cotton. Uncompromising prints. Limited runs cut and shipped from the backroom. No restocks. No apologies.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link
                to="/shop"
                data-testid="hero-shop-btn"
                className="group bg-[#FF3B30] hover:bg-[#D92D23] text-white font-heading font-bold uppercase tracking-[0.25em] text-sm px-8 py-4 inline-flex items-center gap-3 transition-all hover:-translate-y-[1px]"
              >
                Shop The Drop
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link
                to="/shop?featured=1"
                className="border border-zinc-600 hover:border-white text-white font-heading font-bold uppercase tracking-[0.25em] text-sm px-8 py-4 inline-flex items-center gap-3"
              >
                View Lookbook
              </Link>
            </div>
          </div>
        </div>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[10px] font-heading uppercase tracking-[0.5em] text-zinc-600">
          Scroll
        </div>
      </section>

      {/* FEATURED */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="flex items-end justify-between mb-12">
          <div>
            <div className="text-xs font-heading uppercase tracking-[0.35em] text-[#FF3B30] mb-3">
              Featured
            </div>
            <h2 className="font-heading text-4xl sm:text-6xl font-black uppercase tracking-tighter">
              Latest Drops
            </h2>
          </div>
          <Link
            to="/shop"
            className="hidden sm:inline-flex items-center gap-2 text-xs font-heading uppercase tracking-widest text-zinc-400 hover:text-white"
          >
            All Products <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {featured.length === 0 ? (
          <div className="text-center py-24 border border-zinc-900">
            <p className="text-zinc-500 font-heading uppercase tracking-widest text-xs">
              No products yet — admins can add from the dashboard.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featured.map((p) => <ProductCard key={p.id} product={p} />)}
          </div>
        )}
      </section>

      {/* BRAND */}
      <section className="border-y border-zinc-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 grid md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="text-xs font-heading uppercase tracking-[0.35em] text-[#FF3B30] mb-3">
              The Brand
            </div>
            <h3 className="font-heading text-4xl sm:text-5xl font-black uppercase tracking-tighter mb-6">
              Cut sharp.<br /> Print loud.<br /> Sell fast.
            </h3>
            <p className="text-zinc-400 leading-relaxed mb-6">
              Threadline is a SaaS-ready streetwear platform — run your shop, your warehouse, your payroll and your drops from one dark, data-dense control room.
            </p>
            <div className="grid grid-cols-3 gap-6 mt-10">
              {[
                { k: "60s", v: "Drop deploy" },
                { k: "99.9%", v: "Stock accuracy" },
                { k: "5+", v: "Store locations" },
              ].map((s) => (
                <div key={s.k} className="border-l-2 border-[#FF3B30] pl-4">
                  <div className="font-heading text-3xl font-black">{s.k}</div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 mt-1">{s.v}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="aspect-[4/5] relative border border-zinc-900 overflow-hidden">
            <img
              src="https://images.unsplash.com/photo-1776021810500-5f50a3d461a7?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NzR8MHwxfHNlYXJjaHwxfHxkYXJrJTIwd2FyZWhvdXNlJTIwaW5kdXN0cmlhbCUyMGNvbmNyZXRlfGVufDB8fHx8MTc3NzA0NjYyMHww&ixlib=rb-4.1.0&q=85"
              alt="Brand"
              className="w-full h-full object-cover"
            />
            <div className="absolute bottom-4 left-4 font-heading uppercase tracking-widest text-xs text-zinc-400">
              EST. 2026 · SL
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
