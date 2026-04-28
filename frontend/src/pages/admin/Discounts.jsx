import React, { useEffect, useState } from "react";
import api, { formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const empty = {
  id: null, name: "", description: "", type: "percent", value: 10,
  scope: "sitewide", scope_product_ids: [], scope_category_ids: [],
  show_badge_on_products: true, badge_label: "SALE", badge_color: "#FF3B30",
  show_marquee: true, marquee_size: "sm", marquee_speed: "normal",
  marquee_bg: "#FF3B30", marquee_fg: "#FFFFFF",
  starts_at: "", ends_at: "", active: true,
};

function toLocalDtInput(v) {
  if (!v) return "";
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function Discounts() {
  const [rows, setRows] = useState([]);
  const [products, setProducts] = useState([]);
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);

  const load = async () => {
    const { data } = await api.get("/admin/discounts", { params: { page: 1, page_size: 50 } });
    setRows(data.items || []);
  };
  useEffect(() => {
    load();
    api.get("/admin/products", { params: { page: 1, page_size: 100 } }).then(({ data }) => setProducts(data.items || []));
    api.get("/categories").then(({ data }) => setCats(data || []));
  }, []);

  const openEdit = (d) => {
    setForm({
      ...empty, ...d,
      scope_product_ids: d.scope_product_ids || [],
      scope_category_ids: d.scope_category_ids || [],
      starts_at: toLocalDtInput(d.starts_at),
      ends_at: toLocalDtInput(d.ends_at),
    });
    setOpen(true);
  };

  const save = async () => {
    try {
      const payload = {
        ...form,
        value: parseFloat(form.value) || 0,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      };
      if (form.id) await api.put(`/admin/discounts/${form.id}`, payload);
      else await api.post("/admin/discounts", payload);
      toast.success("Saved"); setOpen(false); load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };
  const del = async (id) => { if (!confirm("Delete this promotion?")) return; await api.delete(`/admin/discounts/${id}`); load(); };
  const toggleId = (key, id) => setForm(f => {
    const arr = f[key] || [];
    return { ...f, [key]: arr.includes(id) ? arr.filter(x => x !== id) : [...arr, id] };
  });

  return (
    <div className="space-y-4" data-testid="admin-discounts">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <p className="text-sm text-zinc-500">{rows.length} promotion{rows.length !== 1 ? "s" : ""} configured · marquee shows on every storefront page when active</p>
        <Button data-testid="new-discount-btn" onClick={() => { setForm(empty); setOpen(true); }} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold"><Plus className="h-4 w-4 mr-2"/> New Discount</Button>
      </div>

      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400">
            <tr><th className="text-left p-3">Name</th><th className="text-left p-3">Discount</th><th className="text-left p-3">Scope</th><th className="text-left p-3">Marquee</th><th className="text-left p-3">Badge</th><th className="text-left p-3">Ends</th><th className="text-left p-3">Active</th><th className="p-3"></th></tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                <td className="p-3 font-semibold">{d.name}</td>
                <td className="p-3 font-mono">{d.type === "percent" ? `${d.value}%` : formatPrice(d.value)}</td>
                <td className="p-3 text-xs uppercase tracking-widest text-zinc-400">{d.scope}</td>
                <td className="p-3 text-xs">{d.show_marquee ? <span className="text-green-400">on · {d.marquee_size}</span> : <span className="text-zinc-500">off</span>}</td>
                <td className="p-3 text-xs">{d.show_badge_on_products ? <span className="px-2 py-0.5 text-[10px]" style={{ background: d.badge_color, color: "#fff" }}>{d.badge_label || "SALE"}</span> : <span className="text-zinc-500">off</span>}</td>
                <td className="p-3 text-xs text-zinc-500 font-mono">{d.ends_at ? new Date(d.ends_at).toLocaleString() : "—"}</td>
                <td className="p-3">{d.active ? <span className="text-green-400 text-xs">Active</span> : <span className="text-zinc-500 text-xs">Off</span>}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button onClick={() => openEdit(d)} className="text-zinc-400 hover:text-white p-1"><Pencil className="h-4 w-4"/></button>
                  <button onClick={() => del(d.id)} className="text-zinc-400 hover:text-red-400 p-1"><Trash2 className="h-4 w-4"/></button>
                </td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={8} className="p-12 text-center text-zinc-500">No discounts yet. Create one to launch a sitewide sale or category promo.</td></tr>}
          </tbody>
        </table>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white rounded-none max-w-xl">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">{form.id ? "Edit" : "New"} Discount Promotion</DialogTitle></DialogHeader>
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Promotion Name *</Label>
              <Input data-testid="discount-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder='e.g. "Black Friday 30% Off"' className="bg-zinc-900 border-zinc-800 rounded-none mt-1"/>
              <p className="text-[10px] text-zinc-500 mt-1">Use this on social media + your website to refer to the campaign.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Discount Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}><SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue/></SelectTrigger><SelectContent className="bg-zinc-950 border-zinc-800 text-white"><SelectItem value="percent">Percent (%)</SelectItem><SelectItem value="fixed">Fixed amount</SelectItem></SelectContent></Select>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Value</Label>
                <Input type="number" step="0.01" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1"/>
              </div>
            </div>

            <div className="border border-zinc-800 p-3 space-y-3">
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Applies To</Label>
              <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v })}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none" data-testid="discount-scope-select"><SelectValue/></SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectItem value="sitewide">Sitewide (all products)</SelectItem>
                  <SelectItem value="categories">Specific categories</SelectItem>
                  <SelectItem value="products">Specific products</SelectItem>
                </SelectContent>
              </Select>
              {form.scope === "products" && (
                <div className="max-h-40 overflow-y-auto border border-zinc-900 p-2 space-y-1">
                  {products.map(p => (
                    <label key={p.id} className="flex items-center gap-2 text-xs hover:bg-zinc-900/40 p-1">
                      <input type="checkbox" checked={(form.scope_product_ids || []).includes(p.id)} onChange={() => toggleId("scope_product_ids", p.id)} className="accent-[#FF3B30]"/>
                      <span>{p.name}</span>
                    </label>
                  ))}
                  {products.length === 0 && <div className="text-zinc-500 text-xs p-2">No products</div>}
                </div>
              )}
              {form.scope === "categories" && (
                <div className="max-h-40 overflow-y-auto border border-zinc-900 p-2 space-y-1">
                  {cats.map(c => (
                    <label key={c.id} className="flex items-center gap-2 text-xs hover:bg-zinc-900/40 p-1">
                      <input type="checkbox" checked={(form.scope_category_ids || []).includes(c.id)} onChange={() => toggleId("scope_category_ids", c.id)} className="accent-[#FF3B30]"/>
                      <span>{c.name}{c.parent_id ? " (sub)" : ""}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Starts at (optional)</Label>
                <Input type="datetime-local" value={form.starts_at || ""} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1 text-xs"/>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Ends at</Label>
                <Input data-testid="discount-ends-at" type="datetime-local" value={form.ends_at || ""} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1 text-xs"/>
              </div>
            </div>

            <div className="border border-zinc-800 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Show "Sale" badge on product cards & images</Label>
                <Switch data-testid="discount-show-badge" checked={form.show_badge_on_products} onCheckedChange={(v) => setForm({ ...form, show_badge_on_products: v })}/>
              </div>
              {form.show_badge_on_products && (
                <div className="grid grid-cols-2 gap-3">
                  <div><Label className="text-xs text-zinc-500">Badge label</Label><Input value={form.badge_label || ""} placeholder="SALE / 30% OFF" onChange={(e) => setForm({ ...form, badge_label: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1 h-8"/></div>
                  <div><Label className="text-xs text-zinc-500">Badge color</Label><Input type="color" value={form.badge_color} onChange={(e) => setForm({ ...form, badge_color: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1 h-8 p-1"/></div>
                </div>
              )}
            </div>

            <div className="border border-zinc-800 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Top-of-page rolling marquee</Label>
                <Switch data-testid="discount-show-marquee" checked={form.show_marquee} onCheckedChange={(v) => setForm({ ...form, show_marquee: v })}/>
              </div>
              <div>
                <Label className="text-xs text-zinc-500">Description (shown in the marquee)</Label>
                <Textarea data-testid="discount-description" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder='e.g. "FLASH SALE — 30% off everything until midnight!"' className="bg-zinc-900 border-zinc-800 rounded-none mt-1"/>
              </div>
              {form.show_marquee && (
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-zinc-500">Size</Label>
                    <Select value={form.marquee_size} onValueChange={(v) => setForm({ ...form, marquee_size: v })}><SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1 h-8"><SelectValue/></SelectTrigger><SelectContent className="bg-zinc-950 border-zinc-800 text-white"><SelectItem value="xs">Slim (xs)</SelectItem><SelectItem value="sm">Small (sm)</SelectItem><SelectItem value="md">Medium (md)</SelectItem></SelectContent></Select>
                  </div>
                  <div>
                    <Label className="text-xs text-zinc-500">Speed</Label>
                    <Select value={form.marquee_speed} onValueChange={(v) => setForm({ ...form, marquee_speed: v })}><SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1 h-8"><SelectValue/></SelectTrigger><SelectContent className="bg-zinc-950 border-zinc-800 text-white"><SelectItem value="slow">Slow</SelectItem><SelectItem value="normal">Normal</SelectItem><SelectItem value="fast">Fast</SelectItem></SelectContent></Select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div><Label className="text-xs text-zinc-500">BG</Label><Input type="color" value={form.marquee_bg} onChange={(e) => setForm({ ...form, marquee_bg: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1 h-8 p-1"/></div>
                    <div><Label className="text-xs text-zinc-500">Text</Label><Input type="color" value={form.marquee_fg} onChange={(e) => setForm({ ...form, marquee_fg: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1 h-8 p-1"/></div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center gap-3"><Label className="text-xs uppercase tracking-widest text-zinc-400">Active</Label><Switch data-testid="discount-active" checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })}/></div>
          </div>
          <DialogFooter><Button onClick={save} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold" data-testid="save-discount-btn">Save Promotion</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
