import React, { createContext, useContext, useEffect, useState } from "react";
import api from "@/lib/api";

const CartContext = createContext(null);
const STORAGE_KEY = "threadline_cart";

export function CartProvider({ children }) {
  // Hydrate items synchronously from localStorage so we never race against
  // the persist-effect (which previously wiped the cart on every reload).
  const [items, setItems] = useState(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  });
  const [open, setOpen] = useState(false);
  const [discounts, setDiscounts] = useState([]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (e) { /* quota */ }
  }, [items]);

  // Load active discounts so the cart/checkout can show effective prices.
  useEffect(() => {
    api.get("/discounts/active").then(({ data }) => setDiscounts(data || [])).catch(() => {});
  }, []);

  const add = (variantId, product, variant, qty = 1) => {
    setItems((prev) => {
      const idx = prev.findIndex((x) => x.variant_id === variantId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], quantity: copy[idx].quantity + qty };
        return copy;
      }
      const price = variant.price_override ?? product.base_price;
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
          category_id: product.category_id || product.category?.id || null,
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

  // Pure helper: compute the effective unit price for a single line item given
  // the active discount campaigns. Picks the discount with the highest savings.
  function discountForItem(item) {
    let bestSave = 0;
    let bestDiscount = null;
    const now = new Date();
    for (const d of discounts) {
      if (!d.active) continue;
      if (d.starts_at && new Date(d.starts_at) > now) continue;
      if (d.ends_at && new Date(d.ends_at) < now) continue;
      let applies = false;
      if (d.scope === "sitewide") applies = true;
      else if (d.scope === "products" && (d.scope_product_ids || []).includes(item.product_id)) applies = true;
      else if (d.scope === "categories" && item.category_id && (d.scope_category_ids || []).includes(item.category_id)) applies = true;
      if (!applies) continue;
      const save = d.type === "percent"
        ? item.price * (Number(d.value) / 100)
        : Math.min(item.price, Number(d.value));
      if (save > bestSave) { bestSave = save; bestDiscount = d; }
    }
    return { saving: bestSave, discount: bestDiscount, effective: Math.max(0, item.price - bestSave) };
  }

  const itemsWithPricing = items.map((it) => {
    const { saving, discount, effective } = discountForItem(it);
    return { ...it, effective_price: effective, line_saving: saving * it.quantity, applied_discount: discount };
  });

  const subtotal = itemsWithPricing.reduce((s, x) => s + x.price * x.quantity, 0);
  const discount_total = itemsWithPricing.reduce((s, x) => s + x.line_saving, 0);
  const subtotal_after_discount = Math.max(0, subtotal - discount_total);
  const count = items.reduce((s, x) => s + x.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items: itemsWithPricing, open, setOpen, add, remove, updateQty, clear,
        subtotal, discount_total, subtotal_after_discount, count,
        discounts,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export const useCart = () => useContext(CartContext);
