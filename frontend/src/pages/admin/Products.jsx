import React, { useEffect, useState } from "react";
import api, { imgSrc, formatPrice } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Sparkles, X, ImagePlus } from "lucide-react";
import { toast } from "sonner";

const empty = {
  id: null,
  name: "",
  description: "",
  category_id: null,
  base_price: 29.99,
  compare_price: null,
  sku: "",
  status: "active",
  featured: false,
  variants: [],
};

export default function Products() {
  const [products, setProducts] = useState([]);
  const [cats, setCats] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [imgOpen, setImgOpen] = useState(null); // product id
  const [aiPrompt, setAiPrompt] = useState("");
  const [gen, setGen] = useState(false);

  const load = async () => {
    const { data } = await api.get("/admin/products");
    setProducts(data);
  };
  useEffect(() => {
    load();
    api.get("/categories").then(({ data }) => setCats(data));
  }, []);

  const edit = (p) => {
    setForm({
      ...p,
      category_id: p.category?.id || p.category_id || null,
      variants: p.variants || [],
    });
    setOpen(true);
  };
  const create = () => {
    setForm({ ...empty, variants: [{ size: "M", color: "Black", color_hex: "#111", price_override: null, sku: "", stock: 10 }] });
    setOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        category_id: form.category_id || null,
        base_price: parseFloat(form.base_price) || 0,
        compare_price: form.compare_price ? parseFloat(form.compare_price) : null,
        sku: form.sku || null,
        status: form.status,
        featured: !!form.featured,
        variants: form.variants.map((v) => ({
          id: v.id || null,
          size: v.size || null,
          color: v.color || null,
          color_hex: v.color_hex || null,
          price_override: v.price_override ? parseFloat(v.price_override) : null,
          sku: v.sku || null,
          stock: parseInt(v.stock) || 0,
        })),
      };
      if (form.id) await api.put(`/admin/products/${form.id}`, payload);
      else await api.post("/admin/products", payload);
      toast.success("Saved");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id) => {
    if (!confirm("Delete this product?")) return;
    await api.delete(`/admin/products/${id}`);
    toast.success("Deleted");
    load();
  };

  const addVariantRow = () => {
    setForm((f) => ({
      ...f,
      variants: [...f.variants, { size: "", color: "", color_hex: "#000", price_override: null, sku: "", stock: 0 }],
    }));
  };

  const setVar = (idx, key, val) => {
    setForm((f) => {
      const v = [...f.variants];
      v[idx] = { ...v[idx], [key]: val };
      return { ...f, variants: v };
    });
  };
  const delVar = (idx) => {
    setForm((f) => ({ ...f, variants: f.variants.filter((_, i) => i !== idx) }));
  };

  const genImage = async (pid) => {
    setGen(true);
    try {
      await api.post(`/admin/products/${pid}/images/ai`, {
        prompt: aiPrompt || "plain black cotton oversized tee, streetwear aesthetic",
        is_primary: true,
      });
      toast.success("Image generated");
      setImgOpen(null);
      setAiPrompt("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Gen failed");
    } finally {
      setGen(false);
    }
  };

  const uploadImage = async (pid, file) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const b64 = reader.result.toString().split(",")[1];
      try {
        await api.post(`/admin/products/${pid}/images`, {
          data_base64: b64,
          mime_type: file.type || "image/png",
          is_primary: true,
        });
        toast.success("Image uploaded");
        load();
      } catch (e) {
        toast.error("Upload failed");
      }
    };
    reader.readAsDataURL(file);
  };

  const delImage = async (iid) => {
    await api.delete(`/admin/products/images/${iid}`);
    load();
  };

  return (
    <div className="space-y-6" data-testid="admin-products">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Products</h1>
          <p className="text-sm text-zinc-500 mt-1">{products.length} items</p>
        </div>
        <Button onClick={create} data-testid="new-product-btn" className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold">
          <Plus className="h-4 w-4 mr-2" /> New Product
        </Button>
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
                <td className="p-3">
                  <div className="h-12 w-10 bg-zinc-900 border border-zinc-800 overflow-hidden">
                    {p.images?.[0] && <img src={imgSrc(p.images[0])} alt="" className="w-full h-full object-cover" />}
                  </div>
                </td>
                <td className="p-3 font-semibold">{p.name}</td>
                <td className="p-3 text-zinc-400">{p.category?.name || "—"}</td>
                <td className="p-3 font-mono">{formatPrice(p.base_price)}</td>
                <td className="p-3 text-zinc-400">{p.variants?.length || 0}</td>
                <td className="p-3">
                  <span className={`text-[10px] uppercase tracking-widest px-2 py-1 border ${p.status === "active" ? "border-green-700 text-green-400" : "border-zinc-700 text-zinc-500"}`}>{p.status}</span>
                  {p.featured && <span className="ml-2 text-[10px] uppercase tracking-widest px-2 py-1 border border-[#FF3B30] text-[#FF3B30]">Featured</span>}
                </td>
                <td className="p-3 text-right whitespace-nowrap">
                  <button onClick={() => setImgOpen(p.id)} className="text-zinc-400 hover:text-[#FF3B30] p-1" title="Images" data-testid={`product-images-${p.id}`}>
                    <ImagePlus className="h-4 w-4" />
                  </button>
                  <button onClick={() => edit(p)} className="text-zinc-400 hover:text-white p-1" data-testid={`product-edit-${p.id}`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button onClick={() => del(p.id)} className="text-zinc-400 hover:text-red-400 p-1" data-testid={`product-delete-${p.id}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={7} className="p-12 text-center text-zinc-500">No products yet. Create one to get started.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-3xl max-h-[90vh] overflow-y-auto rounded-none">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-widest">{form.id ? "Edit Product" : "New Product"}</DialogTitle>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Name</Label>
              <Input data-testid="product-form-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Description</Label>
              <Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Category</Label>
              <Select value={form.category_id || "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? null : v })}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectItem value="none">— None —</SelectItem>
                  {cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">SKU</Label>
              <Input value={form.sku || ""} onChange={(e) => setForm({ ...form, sku: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Base Price</Label>
              <Input type="number" step="0.01" value={form.base_price} onChange={(e) => setForm({ ...form, base_price: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Compare Price</Label>
              <Input type="number" step="0.01" value={form.compare_price || ""} onChange={(e) => setForm({ ...form, compare_price: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue /></SelectTrigger>
                <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="archived">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end gap-3">
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400 block mb-2">Featured</Label>
                <Switch checked={!!form.featured} onCheckedChange={(v) => setForm({ ...form, featured: v })} data-testid="product-form-featured" />
              </div>
            </div>

            <div className="sm:col-span-2 border border-zinc-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Variants</Label>
                <Button type="button" onClick={addVariantRow} className="bg-zinc-900 hover:bg-zinc-800 text-xs rounded-none uppercase tracking-widest" data-testid="add-variant-btn">
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              <div className="space-y-2">
                {form.variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-center">
                    <Input placeholder="Size" value={v.size || ""} onChange={(e) => setVar(i, "size", e.target.value)} className="col-span-2 bg-zinc-900 border-zinc-800 rounded-none" />
                    <Input placeholder="Color" value={v.color || ""} onChange={(e) => setVar(i, "color", e.target.value)} className="col-span-2 bg-zinc-900 border-zinc-800 rounded-none" />
                    <Input placeholder="#hex" value={v.color_hex || ""} onChange={(e) => setVar(i, "color_hex", e.target.value)} className="col-span-2 bg-zinc-900 border-zinc-800 rounded-none" />
                    <Input placeholder="Price" type="number" step="0.01" value={v.price_override || ""} onChange={(e) => setVar(i, "price_override", e.target.value)} className="col-span-2 bg-zinc-900 border-zinc-800 rounded-none" />
                    <Input placeholder="SKU" value={v.sku || ""} onChange={(e) => setVar(i, "sku", e.target.value)} className="col-span-2 bg-zinc-900 border-zinc-800 rounded-none" />
                    <Input placeholder="Stock" type="number" value={v.stock || 0} onChange={(e) => setVar(i, "stock", e.target.value)} className="col-span-1 bg-zinc-900 border-zinc-800 rounded-none" />
                    <button onClick={() => delVar(i)} className="col-span-1 text-zinc-400 hover:text-red-400">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => setOpen(false)} className="bg-transparent border border-zinc-700 rounded-none uppercase tracking-widest">Cancel</Button>
            <Button onClick={save} disabled={saving} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold" data-testid="save-product-btn">
              {saving ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Image manager dialog */}
      <Dialog open={!!imgOpen} onOpenChange={() => setImgOpen(null)}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-2xl rounded-none">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-widest">Product Images</DialogTitle>
          </DialogHeader>
          {(() => {
            const p = products.find((x) => x.id === imgOpen);
            if (!p) return null;
            return (
              <div className="space-y-4">
                <div className="grid grid-cols-4 gap-2">
                  {(p.images || []).map((im) => (
                    <div key={im.id} className="relative group aspect-square border border-zinc-800">
                      <img src={imgSrc(im)} alt="" className="w-full h-full object-cover" />
                      {im.is_primary && <span className="absolute top-1 left-1 bg-[#FF3B30] text-white text-[9px] px-1">MAIN</span>}
                      <button onClick={() => delImage(im.id)} className="absolute top-1 right-1 bg-black/80 border border-zinc-700 hover:border-red-500 p-1">
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="border-t border-zinc-800 pt-4 space-y-3">
                  <div>
                    <Label className="text-xs uppercase tracking-widest text-zinc-400">Upload File</Label>
                    <Input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && uploadImage(p.id, e.target.files[0])} className="bg-zinc-900 border-zinc-800 rounded-none mt-1" />
                  </div>
                  <div className="border-t border-zinc-800 pt-3">
                    <Label className="text-xs uppercase tracking-widest text-zinc-400">Generate with AI</Label>
                    <div className="flex gap-2 mt-1">
                      <Input placeholder="e.g. black oversized cotton tee with red graffiti print" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none" />
                      <Button onClick={() => genImage(p.id)} disabled={gen} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold" data-testid="ai-gen-btn">
                        <Sparkles className="h-3 w-3 mr-1" /> {gen ? "Generating..." : "Generate"}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
