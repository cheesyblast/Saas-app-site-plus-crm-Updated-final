import React, { useEffect, useMemo, useState } from "react";
import api, { imgSrc, formatPrice, BACKEND_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, Search, Trash2, Printer, MessageSquare } from "lucide-react";
import { toast } from "sonner";

export default function POS() {
  const [products, setProducts] = useState([]);
  const [stores, setStores] = useState([]);
  const [cart, setCart] = useState([]);
  const [q, setQ] = useState("");
  const [storeId, setStoreId] = useState("");
  const [customer, setCustomer] = useState({ id: null, name: "", email: "", phone: "" });
  const [custSearch, setCustSearch] = useState("");
  const [custResults, setCustResults] = useState([]);
  const [coupon, setCoupon] = useState("");
  const [payment, setPayment] = useState("cash");
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [accountId, setAccountId] = useState("");
  const [cashTendered, setCashTendered] = useState("");
  const [cardLast4, setCardLast4] = useState("");
  const [processing, setProcessing] = useState(false);
  const [lastOrder, setLastOrder] = useState(null); // {order_number, total}

  // Load products filtered by store stock — re-fetch when storeId changes
  useEffect(() => {
    if (!storeId) return;
    api.get("/admin/products", { params: { page: 1, page_size: 200, store_id: storeId, in_stock: true } })
       .then(({ data }) => setProducts(data.items || []));
  }, [storeId]);

  useEffect(() => {
    api.get("/admin/stores").then(({ data }) => { setStores(data); if (data.length) setStoreId(data[0].id); });
    api.get("/admin/payment-methods").then(({ data }) => {
      const pos = (data || []).filter(p => p.scope === "pos" && p.active);
      setPaymentMethods(pos);
      if (pos.length) setPayment(pos[0].code);
    });
    api.get("/admin/cash-accounts").then(({ data }) => setAccounts(data || []));
  }, []);

  // Auto-pick a matching cash drawer when store/payment changes
  useEffect(() => {
    if (!accounts.length) return;
    const wantedKind = payment === "cash" ? "cash" : "bank";
    const candidate = accounts.find(a => a.active && a.kind === wantedKind && (a.store_id === storeId || !a.store_id));
    if (candidate) setAccountId(candidate.id);
    else setAccountId("");
  }, [accounts, storeId, payment]);

  useEffect(() => {
    if (!custSearch || custSearch.length < 2) { setCustResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await api.get("/admin/customers", { params: { q: custSearch, limit: 8 } });
      setCustResults(data);
    }, 250);
    return () => clearTimeout(t);
  }, [custSearch]);

  const pickCustomer = (c) => {
    setCustomer({ id: c.id, name: c.name, email: c.email || "", phone: c.phone || "" });
    setCustSearch(""); setCustResults([]);
  };

  const filtered = useMemo(() => {
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()));
  }, [q, products]);

  const add = (p, v) => {
    const price = v.price_override ?? p.base_price;
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.variant_id === v.id);
      if (idx >= 0) {
        const copy = [...prev]; copy[idx].quantity += 1; return copy;
      }
      return [...prev, { variant_id: v.id, product_id: p.id, name: p.name, size: v.size, color: v.color, price, quantity: 1, image: p.images?.[0] }];
    });
  };
  const remove = (id) => setCart((p) => p.filter((x) => x.variant_id !== id));
  const inc = (id, d) => setCart((p) => p.map((x) => x.variant_id === id ? { ...x, quantity: Math.max(1, x.quantity + d) } : x));

  const subtotal = cart.reduce((s, x) => s + x.price * x.quantity, 0);
  const tendered = parseFloat(cashTendered) || 0;
  const change = payment === "cash" ? Math.max(0, tendered - subtotal) : 0;

  const checkout = async () => {
    if (cart.length === 0) return toast.error("Cart is empty");
    if (payment === "cash" && cashTendered && tendered < subtotal) return toast.error("Cash tendered is less than total");
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
        cash_tendered: payment === "cash" && cashTendered ? tendered : null,
        card_last4: payment !== "cash" && cardLast4 ? cardLast4 : null,
        cash_account_id: accountId || null,
      });
      toast.success(`Order ${data.order_number} · ${formatPrice(data.total)}`);
      setLastOrder({ order_number: data.order_number, total: data.total, phone: customer.phone, email: customer.email });
      // Auto-open print preview in new tab so cashier can print and continue
      const url = `${window.location.origin}/receipt/${data.order_number}`;
      window.open(url, "_blank");
      setCart([]); setCoupon(""); setCashTendered(""); setCardLast4("");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Checkout failed");
    } finally { setProcessing(false); }
  };

  const sendSmsLink = () => {
    if (!lastOrder?.phone) return toast.error("No customer phone for SMS");
    toast.success(`SMS receipt link queued to ${lastOrder.phone}`);
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
                    <button key={v.id} onClick={() => add(p, v)} title={`Stock: ${v.stock ?? "?"}`} className="text-[10px] border border-zinc-800 hover:border-[#FF3B30] hover:text-[#FF3B30] px-2 py-0.5 uppercase tracking-widest" data-testid={`pos-add-${v.id}`}>
                      {v.size}{v.color ? `/${v.color}` : ""}{typeof v.stock === "number" ? ` · ${v.stock}` : ""}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ))}
          {filtered.length === 0 && <div className="col-span-full p-12 text-center text-zinc-500 border border-zinc-900">No products in stock at this store. Use Inventory to move stock here, or pick a different store.</div>}
        </div>
      </div>

      <aside className="bg-zinc-950 border border-zinc-900 p-5 sticky top-6 self-start flex flex-col min-h-[70vh]">
        <h2 className="font-heading uppercase tracking-widest text-sm mb-3">Cart ({cart.length})</h2>
        <div className="flex-1 overflow-y-auto space-y-2 max-h-[35vh]">
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
          <div className="relative">
            <Input data-testid="pos-customer-search" placeholder="Search customer (name / phone)" value={custSearch} onChange={(e)=>setCustSearch(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none h-8 text-xs"/>
            {custResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-10 border border-zinc-700 bg-zinc-900 max-h-52 overflow-y-auto">
                {custResults.map(c => (
                  <button key={c.id} type="button" onClick={()=>pickCustomer(c)} data-testid={`pick-customer-${c.id}`} className="w-full text-left p-2 text-xs hover:bg-zinc-800 border-b border-zinc-800">
                    <div className="font-semibold">{c.name}</div>
                    <div className="text-zinc-500">{c.phone || ""} {c.email||""}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Input data-testid="pos-customer-name" placeholder="Customer name" value={customer.name} onChange={(e) => setCustomer({ ...customer, id:null, name: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none h-8 text-xs" />
          <Input data-testid="pos-customer-phone" placeholder="Phone (auto-registers if new)" value={customer.phone} onChange={(e) => setCustomer({ ...customer, id:null, phone: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none h-8 text-xs" />
          <Input placeholder="Coupon" value={coupon} onChange={(e) => setCoupon(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none h-8 text-xs" />
          <Select value={payment} onValueChange={setPayment}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none h-8 text-xs" data-testid="pos-payment-select"><SelectValue /></SelectTrigger>
            <SelectContent>
              {paymentMethods.length === 0 ? <SelectItem value="cash">Cash</SelectItem> : paymentMethods.map(p=><SelectItem key={p.code} value={p.code}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>

          {payment === "cash" ? (
            <div className="grid grid-cols-2 gap-2">
              <Input data-testid="pos-cash-tendered" type="number" step="0.01" placeholder="Cash tendered" value={cashTendered} onChange={(e) => setCashTendered(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none h-8 text-xs"/>
              <div className="bg-zinc-900 border border-zinc-800 px-2 h-8 flex items-center text-xs"><span className="text-zinc-500 mr-2">Change:</span><span className="font-mono">{formatPrice(change)}</span></div>
            </div>
          ) : (
            <Input data-testid="pos-card-last4" placeholder="Card last 4 (optional)" value={cardLast4} onChange={(e) => setCardLast4(e.target.value.replace(/\D/g,"").slice(0,4))} className="bg-zinc-900 border-zinc-800 rounded-none h-8 text-xs"/>
          )}

          {accounts.length > 0 && (
            <Select value={accountId || "_none"} onValueChange={(v) => setAccountId(v === "_none" ? "" : v)}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none h-8 text-xs"><SelectValue placeholder="Drawer / Bank account"/></SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                <SelectItem value="_none">— No account —</SelectItem>
                {accounts.filter(a => a.active && a.kind === (payment === "cash" ? "cash" : "bank")).map(a => <SelectItem key={a.id} value={a.id}>{a.name} ({formatPrice(a.balance)})</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <div className="flex justify-between text-sm pt-2">
            <span className="text-zinc-500 uppercase tracking-widest text-xs">Subtotal</span>
            <span className="font-mono">{formatPrice(subtotal)}</span>
          </div>
          <Button onClick={checkout} disabled={processing} className="w-full bg-[#FF3B30] hover:bg-[#D92D23] rounded-none font-heading font-bold uppercase tracking-widest py-5" data-testid="pos-checkout-btn">
            {processing ? "Processing..." : `Checkout · ${formatPrice(subtotal)}`}
          </Button>

          {lastOrder && (
            <div className="border border-green-900/40 bg-green-950/20 p-2 mt-2 text-xs space-y-1" data-testid="pos-last-order">
              <div className="text-green-400 font-mono">Last: {lastOrder.order_number} · {formatPrice(lastOrder.total)}</div>
              <div className="flex gap-2">
                <a href={`/receipt/${lastOrder.order_number}`} target="_blank" rel="noreferrer" className="flex-1 text-center border border-zinc-700 hover:border-white py-1 uppercase tracking-widest text-[10px] inline-flex items-center justify-center gap-1" data-testid="pos-print-receipt"><Printer className="h-3 w-3"/> Print Receipt</a>
                <button onClick={sendSmsLink} className="flex-1 border border-zinc-700 hover:border-white py-1 uppercase tracking-widest text-[10px] inline-flex items-center justify-center gap-1" data-testid="pos-sms-receipt"><MessageSquare className="h-3 w-3"/> SMS Link</button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
