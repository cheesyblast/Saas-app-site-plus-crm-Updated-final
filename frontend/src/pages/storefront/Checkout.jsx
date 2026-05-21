import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { imgSrc, formatPrice } from "@/lib/api";
import { useCart } from "@/lib/cart";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatApiErrorDetail } from "@/lib/errors";
import { Truck, MapPin, CreditCard, UserCheck } from "lucide-react";
import { useCompany } from "@/lib/company";

export default function Checkout() {
  const { items, subtotal, discount_total, subtotal_after_discount, clear } = useCart();
  const { user, loginWithGoogle } = useAuth();
  const { company } = useCompany();
  const googleEnabled = !!company?.auth_google_enabled;
  const nav = useNavigate();

  const [form, setForm] = useState({
    customer_name: "", customer_email: "", customer_phone: "",
    shipping_address: "", shipping_district: "", shipping_city: "",
    coupon_code: "", notes: "", payment_method: "",
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const [autofill, setAutofill] = useState(false);
  const [districts, setDistricts] = useState([]);
  const [byDistrict, setByDistrict] = useState({});
  const [shippingFee, setShippingFee] = useState(0);
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load districts + payment methods
  useEffect(() => {
    api.get("/locations").then(({ data }) => {
      setDistricts(data.districts || []);
      setByDistrict(data.by_district || {});
    });
    api.get("/payment-methods?scope=online").then(({ data }) => {
      setPaymentMethods(data);
      if (data.length && !form.payment_method) set("payment_method", data[0].code);
    });
  }, []);

  // Autofill from logged-in profile
  useEffect(() => {
    if (!user) return;
    set("customer_name", user.name || "");
    set("customer_email", user.email || "");
    set("customer_phone", user.phone || "");
    api.get("/my/profile").then(({ data }) => {
      if (autofill || (!form.customer_name && !form.shipping_address)) {
        setForm((f) => ({
          ...f,
          customer_name: data.name || f.customer_name,
          customer_email: data.email || f.customer_email,
          customer_phone: data.phone || f.customer_phone,
          shipping_address: data.address || f.shipping_address,
          shipping_district: data.district || f.shipping_district,
          shipping_city: data.city || f.shipping_city,
        }));
        setAutofill(true);
      }
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Recalc shipping
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const { data } = await api.get("/shipping/quote", {
          params: { district: form.shipping_district || undefined, city: form.shipping_city || undefined, subtotal },
        });
        setShippingFee(data.fee || 0);
      } catch { setShippingFee(0); }
    }, 100);
    return () => clearTimeout(t);
  }, [form.shipping_district, form.shipping_city, subtotal]);

  const cities = useMemo(() => byDistrict[form.shipping_district] || [], [form.shipping_district, byDistrict]);
  const total = subtotal_after_discount + shippingFee;

  // Cart-abandonment tracking: as soon as the customer has typed an email or
  // phone, debounce-POST /api/cart/sync so the worker can chase them if
  // they bail before paying. We skip the call until at least one identifier
  // is present (no point recording anonymous carts).
  useEffect(() => {
    if (items.length === 0) return;
    if (!form.customer_email && !form.customer_phone) return;
    const t = setTimeout(() => {
      api.post("/cart/sync", {
        customer_name: form.customer_name || null,
        customer_email: form.customer_email || null,
        customer_phone: form.customer_phone || null,
        items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity,
                                    name: i.name, price: i.effective_price ?? i.price })),
        estimated_total: total,
      }).catch(() => { /* silent — recovery is best-effort */ });
    }, 1500);
    return () => clearTimeout(t);
  }, [form.customer_email, form.customer_phone, form.customer_name, items, total]);

  const placeOrder = async () => {
    if (items.length === 0) return toast.error("Cart is empty");
    if (!form.customer_name || !form.customer_phone || !form.shipping_address || !form.shipping_district || !form.shipping_city) {
      return toast.error("Please complete all shipping fields");
    }
    if (!form.payment_method) return toast.error("Please select a payment method");
    setLoading(true);
    try {
      const { data } = await api.post("/checkout", {
        ...form,
        coupon_code: form.coupon_code || null,
        items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
        source: "online",
      });
      // PayHere redirect: backend returns a signed payload; we POST a hidden
      // form to PayHere's hosted checkout. Browser navigates away.
      // We submit FIRST and only clear the cart after, so the customer
      // doesn't see a 'Cart is empty' flash during the navigation.
      if (data.payhere_redirect) {
        _submitPayHereForm(data.payhere_redirect);
        // Clear after a tick so the browser has time to follow the redirect.
        setTimeout(() => clear(), 100);
        return;
      }
      clear();
      nav(`/order/${data.order_number}`);
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail) || "Order failed");
    } finally { setLoading(false); }
  };

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-24 text-center">
        <h1 className="font-heading text-4xl font-black uppercase tracking-tighter mb-6">Cart is empty</h1>
        <Button onClick={() => nav("/shop")} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none font-bold uppercase tracking-widest">
          Go Shopping
        </Button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-12 pb-24">
      <h1 className="font-heading text-5xl sm:text-6xl font-black uppercase tracking-tighter mb-10">Checkout</h1>

      {/* Sign-in autofill banner */}
      {!user && (
        <div className="mb-8 border border-zinc-800 bg-zinc-950 p-5 flex flex-col sm:flex-row gap-3 sm:items-center justify-between">
          <div className="flex items-start gap-3">
            <UserCheck className="h-5 w-5 text-[var(--theme-primary,#FF3B30)] flex-shrink-0 mt-0.5"/>
            <div>
              <div className="font-heading uppercase tracking-widest text-sm">Sign in for faster checkout</div>
              <div className="text-xs text-zinc-500 mt-1">Auto-fill name, phone, email & shipping from your account.</div>
            </div>
          </div>
          <div className="flex gap-2">
            {googleEnabled && (
              <Button onClick={loginWithGoogle} data-testid="checkout-google-btn" variant="outline" className="rounded-none border-zinc-700 bg-transparent uppercase tracking-widest text-xs gap-2">
                <svg className="h-3 w-3" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
                Google
              </Button>
            )}
            <Button onClick={() => nav("/login?next=/checkout")} variant="outline" className="rounded-none border-zinc-700 bg-transparent uppercase tracking-widest text-xs">Email</Button>
          </div>
        </div>
      )}

      {user && (
        <div className="mb-8 border border-zinc-800 bg-zinc-950 p-3 flex items-center justify-between">
          <div className="text-xs text-zinc-400">Signed in as <span className="text-white">{user.email}</span></div>
          <label className="flex items-center gap-2 text-xs text-zinc-400">
            <Switch data-testid="autofill-toggle" checked={autofill} onCheckedChange={setAutofill}/> Auto-fill from my profile
          </label>
        </div>
      )}

      <div className="grid lg:grid-cols-[1fr_420px] gap-12">
        <div className="space-y-8">
          <Section title="Contact" icon={UserCheck}>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Full Name *"><Input data-testid="checkout-name" value={form.customer_name} onChange={(e)=>set("customer_name",e.target.value)} className="bg-zinc-950 border-zinc-800 rounded-none"/></Field>
              <Field label="Phone *"><Input data-testid="checkout-phone" value={form.customer_phone} onChange={(e)=>set("customer_phone",e.target.value)} className="bg-zinc-950 border-zinc-800 rounded-none" placeholder="07X XXX XXXX"/></Field>
              <Field label="Email"><Input data-testid="checkout-email" type="email" value={form.customer_email} onChange={(e)=>set("customer_email",e.target.value)} className="bg-zinc-950 border-zinc-800 rounded-none"/></Field>
              <Field label="Coupon Code"><Input data-testid="checkout-coupon" value={form.coupon_code} onChange={(e)=>set("coupon_code",e.target.value)} className="bg-zinc-950 border-zinc-800 rounded-none" placeholder="Optional"/></Field>
            </div>
          </Section>

          <Section title="Shipping Address" icon={Truck}>
            <div className="space-y-4">
              <Field label="Street Address *">
                <Textarea data-testid="checkout-address" value={form.shipping_address} onChange={(e)=>set("shipping_address",e.target.value)} className="bg-zinc-950 border-zinc-800 rounded-none min-h-[80px]" placeholder="Street, building, postal code"/>
              </Field>
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="District *">
                  <Select value={form.shipping_district} onValueChange={(v)=>{set("shipping_district",v); set("shipping_city","");}}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 rounded-none" data-testid="checkout-district"><SelectValue placeholder="Select district"/></SelectTrigger>
                    <SelectContent>{districts.map(d=><SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
                <Field label="Town / City *">
                  <Select value={form.shipping_city} onValueChange={(v)=>set("shipping_city",v)} disabled={!form.shipping_district}>
                    <SelectTrigger className="bg-zinc-950 border-zinc-800 rounded-none" data-testid="checkout-city"><SelectValue placeholder={form.shipping_district?"Select city":"Pick district first"}/></SelectTrigger>
                    <SelectContent className="max-h-72">{cities.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                  </Select>
                </Field>
              </div>
            </div>
          </Section>

          <Section title="Payment Method" icon={CreditCard}>
            {paymentMethods.length === 0 ? (
              <div className="text-zinc-500 text-sm">No payment methods enabled. Please contact support.</div>
            ) : (
              <div className="space-y-2">
                {paymentMethods.map((p) => (
                  <label key={p.id} data-testid={`payment-option-${p.code}`} className={`flex items-start gap-3 p-4 border cursor-pointer transition ${form.payment_method===p.code?"border-[var(--theme-primary,#FF3B30)] bg-zinc-900/50":"border-zinc-800 hover:border-zinc-600"}`}>
                    <input type="radio" name="pm" checked={form.payment_method===p.code} onChange={()=>set("payment_method", p.code)} className="mt-1 accent-[var(--theme-primary,#FF3B30)]"/>
                    <div className="flex-1">
                      <div className="font-heading uppercase tracking-widest text-sm">{p.label}</div>
                      {p.description && <div className="text-xs text-zinc-500 mt-1">{p.description}</div>}
                    </div>
                  </label>
                ))}
              </div>
            )}
          </Section>

          <Section title="Order Notes (optional)">
            <Textarea data-testid="checkout-notes" value={form.notes} onChange={(e)=>set("notes",e.target.value)} className="bg-zinc-950 border-zinc-800 rounded-none" placeholder="Special instructions"/>
          </Section>
        </div>

        <aside>
          <div className="border border-zinc-800 bg-zinc-950/80 p-6 sticky top-24">
            <h2 className="font-heading uppercase tracking-widest text-xs text-zinc-400 mb-4 pb-2 border-b border-zinc-900">Order Summary</h2>
            <div className="space-y-3 max-h-72 overflow-y-auto mb-6 pr-2">
              {items.map((i) => (
                <div key={i.variant_id} className="flex gap-3 items-start">
                  <div className="w-14 h-16 border border-zinc-800 overflow-hidden flex-shrink-0 bg-zinc-900">
                    {i.image_url && <img src={imgSrc(i.image_url)} alt="" className="w-full h-full object-cover" loading="lazy" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold truncate">{i.name}</div>
                    <div className="text-[10px] text-zinc-500 uppercase tracking-widest">{i.size} · {i.color} · ×{i.quantity}</div>
                    {i.applied_discount && <div className="text-[10px] uppercase tracking-widest text-[#FF3B30]">{i.applied_discount.badge_label || i.applied_discount.name}</div>}
                  </div>
                  <div className="text-xs font-mono text-right">
                    {i.line_saving > 0 ? (
                      <>
                        <div className="text-zinc-500 line-through text-[10px]">{formatPrice(i.price * i.quantity)}</div>
                        <div>{formatPrice(i.effective_price * i.quantity)}</div>
                      </>
                    ) : formatPrice(i.price * i.quantity)}
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-2 text-sm border-t border-zinc-900 pt-4">
              <Row label="Subtotal" value={formatPrice(subtotal)} />
              {discount_total > 0 && <Row label="Discount" value={`- ${formatPrice(discount_total)}`} />}
              <Row label="Shipping" value={shippingFee === 0 ? "Free" : formatPrice(shippingFee)} />
              <div className="flex justify-between pt-3 border-t border-zinc-900">
                <span className="font-heading uppercase tracking-widest">Total</span>
                <span className="font-mono text-lg" data-testid="checkout-total">{formatPrice(total)}</span>
              </div>
            </div>
            <Button data-testid="place-order-btn" disabled={loading} onClick={placeOrder}
                    className="w-full mt-6 bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none font-heading font-bold uppercase tracking-widest py-6">
              {loading ? "Processing..." : "Place Order"}
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <section>
      <h2 className="font-heading uppercase tracking-widest text-xs text-zinc-400 mb-4 pb-2 border-b border-zinc-900 flex items-center gap-2">
        {Icon && <Icon className="h-3 w-3"/>}{title}
      </h2>
      {children}
    </section>
  );
}
function Field({ label, children }) { return (<div><Label className="text-xs uppercase tracking-widest text-zinc-400 mb-1 block">{label}</Label>{children}</div>); }
function Row({ label, value }) { return (<div className="flex justify-between"><span className="text-zinc-500 text-xs uppercase tracking-widest">{label}</span><span className="font-mono">{value}</span></div>); }

// Build a hidden <form>, populate hidden inputs from the signed PayHere
// payload returned by /api/checkout, and submit it. The browser navigates
// away to PayHere's hosted checkout page.
function _submitPayHereForm({ endpoint, fields }) {
  const f = document.createElement("form");
  f.method = "POST";
  f.action = endpoint;
  f.style.display = "none";
  Object.entries(fields || {}).forEach(([k, v]) => {
    const inp = document.createElement("input");
    inp.type = "hidden";
    inp.name = k;
    inp.value = v == null ? "" : String(v);
    f.appendChild(inp);
  });
  document.body.appendChild(f);
  f.submit();
}
