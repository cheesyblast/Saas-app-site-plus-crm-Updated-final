import React, { createContext, useContext, useEffect, useState } from "react";

const CartContext = createContext(null);
const STORAGE_KEY = "threadline_cart";

export function CartProvider({ children }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems(JSON.parse(raw));
    } catch {}
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {}
  }, [items]);

  const add = (variantId, product, variant, qty = 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.variant_id === variantId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + qty };
        return copy;
      }
      const price = variant.price_override ?? product.base_price;
      // Pick the image bound to this variant's color; fallback to primary; fallback to first image
      const imgs = product.images || [];
      const colorImg =
        imgs.find((i) => i.color === variant.color && i.is_primary) ||
        imgs.find((i) => i.color === variant.color) ||
        imgs.find((i) => i.is_primary) ||
        imgs[0] ||
        null;
      return [
        ...prev,
        {
          variant_id: variantId,
          product_id: product.id,
          product_slug: product.slug,
          name: product.name,
          size: variant.size,
          color: variant.color,
          color_hex: variant.color_hex,
          image_url: colorImg?.url || null,
          price,
          quantity: qty,
        },
      ];
    });
    setOpen(true);
  };

  const remove = (variantId) => setItems((prev) => prev.filter((x) => x.variant_id !== variantId));
  const updateQty = (variantId, qty) =>
    setItems((prev) =>
      prev.map((x) => (x.variant_id === variantId ? { ...x, quantity: Math.max(1, qty) } : x))
    );
  const clear = () => setItems([]);

  const subtotal = items.reduce((s, x) => s + x.price * x.quantity, 0);
  const count = items.reduce((s, x) => s + x.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items, open, setOpen, add, remove, updateQty, clear, subtotal, count }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
