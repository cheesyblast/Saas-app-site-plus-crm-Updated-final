import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import api from "@/lib/api";
import ProductCard from "@/components/storefront/ProductCard";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function Shop() {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCat = searchParams.get("category") || "";
  const featuredOnly = searchParams.get("featured") === "1";

  useEffect(() => {
    api.get("/categories").then(({ data }) => setCategories(data)).catch(() => {});
  }, []);

  useEffect(() => {
    const params = {};
    if (activeCat) params.category = activeCat;
    if (featuredOnly) params.featured = true;
    if (search) params.search = search;
    api.get("/products", { params }).then(({ data }) => setProducts(data)).catch(() => {});
  }, [activeCat, featuredOnly, search]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-24">
      <div className="mb-12 pb-8 border-b border-zinc-900">
        <div className="text-xs font-heading uppercase tracking-[0.35em] text-[#FF3B30] mb-3">Catalog</div>
        <h1 className="font-heading text-5xl sm:text-7xl font-black uppercase tracking-tighter">
          {activeCat ? categories.find(c => c.slug === activeCat)?.name || "Shop" : featuredOnly ? "Featured" : "All Products"}
        </h1>
      </div>

      <div className="grid lg:grid-cols-[240px_1fr] gap-10">
        <aside className="space-y-8">
          <div>
            <div className="font-heading uppercase tracking-widest text-[10px] text-zinc-400 mb-3">Search</div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
              <Input
                data-testid="shop-search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search..."
                className="pl-9 bg-zinc-900 border-zinc-800 rounded-none focus-visible:ring-[#FF3B30] focus-visible:ring-1"
              />
            </div>
          </div>
          <div>
            <div className="font-heading uppercase tracking-widest text-[10px] text-zinc-400 mb-3">Categories</div>
            <div className="space-y-1">
              <button
                onClick={() => setSearchParams({})}
                className={`block text-sm w-full text-left py-1 ${!activeCat ? "text-[#FF3B30]" : "text-zinc-400 hover:text-white"}`}
                data-testid="cat-all"
              >
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSearchParams({ category: c.slug })}
                  className={`block text-sm w-full text-left py-1 ${activeCat === c.slug ? "text-[#FF3B30]" : "text-zinc-400 hover:text-white"}`}
                  data-testid={`cat-${c.slug}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div>
          {products.length === 0 ? (
            <div className="py-24 text-center border border-zinc-900">
              <p className="text-zinc-500 font-heading uppercase tracking-widest text-xs">No products match</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6" data-testid="shop-grid">
              {products.map((p) => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
