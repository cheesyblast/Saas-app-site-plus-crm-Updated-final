import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useCart } from "@/lib/cart";
import { imgSrc, formatPrice } from "@/lib/api";
import { X, Plus, Minus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

export default function CartDrawer() {
  const { open, setOpen, items, remove, updateQty, subtotal, discount_total, subtotal_after_discount, count } = useCart();
  const nav = useNavigate();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="bg-zinc-950 border-l border-zinc-800 text-white w-full sm:max-w-md flex flex-col p-0" data-testid="cart-drawer">
        <SheetHeader className="p-6 border-b border-zinc-800">
          <SheetTitle className="font-heading uppercase tracking-widest text-sm text-zinc-300">
            Cart ({count})
          </SheetTitle>
          <SheetDescription className="sr-only">Your shopping cart contents</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {items.length === 0 && (
            <div className="text-center py-20">
              <p className="text-zinc-500 font-heading uppercase tracking-widest text-xs">Your cart is empty</p>
              <Button
                onClick={() => {
                  setOpen(false);
                  nav("/shop");
                }}
                className="mt-6 bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold"
              >
                Browse Shop
              </Button>
            </div>
          )}
          {items.map((i) => (
            <div key={i.variant_id} className="flex gap-4 border-b border-zinc-900 pb-4">
              <div className="w-20 h-24 bg-zinc-900 border border-zinc-800 flex-shrink-0 overflow-hidden">
                {i.image_url ? (
                  <img src={imgSrc(i.image_url)} alt={i.name} className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <div className="w-full h-full bg-zinc-900" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <Link to={`/shop/${i.product_slug}`} onClick={() => setOpen(false)}>
                  <div className="text-sm font-semibold truncate">{i.name}</div>
                </Link>
                <div className="text-xs text-zinc-500 mt-1 uppercase tracking-widest">
                  {i.size} {i.color ? ` · ${i.color}` : ""}
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex items-center border border-zinc-800">
                    <button
                      onClick={() => updateQty(i.variant_id, i.quantity - 1)}
                      className="px-2 py-1 hover:bg-zinc-900"
                      data-testid={`cart-dec-${i.variant_id}`}
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="px-3 text-xs font-mono">{i.quantity}</span>
                    <button
                      onClick={() => updateQty(i.variant_id, i.quantity + 1)}
                      className="px-2 py-1 hover:bg-zinc-900"
                      data-testid={`cart-inc-${i.variant_id}`}
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <button
                    onClick={() => remove(i.variant_id)}
                    className="text-xs text-zinc-500 hover:text-white flex items-center gap-1"
                    data-testid={`cart-remove-${i.variant_id}`}
                  >
                    <X className="h-3 w-3" /> Remove
                  </button>
                </div>
              </div>
              <div className="text-sm font-mono text-right">
                {i.line_saving > 0 ? (
                  <>
                    <div className="text-zinc-500 line-through text-xs">{formatPrice(i.price * i.quantity)}</div>
                    <div className="text-[#FF3B30]">{formatPrice(i.effective_price * i.quantity)}</div>
                    {i.applied_discount && <div className="text-[10px] uppercase tracking-widest text-[#FF3B30]">{i.applied_discount.badge_label || i.applied_discount.name}</div>}
                  </>
                ) : formatPrice(i.price * i.quantity)}
              </div>
            </div>
          ))}
        </div>

        {items.length > 0 && (
          <SheetFooter className="p-6 border-t border-zinc-800 flex-col sm:flex-col gap-4">
            <div className="w-full space-y-1">
              <div className="flex items-baseline justify-between">
                <span className="text-zinc-400 font-heading uppercase tracking-widest text-xs">Subtotal</span>
                <span className="font-mono text-sm" data-testid="cart-subtotal">{formatPrice(subtotal)}</span>
              </div>
              {discount_total > 0 && (
                <div className="flex items-baseline justify-between text-[#FF3B30]">
                  <span className="font-heading uppercase tracking-widest text-xs">Discount</span>
                  <span className="font-mono text-sm" data-testid="cart-discount">- {formatPrice(discount_total)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between pt-2 border-t border-zinc-900">
                <span className="text-white font-heading uppercase tracking-widest text-xs">Total</span>
                <span className="font-mono text-lg" data-testid="cart-total">{formatPrice(subtotal_after_discount)}</span>
              </div>
            </div>
            <Button
              onClick={() => {
                setOpen(false);
                nav("/checkout");
              }}
              data-testid="cart-checkout-btn"
              className="w-full bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold py-6"
            >
              Checkout
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
