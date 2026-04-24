import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import api, { imgSrc, formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { toast } from "sonner";

export default function ProductDetail() {
  const { slug } = useParams();
  const [product, setProduct] = useState(null);
  const [activeImg, setActiveImg] = useState(0);
  const [size, setSize] = useState(null);
  const [color, setColor] = useState(null);
  const { add } = useCart();

  useEffect(() => {
    api.get(`/products/${slug}`).then(({ data }) => {
      setProduct(data);
      const first = data.variants?.[0];
      if (first) {
        setSize(first.size);
        setColor(first.color);
      }
    }).catch(() => {});
  }, [slug]);

  const sizes = useMemo(
    () => [...new Set((product?.variants || []).map(v => v.size).filter(Boolean))],
    [product]
  );
  const colors = useMemo(() => {
    const map = new Map();
    (product?.variants || []).forEach(v => {
      if (v.color && !map.has(v.color)) map.set(v.color, v.color_hex);
    });
    return Array.from(map, ([color, hex]) => ({ color, hex }));
  }, [product]);

  const activeVariant = useMemo(
    () => (product?.variants || []).find(v => v.size === size && v.color === color),
    [product, size, color]
  );

  if (!product) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <div className="inline-block h-8 w-8 border-2 border-zinc-700 border-t-[#FF3B30] rounded-full animate-spin" />
      </div>
    );
  }

  const images = product.images?.length ? product.images : [null];
  const price = activeVariant?.price_override ?? product.base_price;
  const oos = activeVariant ? activeVariant.stock <= 0 : true;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-24">
      <div className="grid md:grid-cols-2 gap-12">
        {/* Gallery */}
        <div>
          <div className="aspect-[4/5] border border-zinc-900 bg-zinc-900 relative overflow-hidden" data-testid="product-main-image">
            {images[activeImg] ? (
              <img src={imgSrc(images[activeImg])} alt={product.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-700 font-heading uppercase tracking-widest text-xs">No Image</div>
            )}
          </div>
          {images.length > 1 && (
            <div className="grid grid-cols-5 gap-2 mt-2">
              {images.map((im, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImg(i)}
                  className={`aspect-square border ${i === activeImg ? "border-[#FF3B30]" : "border-zinc-800 hover:border-zinc-600"}`}
                  data-testid={`thumb-${i}`}
                >
                  {im && <img src={imgSrc(im)} alt="" className="w-full h-full object-cover" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Info */}
        <div>
          {product.category && (
            <div className="text-xs font-heading uppercase tracking-[0.35em] text-[#FF3B30] mb-3">
              {product.category.name}
            </div>
          )}
          <h1 className="font-heading text-4xl sm:text-5xl font-black uppercase tracking-tighter mb-4">
            {product.name}
          </h1>
          <div className="flex items-baseline gap-4 mb-8">
            <span className="font-mono text-2xl">{formatPrice(price)}</span>
            {product.compare_price && product.compare_price > price && (
              <span className="font-mono text-sm text-zinc-600 line-through">{formatPrice(product.compare_price)}</span>
            )}
          </div>
          {product.description && (
            <p className="text-zinc-400 leading-relaxed mb-10">{product.description}</p>
          )}

          {sizes.length > 0 && (
            <div className="mb-6">
              <div className="font-heading uppercase tracking-widest text-[10px] text-zinc-400 mb-3">Size</div>
              <div className="flex flex-wrap gap-2">
                {sizes.map((s) => (
                  <button
                    key={s}
                    data-testid={`size-${s}`}
                    onClick={() => setSize(s)}
                    className={`px-4 py-2 border font-heading text-xs font-bold uppercase tracking-widest transition-all ${
                      size === s ? "bg-white text-black border-white" : "border-zinc-800 text-zinc-300 hover:border-zinc-600"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {colors.length > 0 && (
            <div className="mb-8">
              <div className="font-heading uppercase tracking-widest text-[10px] text-zinc-400 mb-3">
                Color {color && <span className="text-zinc-600 normal-case tracking-normal">— {color}</span>}
              </div>
              <div className="flex flex-wrap gap-3">
                {colors.map((c) => (
                  <button
                    key={c.color}
                    data-testid={`color-${c.color}`}
                    onClick={() => setColor(c.color)}
                    className={`h-8 w-8 border-2 transition-all ${color === c.color ? "border-white" : "border-zinc-700 hover:border-zinc-500"}`}
                    style={{ background: c.hex || "#333" }}
                    title={c.color}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-4 text-xs text-zinc-500 mb-6">
            <span className={`h-2 w-2 ${oos ? "bg-zinc-600" : "bg-[#22C55E]"}`} />
            <span className="font-heading uppercase tracking-widest">
              {oos ? "Sold Out" : `In Stock (${activeVariant?.stock})`}
            </span>
          </div>

          <Button
            data-testid="add-to-cart-btn"
            disabled={!activeVariant || oos}
            onClick={() => {
              add(activeVariant.id, product, activeVariant, 1);
              toast.success("Added to cart");
            }}
            className="w-full bg-[#FF3B30] hover:bg-[#D92D23] disabled:bg-zinc-800 disabled:text-zinc-500 rounded-none font-heading font-bold uppercase tracking-widest py-6 text-sm"
          >
            {oos ? "Sold Out" : "Add to Cart"}
          </Button>

          <div className="mt-10 space-y-3 pt-6 border-t border-zinc-900">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="font-heading uppercase tracking-widest">Shipping</span>
              <span>Free over $75</span>
            </div>
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <span className="font-heading uppercase tracking-widest">Returns</span>
              <span>14 days, unworn</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
