import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Eye, EyeOff, ArrowUp, ArrowDown, Pencil, Trash2, Plus, ExternalLink, Save, Palette } from "lucide-react";
import { toast } from "sonner";
import SectionEditor from "./builder/SectionEditor";

const SECTION_TYPES = [
  { value: "hero", label: "Hero" },
  { value: "featured", label: "Featured Products" },
  { value: "brand", label: "Brand Story (with stats)" },
  { value: "story", label: "Our Story" },
  { value: "reviews", label: "Reviews / Testimonials" },
  { value: "custom", label: "Custom Block" },
];

const TYPE_LABEL = Object.fromEntries(SECTION_TYPES.map((t) => [t.value, t.label]));

function emptyConfig(type) {
  switch (type) {
    case "hero":
      return { badge_text: "NEW BADGE", headline_line1: "Bold headline.", headline_line2: "Sharp accent.", headline_line2_accent: true, headline_size: "lg", subheading: "Tell them who you are.", cta_primary_label: "Shop Now", cta_primary_link: "/shop", cta_secondary_label: "Learn More", cta_secondary_link: "/shop", image_url: "", image_id: null, image_position: "center", overlay_opacity: 60, height: "tall" };
    case "featured":
      return { eyebrow: "Featured", heading: "Latest", max_items: 8, category_slug: null, show_view_all_button: true, view_all_label: "Shop All", view_all_link: "/shop" };
    case "brand":
      return { eyebrow: "The Brand", headline: "Built right.", paragraph: "Tell your brand story here.", stats: [{ value: "100%", label: "Quality" }], image_url: "", image_id: null, image_side: "right", tagline: "" };
    case "story":
      return { eyebrow: "Our Story", headline: "How it started.", paragraph: "Share the story behind your brand.", image_url: "", image_id: null, image_side: "left" };
    case "reviews":
      return { eyebrow: "Praise", heading: "Loved by customers", items: [{ name: "Customer Name", role: "Verified Buyer", rating: 5, text: "Amazing product!" }] };
    case "custom":
      return { block_type: "heading_text", eyebrow: "", heading: "Your custom block", text: "Write something here.", alignment: "center", padding: "md", max_width: "narrow", image_url: "", image_id: null };
    default:
      return {};
  }
}

export default function Builder() {
  const [sections, setSections] = useState([]);
  const [theme, setTheme] = useState({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [editingDraft, setEditingDraft] = useState(null);
  const [adding, setAdding] = useState(false);
  const [newType, setNewType] = useState("custom");
  const [themeOpen, setThemeOpen] = useState(false);
  const [themeDraft, setThemeDraft] = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [{ data: page }, { data: th }] = await Promise.all([
        api.get("/admin/page/home"),
        api.get("/theme"),
      ]);
      setSections(page.sections);
      setTheme(th);
    } catch {
      toast.error("Failed to load");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const saveSection = async () => {
    if (!editingDraft) return;
    try {
      await api.put(`/admin/page/sections/${editingDraft.id}`, {
        config: editingDraft.config,
        visible: editingDraft.visible,
      });
      toast.success("Saved");
      setEditing(null);
      setEditingDraft(null);
      load();
    } catch { toast.error("Save failed"); }
  };

  const toggleVisible = async (s) => {
    try {
      await api.put(`/admin/page/sections/${s.id}`, { visible: !s.visible });
      load();
    } catch { toast.error("Failed"); }
  };

  const move = async (idx, dir) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= sections.length) return;
    const ids = sections.map((s) => s.id);
    [ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]];
    try {
      await api.post("/admin/page/home/reorder", { ids });
      load();
    } catch { toast.error("Reorder failed"); }
  };

  const del = async (s) => {
    if (!confirm(`Delete ${TYPE_LABEL[s.section_type]} section?`)) return;
    try {
      await api.delete(`/admin/page/sections/${s.id}`);
      toast.success("Deleted");
      load();
    } catch { toast.error("Failed"); }
  };

  const addSection = async () => {
    try {
      await api.post("/admin/page/home/sections", {
        section_type: newType,
        config: emptyConfig(newType),
        visible: true,
      });
      toast.success("Added");
      setAdding(false);
      load();
    } catch { toast.error("Failed"); }
  };

  const saveTheme = async () => {
    try {
      await api.put("/admin/theme", { config: themeDraft });
      setTheme(themeDraft);
      toast.success("Theme saved");
      setThemeOpen(false);
    } catch { toast.error("Failed"); }
  };

  const openEdit = (s) => {
    setEditing(s);
    setEditingDraft(JSON.parse(JSON.stringify(s)));
  };
  const openTheme = () => {
    setThemeDraft({ ...theme, marquee_phrases: [...(theme.marquee_phrases || [])] });
    setThemeOpen(true);
  };

  if (loading) return <div className="text-zinc-500">Loading builder...</div>;

  return (
    <div className="space-y-6" data-testid="admin-builder">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="font-heading text-3xl sm:text-4xl font-black uppercase tracking-tighter">Page Builder</h1>
          <p className="text-sm text-zinc-500 mt-1">Editing: <span className="font-mono text-white">/ (Home)</span></p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button onClick={openTheme} className="bg-zinc-900 hover:bg-zinc-800 rounded-none uppercase tracking-widest font-bold border border-zinc-800">
            <Palette className="h-4 w-4 mr-2" /> Theme
          </Button>
          <a href="/" target="_blank" rel="noreferrer">
            <Button className="bg-zinc-900 hover:bg-zinc-800 rounded-none uppercase tracking-widest font-bold border border-zinc-800">
              <ExternalLink className="h-4 w-4 mr-2" /> Preview
            </Button>
          </a>
          <Button onClick={() => setAdding(true)} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold" data-testid="add-section-btn">
            <Plus className="h-4 w-4 mr-2" /> Add Section
          </Button>
        </div>
      </div>

      <div className="border border-zinc-900 divide-y divide-zinc-900">
        {sections.length === 0 && (
          <div className="p-12 text-center text-zinc-500">No sections yet — add one to get started.</div>
        )}
        {sections.map((s, i) => (
          <div key={s.id} className={`flex items-center gap-4 p-4 ${!s.visible ? "opacity-50" : ""}`} data-testid={`section-row-${s.section_type}`}>
            <div className="flex flex-col gap-1">
              <button onClick={() => move(i, -1)} disabled={i === 0} className="text-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed" data-testid={`section-up-${s.section_type}`}>
                <ArrowUp className="h-3 w-3" />
              </button>
              <button onClick={() => move(i, 1)} disabled={i === sections.length - 1} className="text-zinc-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed" data-testid={`section-down-${s.section_type}`}>
                <ArrowDown className="h-3 w-3" />
              </button>
            </div>
            <div className="font-mono text-xs text-zinc-600 w-8 text-center">{String(i + 1).padStart(2, "0")}</div>
            <div className="flex-1 min-w-0">
              <div className="font-heading uppercase tracking-widest text-sm text-white">
                {TYPE_LABEL[s.section_type] || s.section_type}
                {s.section_type === "custom" && s.config?.block_type && (
                  <span className="ml-2 text-[10px] text-zinc-500">· {s.config.block_type.replace("_", " + ")}</span>
                )}
              </div>
              <div className="text-xs text-zinc-500 truncate mt-1">
                {s.config?.headline || s.config?.heading || s.config?.headline_line1 || "—"}
              </div>
            </div>
            <button onClick={() => toggleVisible(s)} className="text-zinc-400 hover:text-white p-2" title={s.visible ? "Hide" : "Show"} data-testid={`section-vis-${s.section_type}`}>
              {s.visible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
            <button onClick={() => openEdit(s)} className="text-zinc-400 hover:text-[#FF3B30] p-2" data-testid={`section-edit-${s.section_type}`}>
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={() => del(s)} className="text-zinc-400 hover:text-red-400 p-2" data-testid={`section-del-${s.section_type}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={(o) => { if (!o) { setEditing(null); setEditingDraft(null); } }}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-3xl max-h-[90vh] overflow-y-auto rounded-none">
          <DialogHeader>
            <DialogTitle className="font-heading uppercase tracking-widest">
              Edit · {editing && TYPE_LABEL[editing.section_type]}
            </DialogTitle>
          </DialogHeader>
          {editingDraft && (
            <SectionEditor section={editingDraft} onChange={setEditingDraft} />
          )}
          <DialogFooter>
            <Button onClick={() => { setEditing(null); setEditingDraft(null); }} className="bg-transparent border border-zinc-700 rounded-none uppercase tracking-widest">Cancel</Button>
            <Button onClick={saveSection} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold" data-testid="section-save-btn">
              <Save className="h-4 w-4 mr-2" /> Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add dialog */}
      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">Add Section</DialogTitle></DialogHeader>
          <div>
            <Label className="text-xs uppercase tracking-widest text-zinc-400">Type</Label>
            <Select value={newType} onValueChange={setNewType}>
              <SelectTrigger className="bg-zinc-900 border-zinc-800 rounded-none mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                {SECTION_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter><Button onClick={addSection} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold" data-testid="confirm-add-section">Add</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Theme dialog */}
      <Dialog open={themeOpen} onOpenChange={setThemeOpen}>
        <DialogContent className="bg-zinc-950 border-zinc-800 text-white max-w-md rounded-none">
          <DialogHeader><DialogTitle className="font-heading uppercase tracking-widest">Theme</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Primary / Accent Color</Label>
              <div className="flex gap-2 mt-1">
                <input type="color" value={themeDraft.primary_color || "#FF3B30"} onChange={(e) => setThemeDraft({ ...themeDraft, primary_color: e.target.value })} className="h-10 w-14 bg-zinc-900 border border-zinc-800 cursor-pointer" data-testid="theme-color-picker" />
                <Input value={themeDraft.primary_color || ""} onChange={(e) => setThemeDraft({ ...themeDraft, primary_color: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none font-mono" />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Primary Hover</Label>
              <div className="flex gap-2 mt-1">
                <input type="color" value={themeDraft.primary_color_hover || "#D92D23"} onChange={(e) => setThemeDraft({ ...themeDraft, primary_color_hover: e.target.value })} className="h-10 w-14 bg-zinc-900 border border-zinc-800 cursor-pointer" />
                <Input value={themeDraft.primary_color_hover || ""} onChange={(e) => setThemeDraft({ ...themeDraft, primary_color_hover: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none font-mono" />
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Footer Marquee Phrases (one per line)</Label>
              <textarea
                value={(themeDraft.marquee_phrases || []).join("\n")}
                onChange={(e) => setThemeDraft({ ...themeDraft, marquee_phrases: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean) })}
                className="w-full mt-1 bg-zinc-900 border border-zinc-800 rounded-none p-2 text-sm text-white"
                rows={4}
                data-testid="theme-marquee-phrases"
              />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-widest text-zinc-400">Marquee Separator</Label>
              <Input value={themeDraft.marquee_separator || "//"} onChange={(e) => setThemeDraft({ ...themeDraft, marquee_separator: e.target.value })} className="bg-zinc-900 border-zinc-800 rounded-none mt-1 font-mono" />
            </div>
          </div>
          <DialogFooter><Button onClick={saveTheme} className="bg-[#FF3B30] hover:bg-[#D92D23] rounded-none uppercase tracking-widest font-bold" data-testid="save-theme-btn"><Save className="h-4 w-4 mr-2" /> Save Theme</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
