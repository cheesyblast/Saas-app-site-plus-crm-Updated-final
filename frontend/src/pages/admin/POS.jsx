import React, { useEffect, useMemo, useState } from "react";
import api, { imgSrc, formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Plus, Minus, Search, Trash2, Printer, MessageSquare, Percent, Barcode } from "lucide-react";
import { toast } from "sonner";
import { normalizePhoneLK } from "@/lib/phone";

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
  const [lastOrder, setLastOrder] = useState(null);
  const [activeDiscounts, setActiveDiscounts] = useState([]);
  // Manual cashier-entered discount on top of auto promotions
  const [manualDiscount, setManualDiscount] = useState({ kind: "percent", value: "" });
  // Variant-picker popup when an image is tapped
  const [picker, setPicker] = useState(null); // { product, variants }

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
    api.get("/discounts/active").then(({ data }) => setActiveDiscounts(data || [])).catch(() => {});
  }, []);

  // Pick the highest-savings active promotion that applies to a line item.
  const bestDiscount = (productId, categoryId, unitPrice) => {
    let save = 0; let applied = null;
    for (const d of activeDiscounts) {
      let ok = false;
      if (d.scope === "sitewide") ok = true;
      else if (d.scope === "products" && (d.scope_product_ids || []).includes(productId)) ok = true;
      else if (d.scope === "categories" && categoryId && (d.scope_category_ids || []).includes(categoryId)) ok = true;
      if (!ok) continue;
      const s = d.type === "percent" ? unitPrice * (Number(d.value) / 100) : Math.min(unitPrice, Number(d.value));
      if (s > save) { save = s; applied = d; }
    }
    return { save, applied };
  };

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

  // ---------- Barcode scanner support ----------
  // A USB scanner just types the barcode as fast as keystrokes + Enter.
  // We dedicate an input box that auto-focuses and submits on Enter, so
  // any cashier can scan without touching the mouse. Tablets can also
  // tap a "Scan" button to focus the field.
  const [scanCode, setScanCode] = useState("");
  const onScanSubmit = async (e) => {
    e?.preventDefault();
    const code = scanCode.trim();
    if (!code) return;
    setScanCode("");
    try {
      const { data } = await api.get(`/admin/barcode/lookup/${encodeURIComponent(code)}`);
      // Re-use existing add() — synthesise the shape it expects.
      const synthProduct = { id: data.product_id, name: data.product_name, base_price: data.price, images: [], category_id: null };
      const synthVariant = { id: data.variant_id, size: data.size, color: data.color, price_override: null };
      add(synthProduct, synthVariant);
      toast.success(`Added ${data.product_name}${data.size ? ` · ${data.size}` : ""}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Barcode not found");
    }
  };

  const add = (p, v) => {
    const price = v.price_override ?? p.base_price;
    setCart((prev) => {
      const idx = prev.findIndex((x) => x.variant_id === v.id);
      if (idx >= 0) {
        const copy = [...prev]; copy[idx].quantity += 1; return copy;
      }
      return [...prev, { variant_id: v.id, product_id: p.id, name: p.name, size: v.size, color: v.color, price, quantity: 1, image: p.images?.[0], category_id: p.category_id || p.category?.id || null }];
    });
    setPicker(null);
  };
  const remove = (id) => setCart((p) => p.filter((x) => x.variant_id !== id));
  const inc = (id, d) => setCart((p) => p.map((x) => x.variant_id === id ? { ...x, quantity: Math.max(1, x.quantity + d) } : x));

  // Per-line subtotal + auto discount + manual cashier discount applied on top
  const lines = useMemo(() => cart.map((c) => {
    const { save, applied } = bestDiscount(c.product_id, c.category_id, c.price);
    const effective = Math.max(0, c.price - save);
    return { ...c, save_per_unit: save, applied_discount: applied, effective_price: effective };
  }), [cart, activeDiscounts]);
  const subtotalGross = lines.reduce((s, x) => s + x.price * x.quantity, 0);
  const autoDiscountTotal = lines.reduce((s, x) => s + x.save_per_unit * x.quantity, 0);
  const subtotalAfterAuto = subtotalGross - autoDiscountTotal;
  const manualVal = parseFloat(manualDiscount.value) || 0;
  const manualDiscountAmt = manualDiscount.kind === "percent" ? subtotalAfterAuto * (manualVal / 100) : Math.min(subtotalAfterAuto, manualVal);
  const total = Math.max(0, subtotalAfterAuto - manualDiscountAmt);
  const tendered = parseFloat(cashTendered) || 0;
  const change = payment === "cash" ? Math.max(0, tendered - total) : 0;

  const checkout = async () => {
    if (cart.length === 0) return toast.error("Cart is empty");
    if (payment === "cash" && cashTendered && tendered < total) return toast.error("Cash tendered is less than total");
    setProcessing(true);
    try {
      const phoneNorm = normalizePhoneLK(customer.phone);
      const { data } = await api.post("/checkout", {
        customer_name: customer.name || "Walk-in",
        customer_email: customer.email || null,
        customer_phone: phoneNorm || null,
        shipping_address: null,
        items: cart.map(c => ({ variant_id: c.variant_id, quantity: c.quantity })),
        coupon_code: coupon || null,
        payment_method: payment,
        source: "pos",
        store_id: storeId || null,
        cash_tendered: payment === "cash" && cashTendered ? tendered : null,
        card_last4: payment !== "cash" && cardLast4 ? cardLast4 : null,
        cash_account_id: accountId || null,
        manual_discount_percent: manualDiscount.kind === "percent" && manualVal ? manualVal : null,
        manual_discount_amount: manualDiscount.kind === "fixed" && manualVal ? manualVal : null,
      });
      toast.success(`Order ${data.order_number} · ${formatPrice(data.total)}`);
      setLastOrder({ order_number: data.order_number, total: data.total, phone: phoneNorm, email: customer.email });
      const url = `${window.location.origin}/receipt/${data.order_number}`;
      window.open(url, "_blank");
      setCart([]); setCoupon(""); setCashTendered(""); setCardLast4("");
      setManualDiscount({ kind: "percent", value: "" });
      setCustomer({ id: null, name: "", email: "", phone: "" });
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search products..." className="pl-9 bg-zinc-900 border-zinc-800 rounded-none" data-testid="pos-search" />
          </div>
          <form onSubmit={onScanSubmit} className="relative">
            <Barcode className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
            <Input
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              placeholder="Scan barcode (or type code + Enter)"
              className="pl-9 bg-zinc-900 border-emerald-900/50 rounded-none font-mono focus:border-emerald-600"
              data-testid="pos-scan-input"
              autoFocus
            />
          </form>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map((p) => (
            <div key={p.id} className="border border-zinc-900 bg-zinc-950">
              <button
                type="button"
                onClick={() => setPicker({ product: p, variants: p.variants || [] })}
                data-testid={`pos-image-${p.id}`}
                className="aspect-square bg-zinc-900 w-full block hover:opacity-80 transition-opacity"
                title="Tap to pick a variant"
              >
                {p.images?.[0] && <img src={imgSrc(p.images[0])} alt="" className="w-full h-full object-cover" />}
              </button>
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
          {cart.map((c) => {
            const line = lines.find(l => l.variant_id === c.variant_id) || c;
            return (
              <div key={c.variant_id} className="flex items-start gap-2 border-b border-zinc-900 pb-2">
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold truncate">{c.name}</div>
                  <div className="text-[10px] text-zinc-500">{c.size} {c.color ? `· ${c.color}` : ""}</div>
                  {line.applied_discount && <div className="text-[10px] text-[#FF3B30] uppercase tracking-widest">{line.applied_discount.badge_label || line.applied_discount.name}</div>}
                  <div className="flex items-center gap-2 mt-1">
                    <button onClick={() => inc(c.variant_id, -1)} className="border border-zinc-800 px-1"><Minus className="h-3 w-3" /></button>
                    <span className="text-xs font-mono">{c.quantity}</span>
                    <button onClick={() => inc(c.variant_id, 1)} className="border border-zinc-800 px-1"><Plus className="h-3 w-3" /></button>
                  </div>
                </div>
                <div className="text-xs font-mono text-right">
                  {line.save_per_unit > 0 ? (
                    <>
                      <div className="text-zinc-500 line-through text-[10px]">{formatPrice(c.price * c.quantity)}</div>
                      <div>{formatPrice(line.effective_price * c.quantity)}</div>
                    </>
                  ) : formatPrice(c.price * c.quantity)}
                </div>
                <button onClick={() => remove(c.variant_id)} className="text-zinc-500 hover:text-red-400"><Trash2 className="h-3 w-3" /></button>
              </div>
            );
          })}
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

          <div className="border border-zinc-800 p-2 space-y-2">
            <div className="flex items-center gap-2 text-xs">
              <Percent className="h-3 w-3 text-zinc-400"/>
              <span className="uppercase tracking-widest text-zinc-400">Manual Discount</span>
              <Select value={manualDiscount.kind} onValueChange={(v) => setManualDiscount(s => ({ ...s, kind: v }))}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none h-7 w-24 text-xs ml-auto"><SelectValue/></SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800 text-white"><SelectItem value="percent">%</SelectItem><SelectItem value="fixed">LKR</SelectItem></SelectContent>
              </Select>
              <Input data-testid="pos-manual-discount" type="number" step="0.01" placeholder="0" value={manualDiscount.value} onChange={(e) => setManualDiscount(s => ({ ...s, value: e.target.value }))} className="bg-zinc-900 border-zinc-800 rounded-none h-7 text-xs w-20"/>
            </div>
          </div>

          <div className="space-y-1 pt-2">
            <div className="flex justify-between text-xs"><span className="text-zinc-500 uppercase tracking-widest">Subtotal</span><span className="font-mono">{formatPrice(subtotalGross)}</span></div>
            {autoDiscountTotal > 0 && <div className="flex justify-between text-xs text-[#FF3B30]"><span className="uppercase tracking-widest">Promo</span><span className="font-mono">- {formatPrice(autoDiscountTotal)}</span></div>}
            {manualDiscountAmt > 0 && <div className="flex justify-between text-xs text-[#FF3B30]"><span className="uppercase tracking-widest">Manual</span><span className="font-mono">- {formatPrice(manualDiscountAmt)}</span></div>}
            <div className="flex justify-between text-sm pt-1 border-t border-zinc-900"><span className="text-white uppercase tracking-widest text-xs">Total</span><span className="font-mono text-base">{formatPrice(total)}</span></div>
          </div>
          <Button onClick={checkout} disabled={processing} className="w-full bg-[#FF3B30] hover:bg-[#D92D23] rounded-none font-heading font-bold uppercase tracking-widest py-5" data-testid="pos-checkout-btn">
            {processing ? "Processing..." : `Checkout · ${formatPrice(total)}`}
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

      <Dialog open={!!picker} onOpenChange={(o) => !o && setPicker(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-lg" data-testid="pos-variant-picker">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">{picker?.product?.name}</DialogTitle></DialogHeader>
          {picker && (
            <div className="space-y-4">
              <div className="aspect-video bg-zinc-900 border border-zinc-800 overflow-hidden">
                {picker.product.images?.[0] && <img src={imgSrc(picker.product.images[0])} alt="" className="w-full h-full object-contain"/>}
              </div>
              <div className="text-xs text-zinc-500 uppercase tracking-widest">Pick a colour / size</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto">
                {picker.variants.map((v) => (
                  <button
                    key={v.id}
                    onClick={() => add(picker.product, v)}
                    data-testid={`picker-add-${v.id}`}
                    className="border border-zinc-800 hover:border-[#FF3B30] hover:bg-[#FF3B30]/5 p-3 text-left transition"
                    title={`Stock: ${v.stock ?? "?"}`}
                  >
                    <div className="flex items-center gap-2">
                      {v.color_hex && <span className="inline-block h-4 w-4 border border-zinc-700" style={{ background: v.color_hex }}/>}
                      <span className="font-heading uppercase tracking-widest text-xs">{v.size}{v.color ? ` · ${v.color}` : ""}</span>
                    </div>
                    <div className="text-[10px] text-zinc-500 mt-1 font-mono">{formatPrice(v.price_override ?? picker.product.base_price)} {typeof v.stock === "number" ? `· ${v.stock} in stock` : ""}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
