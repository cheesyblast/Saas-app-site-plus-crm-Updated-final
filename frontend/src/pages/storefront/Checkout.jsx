import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { imgSrc, formatPrice } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function Checkout() {
  const { items, subtotal, clear } = useCart();
  const { user } = useAuth();
  const nav = useNavigate();

  const [form, setForm] = useState({
    customer_name: user?.name || "",
    customer_email: user?.email || "",
    customer_phone: "",
    shipping_address: "",
    coupon_code: "",
    notes: "",
  });
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const shipping = subtotal >= 75 || items.length === 0 ? 0 : 5.99;
  const total = subtotal + shipping;

  const placeOrder = async () => {
    if (items.length === 0) return toast.error("Cart is empty");
    if (!form.customer_name || !form.shipping_address) {
      return toast.error("Name and address are required");
    }
    setLoading(true);
    try {
      const { data } = await api.post("/checkout", {
        ...form,
        coupon_code: form.coupon_code || null,
        items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
        payment_method: "mock",
        source: "online",
      });
      clear();
      nav(`/order/${data.order_number}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Order failed");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <h1 className="font-heading text-4xl font-black uppercase tracking-tighter mb-6">Cart is empty</h1>
        <Button onClick={() => nav("/shop")} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none font-bold uppercase tracking-widest">
          Go Shopping
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-24">
      <h1 className="font-heading text-5xl sm:text-6xl font-black uppercase tracking-tighter mb-10">
        Checkout
      </h1>

      <div className="grid lg:grid-cols-[1fr_420px] gap-12">
        <div className="space-y-8">
          <section>
            <h2 className="font-heading uppercase tracking-widest text-xs text-zinc-400 mb-4 pb-2 border-b border-zinc-900">Contact</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Full Name *</Label>
                <Input
                  data-testid="checkout-name"
                  value={form.customer_name}
                  onChange={(e) => set("customer_name", e.target.value)}
                  className="bg-zinc-950 border-zinc-800 rounded-none mt-1"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Email</Label>
                <Input
                  data-testid="checkout-email"
                  value={form.customer_email}
                  onChange={(e) => set("customer_email", e.target.value)}
                  className="bg-zinc-950 border-zinc-800 rounded-none mt-1"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Phone</Label>
                <Input
                  data-testid="checkout-phone"
                  value={form.customer_phone}
                  onChange={(e) => set("customer_phone", e.target.value)}
                  className="bg-zinc-950 border-zinc-800 rounded-none mt-1"
                />
              </div>
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Coupon Code</Label>
                <Input
                  data-testid="checkout-coupon"
                  value={form.coupon_code}
                  onChange={(e) => set("coupon_code", e.target.value)}
                  className="bg-zinc-950 border-zinc-800 rounded-none mt-1"
                  placeholder="Optional"
                />
              </div>
            </div>
          </section>

          <section>
            <h2 className="font-heading uppercase tracking-widest text-xs text-zinc-400 mb-4 pb-2 border-b border-zinc-900">Shipping</h2>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Address *</Label>
              <Textarea
                data-testid="checkout-address"
                value={form.shipping_address}
                onChange={(e) => set("shipping_address", e.target.value)}
                className="bg-zinc-950 border-zinc-800 rounded-none mt-1 min-h-[100px]"
                placeholder="Street, City, Postal Code, Country"
              />
            </div>
          </section>

          <section>
            <h2 className="font-heading uppercase tracking-widest text-xs text-zinc-400 mb-4 pb-2 border-b border-zinc-900">Payment</h2>
            <div className="border border-zinc-800 p-4 bg-zinc-950 flex items-start gap-3">
              <div className="h-4 w-4 border-2 border-[#FF3B30] rounded-full flex items-center justify-center mt-0.5">
                <div className="h-2 w-2 bg-[#FF3B30] rounded-full" />
              </div>
              <div className="flex-1">
                <div className="font-heading uppercase tracking-widest text-sm">Mock Pay (Demo)</div>
                <div className="text-xs text-zinc-500 mt-1">
                  No real charge. Payhere.lk/LankaPay integration scheduled for next phase.
                </div>
              </div>
            </div>
          </section>

          <section>
            <Label className="text-xs uppercase tracking-widest text-zinc-400">Order Notes</Label>
            <Textarea
              data-testid="checkout-notes"
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              className="bg-zinc-950 border-zinc-800 rounded-none mt-1"
              placeholder="Optional notes for the crew"
            />
          </section>
        </div>

        <aside>
          <div className="border border-zinc-800 bg-zinc-950/80 p-6 sticky top-24">
            <h2 className="font-heading uppercase tracking-widest text-xs text-zinc-400 mb-4 pb-2 border-b border-zinc-900">Order Summary</h2>
            <div className="space-y-3 max-h-80 overflow-y-auto mb-6 pr-2">
              {items.map((i) => (
                <div key={i.variant_id} className="flex gap-3 items-start">
                  <div className="w-14 h-16 border border-zinc-800 overflow-hidden flex-shrink-0 bg-zinc-900">
                    {i.image && <img src={imgSrc({ data_base64: i.image, mime_type: i.image_mime })} alt="" className="w-full h-full object-cover" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{i.name}</div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest">
                      {i.size} · {i.color} · ×{i.quantity}
                    </div>
                  </div>
                  <div className="text-xs font-mono">{formatPrice(i.price * i.quantity)}</div>
                </div>
              ))}
            </div>

            <div className="space-y-2 text-sm border-t border-zinc-900 pt-4">
              <div className="flex justify-between">
                <span className="text-zinc-500 text-xs uppercase tracking-widest">Subtotal</span>
                <span className="font-mono">{formatPrice(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500 text-xs uppercase tracking-widest">Shipping</span>
                <span className="font-mono">{shipping === 0 ? "Free" : formatPrice(shipping)}</span>
              </div>
              <div className="flex justify-between pt-3 border-t border-zinc-900">
                <span className="font-heading uppercase tracking-widest">Total</span>
                <span className="font-mono text-lg" data-testid="checkout-total">{formatPrice(total)}</span>
              </div>
            </div>

            <Button
              data-testid="place-order-btn"
              disabled={loading}
              onClick={placeOrder}
              className="w-full mt-6 bg-[#FF3B30] hover:bg-[#D92D23] rounded-none font-heading font-bold uppercase tracking-widest py-6"
            >
              {loading ? "Processing..." : "Place Order"}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
