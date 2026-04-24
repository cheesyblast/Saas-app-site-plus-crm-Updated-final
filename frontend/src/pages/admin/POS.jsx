import React, { useEffect, useMemo, useState } from "react";
import api, { imgSrc, formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";

export default function POS() {
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [cart, setCart] = useState([]);
  const [q, setQ] = useState("");
  const [storeId, setStoreId] = useState("");
  const [customer, setCustomer] = useState({ name: "Walk-in Customer", email: "", phone: "" });
  const [coupon, setCoupon] = useState("");
  const [payment, setPayment] = useState("cash");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    api.get("/admin/products").then(({ data }) => setProducts(data));
    api.get("/admin/stores").then(({ data }) => { setStores(data); if (data.length) setStoreId(data[0].id); });
  }, []);

  const filtered = useMemo(() => {
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  }, [q, products]);

  const add = (p, v) => {
    const price = v.price_override ?? p.base_price;
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.variant_id === v.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx].quantity += 1;
        return copy;
      }
      return [...prev, {
        variant_id: v.id, product_id: p.id, name: p.name, size: v.size, color: v.color,
        price, quantity: 1, image: p.images?.[0],
      }];
    });
  };
  const remove = (id) => setCart((p) => p.filter((x) => x.variant_id !== id));
  const inc = (id, d) => setCart((p) => p.map((x) => x.variant_id === id ? { ...x, quantity: Math.max(1, x.quantity + d) } : x));

  const subtotal = cart.reduce((s, x) => s + x.price * x.quantity, 0);

  const checkout = async () => {
    if (cart.length === 0) return toast.error("Cart is empty");
    setProcessing(true);
    try {
      const { data } = await api.post("/checkout", {
        customer_name: customer.name || "Walk-in",
        customer_email: customer.email || null,
        customer_phone: customer.phone || null,
        shipping_address: null,
        items: cart.map(c => ({ variant_id: c.variant_id, quantity: c.quantity })),
        coupon_code: coupon || null,
        payment_method: payment,
        source: "pos",
        store_id: storeId || null,
      });
      toast.success(`Order ${data.order_number} · ${formatPrice(data.total)}`);
      setCart([]); setCoupon("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Checkout failed");
    } finally { setProcessing(false); }
  };

  return (
    <div className="grid lg:grid-cols-[1fr_420px] gap-6" data-testid="admin-pos">
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">POS</h1>
          <Select value={storeId} onValueChange={setStoreId}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none w-60"><SelectValue placeholder="Store" /></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              {stores.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products..." className="pl-9 bg-zinc-900 border-zinc-800 rounded-none" data-testid="pos-search" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <div key={p.id} className="border border-zinc-900 bg-zinc-950">
              <div className="aspect-square bg-zinc-900">{p.images?.[0] && <img src={imgSrc(p.images[0])} alt="" className="w-full h-full object-cover" />}</div>
              <div className="p-2">
                <div className="text-xs font-semibold truncate">{p.name}</div>
                <div className="text-[10px] text-zinc-500 font-mono">{formatPrice(p.base_price)}</div>
                <div className="flex flex-wrap gap-1 mt-2">
                  {(p.variants || []).map((v) => (
                    <button key={v.id} onClick={() => add(p, v)} className="text-[10px] border border-zinc-800 hover:border-[#FF3B30] hover:text-[#FF3B30] px-2 py-0.5 uppercase tracking-widest" data-testid={`pos-add-${v.id}`}>
                      {v.size}{v.color ? `/${v.color}` : ""}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="col-span-full p-12 text-center text-zinc-500 border border-zinc-900">No products</div>}
        </div>
      </div>
      <aside className="bg-zinc-950 border border-zinc-900 p-5 sticky top-6 self-start flex flex-col min-h-[70vh]">
        <h2 className="font-heading uppercase tracking-widest text-sm mb-3">Cart ({cart.length})</h2>
        <div className="flex-1 overflow-y-auto space-y-2 max-h-[40vh]">
          {cart.map((c) => (
            <div key={c.variant_id} className="flex items-start gap-2 border-b border-zinc-900 pb-2">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate">{c.name}</div>
                <div className="text-[10px] text-zinc-500">{c.size} {c.color ? `· ${c.color}` : ""}</div>
                <div className="flex items-center gap-2 mt-1">
                  <button onClick={() => inc(c.variant_id, -1)} className="border border-zinc-800 px-1"><Minus className="h-3 w-3" /></button>
                  <span className="text-xs font-mono">{c.quantity}</span>
                  <button onClick={() => inc(c.variant_id, 1)} className="border border-zinc-800 px-1"><Plus className="h-3 w-3" /></button>
                </div>
              </div>
              <div className="text-xs font-mono">{formatPrice(c.price * c.quantity)}</div>
              <button onClick={() => remove(c.variant_id)} className="text-zinc-500 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
            </div>
          ))}
          {cart.length === 0 && <div className="text-xs text-zinc-500 text-center py-8">Select products to add</div>}
        </div>
        <div className="border-t border-zinc-900 pt-3 space-y-2">
          <Input placeholder="Customer name" value={customer.name} onChange={(e) => setCustomer({ ...customer, name: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none h-8 text-xs" />
          <Input placeholder="Phone" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none h-8 text-xs" />
          <Input placeholder="Coupon" value={coupon} onChange={(e) => setCoupon(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none h-8 text-xs" />
          <Select value={payment} onValueChange={setPayment}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white"><SelectItem value="cash">Cash</SelectItem><SelectItem value="card">Card (Manual)</SelectItem><SelectItem value="mock">Mock Pay</SelectItem></SelectContent>
          </Select>
          <div className="flex justify-between text-sm pt-2">
            <span className="text-zinc-500 uppercase tracking-widest text-xs">Subtotal</span>
            <span className="font-mono">{formatPrice(subtotal)}</span>
          </div>
          <Button onClick={checkout} disabled={processing} className="w-full bg-[#FF3B30] hover:bg-[#D92D23] rounded-none font-heading font-bold uppercase tracking-widest py-5" data-testid="pos-checkout-btn">
            {processing ? "Processing..." : `Checkout · ${formatPrice(subtotal)}`}
          </Button>
        </div>
      </aside>
    </div>
  );
}
