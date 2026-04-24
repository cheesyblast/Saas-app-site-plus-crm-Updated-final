import React from "react";
import { Link } from "react-router-dom";
import { imgSrc, formatPrice } from "@/lib/api";

export default function ProductCard({ product }) {
  const img = product.images?.[0];
  const oos = (product.variants || []).every((v) => (v.stock || 0) <= 0) && product.variants?.length > 0;

  return (
    <Link
      to={`/shop/${product.slug}`}
      className="group block"
      data-testid={`product-card-${product.slug}`}
    >
      <div className="aspect-[4/5] relative overflow-hidden bg-zinc-900 border border-zinc-900 group-hover:border-zinc-700 transition-colors">
        {img ? (
          <img
            src={imgSrc(img)}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-105"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-zinc-700 font-heading uppercase tracking-widest text-xs">
            No Image
          </div>
        )}
        {product.featured && (
          <span className="absolute top-3 left-3 bg-[#FF3B30] text-white text-[10px] font-bold px-2 py-1 uppercase tracking-widest">
            Drop
          </span>
        )}
        {oos && (
          <span className="absolute top-3 right-3 bg-zinc-950 border border-zinc-800 text-zinc-400 text-[10px] px-2 py-1 uppercase tracking-widest">
            Sold Out
          </span>
        )}
      </div>
      <div className="mt-4 flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-semibold text-white">{product.name}</div>
          {product.category && (
            <div className="text-[10px] text-zinc-500 uppercase tracking-[0.25em] mt-1">
              {product.category.name}
            </div>
          )}
        </div>
        <div className="text-sm font-mono text-white whitespace-nowrap">
          {formatPrice(product.base_price)}
          {product.compare_price && product.compare_price > product.base_price && (
            <span className="ml-2 line-through text-zinc-600">{formatPrice(product.compare_price)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
