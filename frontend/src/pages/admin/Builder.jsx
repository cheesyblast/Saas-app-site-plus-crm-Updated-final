import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Eye, EyeOff, ArrowUp, ArrowDown, Pencil, Trash2, Plus, ExternalLink, Save, Palette, FileText, Layout as LayoutIcon, Home as HomeIcon, Truck, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import SectionEditor from "./builder/SectionEditor";

const SECTION_TYPES = [
  { value: "hero", label: "Hero" },
  { value: "featured", label: "Featured Products" },
  { value: "shop", label: "Shop / Products Showcase" },
  { value: "brand", label: "Brand Story (with stats)" },
  { value: "story", label: "Our Story" },
  { value: "reviews", label: "Reviews / Testimonials" },
  { value: "custom", label: "Custom Block" },
];
const TYPE_LABEL = Object.fromEntries(SECTION_TYPES.map((t) => [t.value, t.label]));

const SYSTEM_PAGES = [
  { slug: "home", title: "Home Page", icon: HomeIcon },
  { slug: "_header", title: "Site Header", icon: LayoutIcon, kind: "header" },
  { slug: "_footer", title: "Site Footer", icon: LayoutIcon, kind: "footer" },
  { slug: "_product_page", title: "Product Page Layout", icon: FileText, hint: "Sections shown below product details" },
  { slug: "shipping-policy", title: "Shipping Policy", icon: Truck },
  { slug: "returns-policy", title: "Returns & Refunds", icon: RotateCcw },
];

function emptyConfig(type) {
  switch (type) {
    case "hero": return { badge_text: "NEW BADGE", headline_line1: "Bold headline.", headline_line2: "Sharp accent.", headline_line2_accent: true, headline_size: "lg", subheading: "", cta_primary_label: "Shop Now", cta_primary_link: "/shop", cta_secondary_label: "", cta_secondary_link: "/shop", image_url: "", image_id: null, image_position: "center", overlay_opacity: 60, height: "tall", video_url: "", video_id: null };
    case "featured": return { eyebrow: "Featured", heading: "Latest", max_items: 8, category_slug: null, show_view_all_button: true, view_all_label: "Shop All", view_all_link: "/shop" };
    case "shop": return { eyebrow: "Shop", heading: "Our Collection", subheading: "", scope: "all", category_slug: null, max_items: 12, columns: 3 };
    case "brand": return { eyebrow: "The Brand", headline: "Built right.", paragraph: "", stats: [{ value: "100%", label: "Quality" }], image_url: "", image_id: null, image_side: "right", tagline: "" };
    case "story": return { eyebrow: "Our Story", headline: "How it started.", paragraph: "", image_url: "", image_id: null, image_side: "left" };
    case "reviews": return { eyebrow: "Praise", heading: "Loved by customers", layout: "grid", direction: "ltr", speed: "medium", autoplay: true, items: [{ name: "Customer", role: "Verified Buyer", rating: 5, text: "Amazing!" }] };
    case "custom": return { block_type: "heading_text", eyebrow: "", heading: "Your block", text: "", alignment: "center", padding: "md", max_width: "narrow", image_url: "", image_id: null };
    default: return {};
  }
}

export default function Builder() {
  const [pages, setPages] = useState([]);
  const [currentPage, setCurrentPage] = useState("home");
  const [sections, setSections] = useState([]);
  const [theme, setTheme] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editingDraft, setEditingDraft] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("custom");
  const [themeOpen, setThemeOpen] = useState(false);
  const [themeDraft, setThemeDraft] = useState({});
  const [newPageOpen, setNewPageOpen] = useState(false);
  const [newPage, setNewPage] = useState({ title: "", show_in_header_menu: false });

  const sysMeta = SYSTEM_PAGES.find((p) => p.slug === currentPage);
  const isHeader = sysMeta?.kind === "header";
  const isFooter = sysMeta?.kind === "footer";
  const isLayoutPage = isHeader || isFooter;

  const loadPages = async () => {
    const { data } = await api.get("/admin/pages");
    setPages(data);
  };

  const loadSections = async () => {
    setLoading(true);
    try {
      const [{ data: pg }, { data: th }] = await Promise.all([
        api.get(`/admin/page/${currentPage}`), api.get("/theme"),
      ]);
      setSections(pg.sections);
      setTheme(th);
    } catch { toast.error("Failed to load"); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadPages(); }, []);
  useEffect(() => { loadSections(); }, [currentPage]);

  const saveSection = async () => {
    if (!editingDraft) return;
    try {
      await api.put(`/admin/page/sections/${editingDraft.id}`, {
        config: editingDraft.config, visible: editingDraft.visible,
      });
      toast.success("Saved"); setEditing(null); setEditingDraft(null); loadSections();
    } catch { toast.error("Save failed"); }
  };

  const toggleVisible = async (s) => { await api.put(`/admin/page/sections/${s.id}`, { visible: !s.visible }); loadSections(); };

  const move = async (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= sections.length) return;
    const ids = sections.map((s) => s.id);
    [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
    await api.post(`/admin/page/${currentPage}/reorder`, { ids });
    loadSections();
  };

  const del = async (s) => {
    if (!window.confirm(`Delete this section?`)) return;
    await api.delete(`/admin/page/sections/${s.id}`); toast.success("Deleted"); loadSections();
  };

  const addSection = async () => {
    await api.post(`/admin/page/${currentPage}/sections`, { section_type: newType, config: emptyConfig(newType), visible: true });
    toast.success("Added"); setAdding(false); loadSections();
  };

  const saveTheme = async () => {
    await api.put("/admin/theme", { config: themeDraft });
    setTheme(themeDraft); toast.success("Theme saved"); setThemeOpen(false);
  };
  const openTheme = () => { setThemeDraft({ ...theme, marquee_phrases: [...(theme.marquee_phrases || [])] }); setThemeOpen(true); };

  const createPage = async () => {
    if (!newPage.title) return toast.error("Title required");
    try {
      const { data } = await api.post("/admin/pages", newPage);
      setNewPageOpen(false); setNewPage({ title: "", show_in_header_menu: false });
      await loadPages(); setCurrentPage(data.slug);
      toast.success("Page created");
    } catch (e) { toast.error("Failed"); }
  };

  const deletePage = async (p) => {
    if (!window.confirm(`Delete "${p.title}" and all its sections?`)) return;
    try { await api.delete(`/admin/pages/${p.id}`); await loadPages(); setCurrentPage("home"); }
    catch (e) { toast.error("Failed"); }
  };

  const customPages = pages.filter((p) => !p.is_system);

  return (
    <div className="grid lg:grid-cols-[280px_1fr] gap-6 text-white" data-testid="admin-builder">
      {/* Page selector sidebar */}
      <aside className="lg:sticky lg:top-6 self-start space-y-4">
        <div>
          <div className="text-[10px] font-heading uppercase tracking-[0.3em] text-zinc-500 mb-2 px-1">Front Page</div>
          {SYSTEM_PAGES.filter(p=>p.slug==="home").map(p => (
            <PageButton key={p.slug} item={p} active={currentPage===p.slug} onClick={()=>setCurrentPage(p.slug)}/>
          ))}
        </div>
        <div>
          <div className="text-[10px] font-heading uppercase tracking-[0.3em] text-zinc-500 mb-2 px-1">Global Layout</div>
          {SYSTEM_PAGES.filter(p=>p.slug==="_header"||p.slug==="_footer"||p.slug==="_product_page").map(p => (
            <PageButton key={p.slug} item={p} active={currentPage===p.slug} onClick={()=>setCurrentPage(p.slug)}/>
          ))}
        </div>
        <div>
          <div className="text-[10px] font-heading uppercase tracking-[0.3em] text-zinc-500 mb-2 px-1">Policies</div>
          {SYSTEM_PAGES.filter(p=>p.slug==="shipping-policy"||p.slug==="returns-policy").map(p => (
            <PageButton key={p.slug} item={p} active={currentPage===p.slug} onClick={()=>setCurrentPage(p.slug)}/>
          ))}
        </div>
        <div>
          <div className="text-[10px] font-heading uppercase tracking-[0.3em] text-zinc-500 mb-2 px-1 flex items-center justify-between">
            <span>Custom Pages</span>
            <button onClick={()=>setNewPageOpen(true)} data-testid="new-page-btn" className="text-[var(--theme-primary,#FF3B30)] hover:opacity-80"><Plus className="h-3 w-3"/></button>
          </div>
          {customPages.length === 0 && <div className="text-xs text-zinc-600 px-1 py-2">No custom pages.</div>}
          {customPages.map(p => (
            <div key={p.id} className={`flex items-center group border-l-2 ${currentPage===p.slug?"border-[var(--theme-primary,#FF3B30)]":"border-transparent"}`}>
              <button onClick={()=>setCurrentPage(p.slug)} className={`flex-1 text-left px-3 py-2 text-sm hover:bg-zinc-900/40 ${currentPage===p.slug?"bg-zinc-900/60 text-white":"text-zinc-400"}`}>
                <div className="font-heading uppercase tracking-widest text-xs">{p.title}</div>
                <div className="text-[10px] text-zinc-600 font-mono mt-0.5">/page/{p.slug}</div>
              </button>
              <button onClick={()=>deletePage(p)} className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-red-400 p-1"><Trash2 className="h-3 w-3"/></button>
            </div>
          ))}
        </div>
      </aside>

      <div className="space-y-6 min-w-0">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">{sysMeta?.title || pages.find(p=>p.slug===currentPage)?.title || "Page"}</h1>
            {sysMeta?.hint && <p className="text-xs text-zinc-500 mt-1">{sysMeta.hint}</p>}
            <p className="text-xs text-zinc-600 mt-1 font-mono">slug: {currentPage}</p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={openTheme} className="bg-zinc-900 hover:bg-zinc-800 rounded-none uppercase tracking-widest font-bold border border-zinc-800"><Palette className="h-4 w-4 mr-2" /> Theme</Button>
            <a href={currentPage === "home" ? "/" : currentPage.startsWith("_") ? "/" : `/page/${currentPage}`} target="_blank" rel="noreferrer">
              <Button className="bg-zinc-900 hover:bg-zinc-800 rounded-none uppercase tracking-widest font-bold border border-zinc-800"><ExternalLink className="h-4 w-4 mr-2" /> Preview</Button>
            </a>
            {!isLayoutPage && <Button onClick={() => setAdding(true)} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold" data-testid="add-section-btn"><Plus className="h-4 w-4 mr-2" /> Add Section</Button>}
          </div>
        </div>

        {loading && <div className="text-zinc-500 text-sm">Loading...</div>}

        {!loading && isLayoutPage && sections[0] && (
          <LayoutEditor section={sections[0]} kind={sysMeta.kind} reload={loadSections}/>
        )}

        {!loading && !isLayoutPage && (
          <div className="border border-zinc-900 divide-y divide-zinc-900">
            {sections.length === 0 && <div className="p-12 text-center text-zinc-500">No sections yet — add one to get started.</div>}
            {sections.map((s, i) => (
              <div key={s.id} className={`flex items-center gap-4 p-4 ${!s.visible ? "opacity-50" : ""}`} data-testid={`section-row-${s.section_type}`}>
                <div className="flex flex-col gap-1">
                  <button onClick={() => move(i, -1)} disabled={i === 0} className="text-zinc-500 hover:text-white disabled:opacity-30"><ArrowUp className="h-3 w-3" /></button>
                  <button onClick={() => move(i, 1)} disabled={i === sections.length - 1} className="text-zinc-500 hover:text-white disabled:opacity-30"><ArrowDown className="h-3 w-3" /></button>
                </div>
                <div className="font-mono text-xs text-zinc-600 w-8 text-center">{String(i + 1).padStart(2, "0")}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-heading uppercase tracking-widest text-sm">{TYPE_LABEL[s.section_type] || s.section_type}{s.section_type === "custom" && s.config?.block_type && (<span className="ml-2 text-[10px] text-zinc-500">· {s.config.block_type.replace("_", " + ")}</span>)}</div>
                  <div className="text-xs text-zinc-500 truncate mt-1">{s.config?.headline || s.config?.heading || s.config?.headline_line1 || "—"}</div>
                </div>
                <button onClick={() => toggleVisible(s)} className="text-zinc-400 hover:text-white p-2">{s.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}</button>
                <button onClick={() => { setEditing(s); setEditingDraft(JSON.parse(JSON.stringify(s))); }} className="text-zinc-400 hover:text-[var(--theme-primary,#FF3B30)] p-2"><Pencil className="h-4 w-4" /></button>
                <button onClick={() => del(s)} className="text-zinc-400 hover:text-red-400 p-2"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setEditingDraft(null); } }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-3xl max-h-[90vh] overflow-y-auto rounded-none">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">Edit · {editing && (TYPE_LABEL[editing.section_type] || editing.section_type)}</DialogTitle></DialogHeader>
          {editingDraft && <SectionEditor section={editingDraft} onChange={setEditingDraft} />}
          <DialogFooter><Button onClick={() => { setEditing(null); setEditingDraft(null); }} className="bg-transparent border border-zinc-700 rounded-none uppercase tracking-widest">Cancel</Button><Button onClick={saveSection} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold" data-testid="section-save-btn"><Save className="h-4 w-4 mr-2" /> Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add dialog */}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">Add Section</DialogTitle></DialogHeader>
          <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Type</Label>
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>{SECTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <DialogFooter><Button onClick={addSection} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold" data-testid="confirm-add-section">Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New custom page */}
      <Dialog open={newPageOpen} onOpenChange={setNewPageOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">New Custom Page</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Title</Label><Input data-testid="new-page-title" value={newPage.title} onChange={(e)=>setNewPage(p=>({...p,title:e.target.value}))} className="bg-zinc-900 border-zinc-800 rounded-none mt-1"/></div>
            <div className="flex items-center justify-between"><Label className="text-xs uppercase tracking-widest">Show in header menu</Label><Switch checked={newPage.show_in_header_menu} onCheckedChange={(v)=>setNewPage(p=>({...p,show_in_header_menu:v}))}/></div>
          </div>
          <DialogFooter><Button onClick={createPage} className="bg-[var(--theme-primary,#FF3B30)] rounded-none uppercase tracking-widest font-bold" data-testid="create-page-btn">Create</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Theme dialog */}
      <Dialog open={themeOpen} onOpenChange={setThemeOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-xl max-h-[90vh] overflow-y-auto rounded-none">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">Global Theme</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500">Colors</div>
            <ColorField label="Primary / Accent" v={themeDraft.primary_color || "#FF3B30"} onChange={(v)=>setThemeDraft({...themeDraft, primary_color:v})}/>
            <ColorField label="Primary Hover" v={themeDraft.primary_color_hover || "#D92D23"} onChange={(v)=>setThemeDraft({...themeDraft, primary_color_hover:v})}/>
            <ColorField label="Page Background" v={themeDraft.background_color || "#09090B"} onChange={(v)=>setThemeDraft({...themeDraft, background_color:v})}/>
            <ColorField label="Body Text Color" v={themeDraft.text_color || "#FFFFFF"} onChange={(v)=>setThemeDraft({...themeDraft, text_color:v})}/>
            <ColorField label="Muted Text Color" v={themeDraft.text_muted_color || "#A1A1AA"} onChange={(v)=>setThemeDraft({...themeDraft, text_muted_color:v})}/>

            <div className="text-[10px] uppercase tracking-widest text-zinc-500 pt-3">Typography</div>
            <FontField label="Eyebrow / Small Caps Font" v={themeDraft.font_eyebrow} onChange={(v)=>setThemeDraft({...themeDraft, font_eyebrow:v})}/>
            <FontField label="Heading Font" v={themeDraft.font_heading} onChange={(v)=>setThemeDraft({...themeDraft, font_heading:v})}/>
            <FontField label="Body / Paragraph Font" v={themeDraft.font_body} onChange={(v)=>setThemeDraft({...themeDraft, font_body:v})}/>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Heading Scale ({themeDraft.heading_scale ?? 1})</Label>
                <input type="range" min={0.6} max={1.4} step={0.05} value={themeDraft.heading_scale ?? 1} onChange={(e)=>setThemeDraft({...themeDraft, heading_scale: parseFloat(e.target.value)})} className="w-full"/>
              </div>
              <div>
                <Label className="text-xs uppercase tracking-widest text-zinc-400">Body line-height ({themeDraft.line_height ?? 1.5})</Label>
                <input type="range" min={1.2} max={2} step={0.05} value={themeDraft.line_height ?? 1.5} onChange={(e)=>setThemeDraft({...themeDraft, line_height: parseFloat(e.target.value)})} className="w-full"/>
              </div>
            </div>

            <div className="text-[10px] uppercase tracking-widest text-zinc-500 pt-3">Marquee</div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Phrases (one per line)</Label>
              <textarea value={(themeDraft.marquee_phrases || []).join("\n")} onChange={(e) => setThemeDraft({ ...themeDraft, marquee_phrases: e.target.value.split("\n").map(s=>s.trim()).filter(Boolean) })} className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-none p-2 text-sm" rows={3}/>
            </div>
            <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Separator</Label><Input value={themeDraft.marquee_separator || "//"} onChange={(e) => setThemeDraft({ ...themeDraft, marquee_separator: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1 font-mono" /></div>

            <div className="text-[10px] uppercase tracking-widest text-zinc-500 pt-3">Apply Scope</div>
            <label className="flex items-start gap-3 p-3 bg-zinc-900 border border-zinc-800 cursor-pointer">
              <input
                type="checkbox"
                checked={!!themeDraft.apply_to_admin}
                onChange={(e) => setThemeDraft({ ...themeDraft, apply_to_admin: e.target.checked })}
                className="mt-1 accent-[var(--theme-primary,#FF3B30)]"
                data-testid="theme-apply-to-admin-toggle"
              />
              <div className="flex-1">
                <div className="text-sm font-medium">Also apply to Admin / CRM panel</div>
                <div className="text-xs text-zinc-500 mt-0.5">By default the admin stays on the dark control-room palette. Enable this to recolour the admin shell using your theme so the brand experience is consistent end-to-end.</div>
              </div>
            </label>
          </div>
          <DialogFooter><Button onClick={saveTheme} className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold" data-testid="save-theme-btn"><Save className="h-4 w-4 mr-2" /> Save Theme</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PageButton({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button onClick={onClick} data-testid={`builder-page-${item.slug}`} className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors border-l-2 ${active ? "border-[var(--theme-primary,#FF3B30)] bg-zinc-900/60 text-white" : "border-transparent text-zinc-400 hover:bg-zinc-900/40"}`}>
      <Icon className="h-3.5 w-3.5"/>
      <span className="font-heading uppercase tracking-widest text-xs">{item.title}</span>
    </button>
  );
}

function ColorField({ label, v, onChange }) {
  return (
    <div>
      <Label className="text-xs uppercase tracking-widest text-zinc-400">{label}</Label>
      <div className="flex gap-2 mt-1"><input type="color" value={v} onChange={(e)=>onChange(e.target.value)} className="h-10 w-14 bg-zinc-900 border border-zinc-800 cursor-pointer"/><Input value={v} onChange={(e)=>onChange(e.target.value)} className="bg-zinc-900 border-zinc-800 rounded-none font-mono"/></div>
    </div>
  );
}

function FontField({ label, v, onChange }) {
  const FONT_CHOICES = [
    { value: "'Archivo Black', sans-serif", label: "Archivo Black (Bold Display)" },
    { value: "'Anton', sans-serif", label: "Anton (Condensed)" },
    { value: "'Bebas Neue', sans-serif", label: "Bebas Neue (Sans Tall)" },
    { value: "'Inter', sans-serif", label: "Inter (Modern)" },
    { value: "'Space Grotesk', sans-serif", label: "Space Grotesk (Geometric)" },
    { value: "'Playfair Display', serif", label: "Playfair Display (Elegant Serif)" },
    { value: "'Lora', serif", label: "Lora (Modern Serif)" },
    { value: "'DM Sans', sans-serif", label: "DM Sans (Clean)" },
    { value: "'Poppins', sans-serif", label: "Poppins (Friendly)" },
    { value: "'Montserrat', sans-serif", label: "Montserrat (Versatile)" },
    { value: "'Oswald', sans-serif", label: "Oswald (Industrial)" },
    { value: "'Raleway', sans-serif", label: "Raleway (Light)" },
  ];
  return (
    <div>
      <Label className="text-xs uppercase tracking-widest text-zinc-400">{label}</Label>
      <Select value={v || FONT_CHOICES[0].value} onValueChange={onChange}>
        <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue/></SelectTrigger>
        <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
          {FONT_CHOICES.map(f => <SelectItem key={f.value} value={f.value}><span style={{fontFamily: f.value}}>{f.label}</span></SelectItem>)}
        </SelectContent>
      </Select>
      {v && <div className="mt-2 text-sm text-zinc-300" style={{fontFamily: v}}>The quick brown fox jumps over the lazy dog</div>}
    </div>
  );
}

// ---- Header / Footer config editor (single config_block section) ----
function LayoutEditor({ section, kind, reload }) {
  const [draft, setDraft] = useState(section.config || {});
  const [busy, setBusy] = useState(false);
  useEffect(() => { setDraft(section.config || {}); }, [section.id]);

  const save = async () => {
    setBusy(true);
    try { await api.put(`/admin/page/sections/${section.id}`, { config: draft }); toast.success("Saved"); reload(); }
    catch { toast.error("Save failed"); }
    finally { setBusy(false); }
  };

  if (kind === "header") {
    const menu = draft.menu || [];
    const setMenu = (m) => setDraft(d => ({ ...d, menu: m }));
    return (
      <div className="border border-zinc-800 bg-zinc-950 p-6 space-y-6">
        <h2 className="font-heading uppercase tracking-widest text-sm">Global Header Configuration</h2>
        <div>
          <Label className="text-xs uppercase tracking-widest text-zinc-400 mb-2 block">Menu Items</Label>
          <div className="space-y-2">
            {menu.map((m, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-center">
                <Input placeholder="Label" value={m.label||""} onChange={(e)=>{const c=[...menu]; c[i]={...c[i], label:e.target.value}; setMenu(c);}} className="col-span-4 bg-zinc-900 border-zinc-800 rounded-none"/>
                <Input placeholder="URL (eg /shop or /page/about)" value={m.url||""} onChange={(e)=>{const c=[...menu]; c[i]={...c[i], url:e.target.value}; setMenu(c);}} className="col-span-7 bg-zinc-900 border-zinc-800 rounded-none"/>
                <button onClick={()=>setMenu(menu.filter((_,j)=>j!==i))} className="text-zinc-500 hover:text-red-400"><X className="h-4 w-4"/></button>
              </div>
            ))}
            <Button data-testid="add-menu-item" type="button" onClick={()=>setMenu([...menu, { label:"New Link", url:"/" }])} className="bg-zinc-900 hover:bg-zinc-800 rounded-none uppercase tracking-widest text-xs gap-2"><Plus className="h-3 w-3"/>Add Item</Button>
          </div>
        </div>
        <div>
          <Label className="text-xs uppercase tracking-widest text-zinc-400">Style</Label>
          <Select value={draft.style||"minimal"} onValueChange={(v)=>setDraft(d=>({...d, style:v}))}>
            <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue/></SelectTrigger>
            <SelectContent><SelectItem value="minimal">Minimal</SelectItem><SelectItem value="bold">Bold</SelectItem><SelectItem value="classic">Classic</SelectItem></SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center justify-between"><Label className="text-xs uppercase tracking-widest text-zinc-400">Show search</Label><Switch checked={!!draft.show_search} onCheckedChange={(v)=>setDraft(d=>({...d, show_search:v}))}/></div>
          <div className="flex items-center justify-between"><Label className="text-xs uppercase tracking-widest text-zinc-400">Show cart</Label><Switch checked={draft.show_cart!==false} onCheckedChange={(v)=>setDraft(d=>({...d, show_cart:v}))}/></div>
          <div className="flex items-center justify-between"><Label className="text-xs uppercase tracking-widest text-zinc-400">Sticky header</Label><Switch checked={draft.sticky!==false} onCheckedChange={(v)=>setDraft(d=>({...d, sticky:v}))}/></div>
          <div className="flex items-center justify-between"><Label className="text-xs uppercase tracking-widest text-zinc-400">Show login</Label><Switch checked={draft.show_login!==false} onCheckedChange={(v)=>setDraft(d=>({...d, show_login:v}))}/></div>
        </div>
        <Button onClick={save} disabled={busy} data-testid="save-header-btn" className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold gap-2"><Save className="h-3 w-3"/>Save Header</Button>
      </div>
    );
  }

  // Footer
  const cols = draft.columns || [];
  const setCols = (c) => setDraft(d => ({ ...d, columns: c }));
  return (
    <div className="border border-zinc-800 bg-zinc-950 p-6 space-y-6">
      <h2 className="font-heading uppercase tracking-widest text-sm">Global Footer Configuration</h2>
      <div className="grid sm:grid-cols-2 gap-4">
        <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Tagline</Label><Input value={draft.tagline||""} onChange={(e)=>setDraft(d=>({...d, tagline:e.target.value}))} className="bg-zinc-900 border-zinc-800 rounded-none mt-1"/></div>
        <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Support email</Label><Input value={draft.support_email||""} onChange={(e)=>setDraft(d=>({...d, support_email:e.target.value}))} className="bg-zinc-900 border-zinc-800 rounded-none mt-1"/></div>
        <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Support phone</Label><Input value={draft.support_phone||""} onChange={(e)=>setDraft(d=>({...d, support_phone:e.target.value}))} className="bg-zinc-900 border-zinc-800 rounded-none mt-1"/></div>
        <div><Label className="text-xs uppercase tracking-widest text-zinc-400">Copyright text</Label><Input value={draft.copyright||""} onChange={(e)=>setDraft(d=>({...d, copyright:e.target.value}))} className="bg-zinc-900 border-zinc-800 rounded-none mt-1"/></div>
      </div>
      <div className="flex items-center justify-between"><Label className="text-xs uppercase tracking-widest text-zinc-400">Show marquee strip</Label><Switch checked={draft.show_marquee!==false} onCheckedChange={(v)=>setDraft(d=>({...d, show_marquee:v}))}/></div>
      <div className="space-y-3">
        <Label className="text-xs uppercase tracking-widest text-zinc-400">Footer Columns</Label>
        {cols.map((c, ci) => (
          <div key={ci} className="border border-zinc-800 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <Input placeholder="Column title" value={c.title||""} onChange={(e)=>{const n=[...cols]; n[ci]={...n[ci], title:e.target.value}; setCols(n);}} className="bg-zinc-900 border-zinc-800 rounded-none"/>
              <button onClick={()=>setCols(cols.filter((_,i)=>i!==ci))} className="text-zinc-500 hover:text-red-400"><X className="h-4 w-4"/></button>
            </div>
            {(c.links || []).map((l, li) => (
              <div key={li} className="grid grid-cols-12 gap-2 items-center">
                <Input placeholder="Label" value={l.label||""} onChange={(e)=>{const n=[...cols]; n[ci].links=[...(n[ci].links||[])]; n[ci].links[li]={...n[ci].links[li], label:e.target.value}; setCols(n);}} className="col-span-5 bg-zinc-900 border-zinc-800 rounded-none h-9 text-xs"/>
                <Input placeholder="URL" value={l.url||""} onChange={(e)=>{const n=[...cols]; n[ci].links=[...(n[ci].links||[])]; n[ci].links[li]={...n[ci].links[li], url:e.target.value}; setCols(n);}} className="col-span-6 bg-zinc-900 border-zinc-800 rounded-none h-9 text-xs"/>
                <button onClick={()=>{const n=[...cols]; n[ci].links=(n[ci].links||[]).filter((_,i)=>i!==li); setCols(n);}} className="text-zinc-500 hover:text-red-400"><X className="h-3 w-3"/></button>
              </div>
            ))}
            <Button type="button" onClick={()=>{const n=[...cols]; n[ci].links=[...(n[ci].links||[]), {label:"Link", url:"/"}]; setCols(n);}} className="bg-zinc-900 hover:bg-zinc-800 rounded-none uppercase tracking-widest text-[10px] h-7 gap-2"><Plus className="h-3 w-3"/>Add Link</Button>
          </div>
        ))}
        <Button type="button" onClick={()=>setCols([...cols, { title:"New Column", links:[] }])} className="bg-zinc-900 hover:bg-zinc-800 rounded-none uppercase tracking-widest text-xs gap-2"><Plus className="h-3 w-3"/>Add Column</Button>
      </div>
      <Button onClick={save} disabled={busy} data-testid="save-footer-btn" className="bg-[var(--theme-primary,#FF3B30)] hover:bg-[var(--theme-primary-hover,#D92D23)] rounded-none uppercase tracking-widest font-bold gap-2"><Save className="h-3 w-3"/>Save Footer</Button>
    </div>
  );
}
