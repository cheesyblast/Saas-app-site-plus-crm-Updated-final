import React, { useEffect, useState, useMemo } from "react";
import api, { imgSrc, formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Sparkles, X, Search, Star, Upload } from "lucide-react";
import { toast } from "sonner";
import { formatApiErrorDetail } from "@/lib/errors";
import { preprocessImage, humanFileSize } from "@/lib/image";
import Pagination from "@/components/admin/Pagination";

const empty = {
  id: null, name: "", description: "", category_id: null,
  base_price: 0, compare_price: null, sku: "", status: "active", featured: false,
  shipping_note: "", returns_note: "",
  variants: [], images: [],
};

async function fileToBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(",")[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export default function Products() {
  const [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 50;
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [aiPrompt, setAiPrompt] = useState("");  // unused in v1, AI gen TBD
  const [gen, setGen] = useState(false);

  const load = async () => {
    const { data } = await api.get("/admin/products", { params: { ...(search ? { q: search } : {}), page, page_size: PAGE_SIZE } });
    setProducts(data.items || []); setTotal(data.total || 0);
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [search, page]);
  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => { api.get("/categories").then(({ data }) => setCats(data)); }, []);

  const edit = (p) => {
    setForm({
      ...p,
      category_id: p.category?.id || p.category_id || null,
      variants: p.variants || [],
      images: p.images || [],
      shipping_note: p.shipping_note || "",
      returns_note: p.returns_note || "",
    });
    setOpen(true);
  };
  const create = () => {
    setForm({ ...empty, base_price: 1000, variants: [{ size: "M", color: "Black", color_hex: "#111", price_override: null, sku: "", stock: 10 }], images: [] });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name, description: form.description || null,
        category_id: form.category_id || null,
        base_price: parseFloat(form.base_price) || 0,
        compare_price: form.compare_price ? parseFloat(form.compare_price) : null,
        sku: form.sku || null, status: form.status, featured: !!form.featured,
        shipping_note: form.shipping_note || null,
        returns_note: form.returns_note || null,
        variants: form.variants.map((v) => ({
          id: v.id || null, size: v.size || null, color: v.color || null,
          color_hex: v.color_hex || null,
          price_override: v.price_override ? parseFloat(v.price_override) : null,
          sku: v.sku || null, barcode: v.barcode || null, stock: parseInt(v.stock) || 0,
        })),
      };
      let saved;
      if (form.id) {
        const { data } = await api.put(`/admin/products/${form.id}`, payload);
        saved = data;
      } else {
        const { data } = await api.post("/admin/products", payload);
        saved = data;
      }
      setForm((f) => ({ ...f, ...saved, variants: saved.variants, images: saved.images }));
      toast.success("Saved");
      load();
      if (form.id) {
        // keep dialog open on first save to allow image upload
      } else {
        setForm((f) => ({ ...f, id: saved.id }));
      }
    } catch (e) {
      toast.error(formatApiErrorDetail(e?.response?.data?.detail) || "Failed");
    } finally { setSaving(false); }
  };

  const closeDialog = () => { setOpen(false); setForm(empty); };

  const del = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    await api.delete(`/admin/products/${id}`);
    toast.success("Deleted"); load();
  };

  const addVariantRow = () => setForm((f) => ({ ...f, variants: [...f.variants, { size: "", color: "", color_hex: "#000", price_override: null, sku: "", stock: 0 }] }));
  const setVar = (idx, key, val) => setForm((f) => { const v = [...f.variants]; v[idx] = { ...v[idx], [key]: val }; return { ...f, variants: v }; });
  const delVar = (idx) => setForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== idx) }));

  const uploadImage = async (file, color = null) => {
    if (!form.id) return toast.error("Save the product first to upload images");
    let processed;
    try {
      processed = await preprocessImage(file, { maxBytes: 1.5 * 1024 * 1024, maxDim: 2400 });
    } catch (e) {
      return toast.error(e.message || "Could not read image");
    }
    const isFirst = form.images.length === 0;
    try {
      await api.post(`/admin/products/${form.id}/images`, {
        data_base64: processed.dataBase64, mime_type: processed.mimeType, is_primary: isFirst, color,
      });
    } catch (e) {
      const code = e?.response?.status;
      // Some hosts (default Nginx) reject bodies > 1 MB — re-shrink the image
      // aggressively and try once more before giving up.
      if (code === 413 || code === 0 || code === undefined) {
        try {
          const smaller = await preprocessImage(file, { maxBytes: 700 * 1024, maxDim: 1600, forceJpeg: true });
          await api.post(`/admin/products/${form.id}/images`, {
            data_base64: smaller.dataBase64, mime_type: smaller.mimeType, is_primary: isFirst, color,
          });
          toast.success(`Uploaded (shrunk to ${humanFileSize(smaller.sizeBytes)} for your server's upload limit)`);
          // re-load to show
          const { data: r } = await api.get(`/admin/products`, { params: { page: 1, page_size: PAGE_SIZE } });
          const fr = (r.items || []).find((p) => p.id === form.id);
          if (fr) setForm((f) => ({ ...f, images: fr.images }));
          load();
          return;
        } catch (e2) {
          const detail = e2?.response?.data?.detail || e2?.response?.statusText || e2?.message || "Upload failed";
          return toast.error(`Server rejected the image (HTTP ${e2?.response?.status || "?"}): ${detail}. Ask your host to set Nginx 'client_max_body_size 5M;'`);
        }
      }
      const detail = e?.response?.data?.detail || e?.response?.statusText || e?.message || "Upload failed";
      return toast.error(`Upload failed (HTTP ${code || "?"}): ${detail}`);
    }
    const { data } = await api.get(`/admin/products`, { params: { page: 1, page_size: PAGE_SIZE } });
    const fresh = (data.items || []).find((p) => p.id === form.id);
    if (fresh) setForm((f) => ({ ...f, images: fresh.images }));
    load();
    toast.success(`Uploaded · ${humanFileSize(processed.sizeBytes)} · ${processed.width}×${processed.height}${processed.compressed ? " (compressed)" : ""}`);
  };

  const setMainImage = async (img_id) => {
    await api.put(`/admin/products/images/${img_id}`, { is_primary: true });
    setForm((f) => ({ ...f, images: f.images.map((i) => ({ ...i, is_primary: i.id === img_id })) }));
    load();
  };

  const setImageColor = async (img_id, color) => {
    await api.put(`/admin/products/images/${img_id}`, { color: color || null });
    setForm((f) => ({ ...f, images: f.images.map((i) => i.id === img_id ? { ...i, color: color || null } : i) }));
  };

  const delImage = async (img_id) => {
    await api.delete(`/admin/products/images/${img_id}`);
    setForm((f) => ({ ...f, images: f.images.filter((i) => i.id !== img_id) }));
    load();
  };

  const generateAI = async () => { /* AI image gen TBD - placeholder */ };

  const colorOptions = useMemo(() => {
    const set = new Map();
    form.variants.forEach((v) => { if (v.color && !set.has(v.color)) set.set(v.color, v.color_hex); });
    return Array.from(set, ([color, hex]) => ({ color, hex }));
  }, [form.variants]);

  return (
    <div className="space-y-6 text-white">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Products</h1>
          <p className="text-sm text-zinc-500 mt-1">{total} items</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500"/>
            <Input data-testid="products-search" placeholder="Search products..." value={search} onChange={(e) => setSearch(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none pl-9 w-64"/>
          </div>
          <a href="/admin/barcode-labels" target="_blank" rel="noreferrer" data-testid="print-labels-link" className="hidden md:inline-flex items-center gap-2 border border-zinc-800 bg-transparent hover:bg-zinc-900 rounded-none uppercase tracking-widest text-xs px-3 py-2">Print labels</a>
          <Button onClick={create} data-testid="new-product-btn" className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold">
            <Plus className="h-4 w-4 mr-2" /> New Product
          </Button>
        </div>
      </div>

      <div className="border border-zinc-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900/60 text-xs uppercase tracking-widest text-zinc-400">
            <tr>
              <th className="text-left p-3">Image</th>
              <th className="text-left p-3">Name</th>
              <th className="text-left p-3">Category</th>
              <th className="text-left p-3">Price</th>
              <th className="text-left p-3">Variants</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} className="border-t border-zinc-900 hover:bg-zinc-900/40">
                <td className="p-3"><div className="h-12 w-10 bg-zinc-900 border border-zinc-800 overflow-hidden">{p.images?.[0] && <img src={imgSrc(p.images[0])} alt="" className="w-full h-full object-cover" />}</div></td>
                <td className="p-3 font-semibold">{p.name}</td>
                <td className="p-3 text-zinc-400">{p.category?.name || "—"}</td>
                <td className="p-3 font-mono">{formatPrice(p.base_price)}</td>
                <td className="p-3 text-zinc-400">{p.variants?.length || 0}</td>
                <td className="p-3">
                  <span className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${p.status === "active" ? "border-green-700 text-green-400" : "border-zinc-700 text-zinc-500"}`}>{p.status}</span>
                  {p.featured && <span className="ml-2 text-[10px] uppercase tracking-widest px-2 py-1 border border-[var(--theme-primary,#FF3B30)] text-[var(--theme-primary,#FF3B30)]">Featured</span>}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button onClick={() => edit(p)} className="text-zinc-400 hover:text-white p-1" data-testid={`product-edit-${p.id}`}><Pencil className="h-4 w-4" /></button>
                  <button onClick={() => del(p.id)} className="text-zinc-400 hover:text-red-400 p-1" data-testid={`product-delete-${p.id}`}><Trash2 className="h-4 w-4" /></button>
                </td>
              </tr>
            ))}
            {products.length === 0 && <tr><td colSpan={7} className="p-12 text-center text-zinc-500">No products yet. Create one to get started.</td></tr>}
          </tbody>
        </table>
      </div>
      <Pagination page={page} pageSize={PAGE_SIZE} total={total} onChange={setPage} />

      <Dialog open={open} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-4xl max-h-[92vh] overflow-y-auto rounded-none">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">{form.id ? "Edit Product" : "New Product"}</DialogTitle></DialogHeader>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2"><Label className="text-xs uppercase tracking-widest text-zinc-400">Name</Label><Input data-testid="product-form-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div className="sm:col-span-2"><Label className="text-xs uppercase tracking-widest text-zinc-400">Description</Label><Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Category</Label>
              <Select value={form.category_id || "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? null : v })}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent><SelectItem value="none">— None —</SelectItem>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">SKU</Label><Input value={form.sku || ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Base Price</Label><Input type="number" step="0.01" value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Compare Price</Label><Input type="number" step="0.01" value={form.compare_price || ""} onChange={(e) => setForm({ ...form, compare_price: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" /></div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="active">Active</SelectItem><SelectItem value="draft">Draft</SelectItem><SelectItem value="archived">Archived</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3"><div><Label className="text-xs uppercase tracking-widest text-zinc-400 block mb-2">Featured</Label><Switch checked={!!form.featured} onCheckedChange={(v) => setForm({ ...form, featured: v })} data-testid="product-form-featured" /></div></div>

            {/* Variants */}
            <div className="sm:col-span-2 border border-zinc-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Variants (Size + Color)</Label>
                <Button type="button" onClick={addVariantRow} className="bg-zinc-900 hover:bg-zinc-800 text-xs rounded-none uppercase tracking-widest" data-testid="add-variant-btn"><Plus className="h-3 w-3 mr-1" /> Add</Button>
              </div>
              <div className="space-y-2">
                {form.variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Input placeholder="Size" value={v.size || ""} onChange={(e) => setVar(i, "size", e.target.value)} className="col-span-1 bg-zinc-900 border-zinc-800 rounded-none" />
                    <Input placeholder="Color name" value={v.color || ""} onChange={(e) => setVar(i, "color", e.target.value)} className="col-span-2 bg-zinc-900 border-zinc-800 rounded-none" />
                    <div className="col-span-1 flex items-center gap-1"><input type="color" value={v.color_hex || "#000"} onChange={(e) => setVar(i, "color_hex", e.target.value)} className="w-9 h-9 cursor-pointer bg-transparent border border-zinc-800"/></div>
                    <Input placeholder="Price ovr" type="number" step="0.01" value={v.price_override || ""} onChange={(e) => setVar(i, "price_override", e.target.value)} className="col-span-2 bg-zinc-900 border-zinc-800 rounded-none" />
                    <Input placeholder="SKU" value={v.sku || ""} onChange={(e) => setVar(i, "sku", e.target.value)} className="col-span-2 bg-zinc-900 border-zinc-800 rounded-none" />
                    <Input placeholder="Barcode" data-testid={`variant-barcode-${i}`} value={v.barcode || ""} onChange={(e) => setVar(i, "barcode", e.target.value)} className="col-span-2 bg-zinc-900 border-zinc-800 rounded-none font-mono" />
                    <Input placeholder="Stock" type="number" value={v.stock || 0} onChange={(e) => setVar(i, "stock", e.target.value)} className="col-span-1 bg-zinc-900 border-zinc-800 rounded-none" />
                    <button onClick={() => delVar(i)} className="col-span-1 text-zinc-400 hover:text-red-400"><X className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-zinc-500 mt-2">Barcode is what your POS scanner reads. Leave blank to use SKU as fallback. Click <strong>Print labels</strong> in Products list to generate a printable sheet of all barcodes.</p>
            </div>

            {/* Images */}
            <div className="sm:col-span-2 border border-zinc-800 p-4">
              <Label className="text-xs uppercase tracking-widest text-zinc-400 mb-3 block">Images {form.id ? "" : <span className="text-zinc-600 normal-case ml-2">(save first to enable upload)</span>}</Label>
              {form.images?.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  {form.images.map((im) => (
                    <div key={im.id} className="border border-zinc-800 group relative">
                      <div className="aspect-square bg-zinc-900 overflow-hidden"><img src={imgSrc(im)} alt="" className="w-full h-full object-cover"/></div>
                      <div className="p-2 space-y-2 bg-zinc-950 text-xs">
                        <Select value={im.color || "_all"} onValueChange={(v) => setImageColor(im.id, v === "_all" ? null : v)}>
                          <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none h-8 text-xs"><SelectValue/></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="_all">— All colors —</SelectItem>
                            {colorOptions.map((c) => <SelectItem key={c.color} value={c.color}><span className="inline-block w-3 h-3 mr-2 align-middle border" style={{background:c.hex}}/>{c.color}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center justify-between">
                          <button onClick={() => setMainImage(im.id)} className={`flex items-center gap-1 px-2 py-1 border ${im.is_primary?"border-[var(--theme-primary,#FF3B30)] text-[var(--theme-primary,#FF3B30)]":"border-zinc-700 text-zinc-400 hover:border-zinc-500"}`} data-testid={`set-main-${im.id}`}>
                            <Star className={`h-3 w-3 ${im.is_primary?"fill-current":""}`}/>{im.is_primary?"Main":"Set main"}
                          </button>
                          <button onClick={() => delImage(im.id)} className="p-1 text-zinc-500 hover:text-red-400"><Trash2 className="h-3 w-3"/></button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="border-t border-zinc-900 pt-3 space-y-3">
                <label className={`flex items-center gap-2 text-xs uppercase tracking-widest border border-dashed p-3 ${form.id?"border-zinc-700 hover:border-zinc-500 cursor-pointer text-zinc-300":"border-zinc-900 text-zinc-600"}`}>
                  <Upload className="h-4 w-4"/>{form.id ? "Click to upload image" : "Save product first"}
                  <input data-testid="upload-image-input" type="file" accept="image/*" disabled={!form.id} hidden multiple onChange={(e)=>{const fs=Array.from(e.target.files||[]); fs.forEach(f=>uploadImage(f));}}/>
                </label>
                <p className="text-[10px] text-zinc-500 leading-relaxed">
                  Recommended: 1200×1500 portrait, JPG/PNG, up to <span className="text-zinc-300">1.5&nbsp;MB</span>.
                  Larger photos are auto-resized to 2400px and compressed.
                </p>
                {form.id && (
                  <div className="flex gap-2 items-center text-[10px] text-zinc-500 uppercase tracking-widest">
                    <Sparkles className="h-3 w-3"/>Tip: Bind each image to a specific color so customers see the correct photo when picking color.
                  </div>
                )}
              </div>
            </div>

            {/* Per-product policy snippets */}
            <div className="sm:col-span-2 grid sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Shipping Note (shown on product page)</Label>
                <Textarea data-testid="shipping-note" value={form.shipping_note} onChange={(e) => setForm({ ...form, shipping_note: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1 min-h-[70px]" placeholder="e.g. Ships within 1-2 business days. Free shipping over Rs 5000."/>
                <p className="text-[10px] text-zinc-500 mt-1">A “Read more” link to /page/shipping-policy auto-appears.</p>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Returns Note</Label>
                <Textarea data-testid="returns-note" value={form.returns_note} onChange={(e) => setForm({ ...form, returns_note: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1 min-h-[70px]" placeholder="e.g. 14-day return on unworn items with tags."/>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={closeDialog} className="bg-transparent border border-zinc-700 rounded-none uppercase tracking-widest">Close</Button>
            <Button onClick={save} disabled={saving} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold" data-testid="save-product-btn">{saving ? "Saving..." : (form.id ? "Save Changes" : "Create Product")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
