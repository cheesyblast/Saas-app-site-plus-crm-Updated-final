import React from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Plus, Trash2 } from "lucide-react";
import MediaUploader from "./MediaUploader";

const F = ({ label, children }) => (
  <div>
    <Label className="text-xs uppercase tracking-widest text-zinc-400">{label}</Label>
    <div className="mt-1">{children}</div>
  </div>
);
const Row = ({ children }) => <div className="grid sm:grid-cols-2 gap-3">{children}</div>;

const inputCls = "bg-zinc-900 border-zinc-800 rounded-none text-white";

// =================== HERO ===================
function HeroEditor({ config, onChange }) {
  const c = config;
  const set = (k, v) => onChange({ ...c, [k]: v });
  return (
    <div className="space-y-4">
      <F label="Badge Text"><Input className={inputCls} value={c.badge_text || ""} onChange={(e) => set("badge_text", e.target.value)} /></F>
      <Row>
        <F label="Headline Line 1"><Input className={inputCls} value={c.headline_line1 || ""} onChange={(e) => set("headline_line1", e.target.value)} /></F>
        <F label="Headline Line 2"><Input className={inputCls} value={c.headline_line2 || ""} onChange={(e) => set("headline_line2", e.target.value)} /></F>
      </Row>
      <Row>
        <F label="Headline Size (default for both lines)">
          <Select value={c.headline_size || "lg"} onValueChange={(v) => set("headline_size", v)}>
            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              <SelectItem value="xs">Extra Small</SelectItem>
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
              <SelectItem value="xl">Extra Large</SelectItem>
              <SelectItem value="2xl">Display (max)</SelectItem>
            </SelectContent>
          </Select>
        </F>
        <F label="Highlight 2nd Line in Brand Color">
          <div className="h-10 flex items-center"><Switch checked={!!c.headline_line2_accent} onCheckedChange={(v) => set("headline_line2_accent", v)} /></div>
        </F>
      </Row>
      <Row>
        <F label="Line 1 Size (overrides default)">
          <Select value={c.headline_line1_size || ""} onValueChange={(v) => set("headline_line1_size", v || null)}>
            <SelectTrigger className={inputCls}><SelectValue placeholder="Use default"/></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              <SelectItem value="xs">Extra Small</SelectItem><SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem><SelectItem value="lg">Large</SelectItem>
              <SelectItem value="xl">Extra Large</SelectItem><SelectItem value="2xl">Display (max)</SelectItem>
            </SelectContent>
          </Select>
        </F>
        <F label="Line 2 Size (overrides default)">
          <Select value={c.headline_line2_size || ""} onValueChange={(v) => set("headline_line2_size", v || null)}>
            <SelectTrigger className={inputCls}><SelectValue placeholder="Use default"/></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              <SelectItem value="xs">Extra Small</SelectItem><SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem><SelectItem value="lg">Large</SelectItem>
              <SelectItem value="xl">Extra Large</SelectItem><SelectItem value="2xl">Display (max)</SelectItem>
            </SelectContent>
          </Select>
        </F>
      </Row>
      <F label="Subheading"><Textarea className={inputCls} value={c.subheading || ""} onChange={(e) => set("subheading", e.target.value)} rows={3} /></F>
      <Row>
        <F label="Primary Button Label"><Input className={inputCls} value={c.cta_primary_label || ""} onChange={(e) => set("cta_primary_label", e.target.value)} /></F>
        <F label="Primary Button Link"><Input className={inputCls} value={c.cta_primary_link || ""} onChange={(e) => set("cta_primary_link", e.target.value)} placeholder="/shop" /></F>
        <F label="Secondary Button Label"><Input className={inputCls} value={c.cta_secondary_label || ""} onChange={(e) => set("cta_secondary_label", e.target.value)} /></F>
        <F label="Secondary Button Link"><Input className={inputCls} value={c.cta_secondary_link || ""} onChange={(e) => set("cta_secondary_link", e.target.value)} /></F>
      </Row>

      <MediaUploader value={{ image_id: c.image_id, image_url: c.image_url }} onChange={(v) => onChange({ ...c, image_id: v.image_id, image_url: v.image_url })} label="Background Image" />

      <div className="border border-zinc-800 p-3">
        <Label className="text-xs uppercase tracking-widest text-zinc-400">Foreground Image (optional, side-by-side with text)</Label>
        <p className="text-[10px] text-zinc-500 mt-1 mb-3">Place a product/lifestyle photo next to the headline.</p>
        <MediaUploader value={{ image_id: c.fg_image_id, image_url: c.fg_image_url }} onChange={(v) => onChange({ ...c, fg_image_id: v.image_id, fg_image_url: v.image_url })} label=""/>
        <Row>
          <F label="Foreground side">
            <Select value={c.fg_image_side || "right"} onValueChange={(v) => set("fg_image_side", v)}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                <SelectItem value="left">Left of text</SelectItem>
                <SelectItem value="right">Right of text</SelectItem>
              </SelectContent>
            </Select>
          </F>
        </Row>
      </div>

      <div className="border border-zinc-800 p-3 space-y-3">
        <Label className="text-xs uppercase tracking-widest text-zinc-400">Text Alignment</Label>
        <Row>
          <F label="Eyebrow / Badge">
            <Select value={c.eyebrow_align || "left"} onValueChange={(v) => set("eyebrow_align", v)}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                <SelectItem value="left">Left</SelectItem><SelectItem value="center">Center</SelectItem><SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Heading">
            <Select value={c.heading_align || "left"} onValueChange={(v) => set("heading_align", v)}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                <SelectItem value="left">Left</SelectItem><SelectItem value="center">Center</SelectItem><SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Paragraph">
            <Select value={c.paragraph_align || "left"} onValueChange={(v) => set("paragraph_align", v)}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                <SelectItem value="left">Left</SelectItem><SelectItem value="center">Center</SelectItem><SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Buttons">
            <Select value={c.buttons_align || "left"} onValueChange={(v) => set("buttons_align", v)}>
              <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                <SelectItem value="left">Left</SelectItem><SelectItem value="center">Center</SelectItem><SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </F>
        </Row>
      </div>

      <div className="border border-zinc-800 p-3">
        <Label className="text-xs uppercase tracking-widest text-zinc-400">Background Video (optional, takes priority over image)</Label>
        <p className="text-[10px] text-zinc-500 mt-1 mb-3">Recommended: <span className="text-zinc-300">1920×1080 MP4 (h.264), &lt; 10 MB, 10–20 sec loop</span>. Autoplays muted; viewer can unmute.</p>
        <MediaUploader value={{ image_id: c.video_id, image_url: c.video_url }} onChange={(v) => onChange({ ...c, video_id: v.image_id, video_url: v.image_url })} label="" accept="video/*"/>
      </div>

      <Row>
        <F label="Image Position">
          <Select value={c.image_position || "center"} onValueChange={(v) => set("image_position", v)}>
            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="right">Right</SelectItem>
              <SelectItem value="top">Top</SelectItem>
              <SelectItem value="bottom">Bottom</SelectItem>
            </SelectContent>
          </Select>
        </F>
        <F label="Section Height">
          <Select value={c.height || "tall"} onValueChange={(v) => set("height", v)}>
            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              <SelectItem value="compact">Compact (60vh)</SelectItem>
              <SelectItem value="standard">Standard (75vh)</SelectItem>
              <SelectItem value="tall">Tall (88vh)</SelectItem>
              <SelectItem value="fullscreen">Fullscreen (100vh)</SelectItem>
            </SelectContent>
          </Select>
        </F>
      </Row>
      <F label={`Overlay Darkness (${c.overlay_opacity ?? 60}%)`}>
        <input type="range" min={0} max={100} value={c.overlay_opacity ?? 60} onChange={(e) => set("overlay_opacity", parseInt(e.target.value))} className="w-full" />
      </F>
    </div>
  );
}

// =================== FEATURED ===================
function FeaturedEditor({ config, onChange }) {
  const c = config;
  const set = (k, v) => onChange({ ...c, [k]: v });
  return (
    <div className="space-y-4">
      <Row>
        <F label="Eyebrow"><Input className={inputCls} value={c.eyebrow || ""} onChange={(e) => set("eyebrow", e.target.value)} /></F>
        <F label="Heading"><Input className={inputCls} value={c.heading || ""} onChange={(e) => set("heading", e.target.value)} /></F>
      </Row>
      <Row>
        <F label="Max Items"><Input type="number" min={1} max={24} className={inputCls} value={c.max_items || 8} onChange={(e) => set("max_items", parseInt(e.target.value) || 8)} /></F>
        <F label="Category Slug (empty = featured only)"><Input className={inputCls} value={c.category_slug || ""} onChange={(e) => set("category_slug", e.target.value || null)} placeholder="heritage" /></F>
      </Row>
      <F label="Show 'View All' Button">
        <div className="h-10 flex items-center"><Switch checked={!!c.show_view_all_button} onCheckedChange={(v) => set("show_view_all_button", v)} /></div>
      </F>
      <Row>
        <F label="Button Label"><Input className={inputCls} value={c.view_all_label || ""} onChange={(e) => set("view_all_label", e.target.value)} /></F>
        <F label="Button Link"><Input className={inputCls} value={c.view_all_link || ""} onChange={(e) => set("view_all_link", e.target.value)} placeholder="/shop" /></F>
      </Row>
    </div>
  );
}

// =================== BRAND ===================
function BrandEditor({ config, onChange }) {
  const c = config;
  const set = (k, v) => onChange({ ...c, [k]: v });
  const stats = Array.isArray(c.stats) ? c.stats : [];
  const setStat = (i, k, v) => { const s = [...stats]; s[i] = { ...s[i], [k]: v }; set("stats", s); };
  const addStat = () => set("stats", [...stats, { value: "", label: "" }]);
  const delStat = (i) => set("stats", stats.filter((_, j) => j !== i));
  return (
    <div className="space-y-4">
      <F label="Eyebrow"><Input className={inputCls} value={c.eyebrow || ""} onChange={(e) => set("eyebrow", e.target.value)} /></F>
      <F label="Headline (multi-line OK)"><Textarea className={inputCls} value={c.headline || ""} onChange={(e) => set("headline", e.target.value)} rows={3} /></F>
      <F label="Paragraph"><Textarea className={inputCls} value={c.paragraph || ""} onChange={(e) => set("paragraph", e.target.value)} rows={4} /></F>

      <div>
        <Label className="text-xs uppercase tracking-widest text-zinc-400">Stats</Label>
        <div className="space-y-2 mt-1">
          {stats.map((s, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <Input placeholder="Value" value={s.value || ""} onChange={(e) => setStat(i, "value", e.target.value)} className={`${inputCls} col-span-4`} />
              <Input placeholder="Label" value={s.label || ""} onChange={(e) => setStat(i, "label", e.target.value)} className={`${inputCls} col-span-7`} />
              <button onClick={() => delStat(i)} className="col-span-1 text-zinc-400 hover:text-red-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <Button type="button" onClick={addStat} className="bg-zinc-900 hover:bg-zinc-800 rounded-none text-xs uppercase tracking-widest"><Plus className="h-3 w-3 mr-1" /> Add Stat</Button>
        </div>
      </div>

      <MediaUploader value={{ image_id: c.image_id, image_url: c.image_url }} onChange={(v) => onChange({ ...c, image_id: v.image_id, image_url: v.image_url })} label="Side Image" />
      <Row>
        <F label="Image Side">
          <Select value={c.image_side || "right"} onValueChange={(v) => set("image_side", v)}>
            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </F>
        <F label="Image Tagline (small text)"><Input className={inputCls} value={c.tagline || ""} onChange={(e) => set("tagline", e.target.value)} /></F>
      </Row>
    </div>
  );
}

// =================== STORY ===================
function StoryEditor({ config, onChange }) {
  const c = config;
  const set = (k, v) => onChange({ ...c, [k]: v });
  return (
    <div className="space-y-4">
      <F label="Eyebrow"><Input className={inputCls} value={c.eyebrow || ""} onChange={(e) => set("eyebrow", e.target.value)} /></F>
      <F label="Headline"><Input className={inputCls} value={c.headline || ""} onChange={(e) => set("headline", e.target.value)} /></F>
      <F label="Paragraph"><Textarea className={inputCls} value={c.paragraph || ""} onChange={(e) => set("paragraph", e.target.value)} rows={6} /></F>
      <MediaUploader value={{ image_id: c.image_id, image_url: c.image_url }} onChange={(v) => onChange({ ...c, image_id: v.image_id, image_url: v.image_url })} label="Side Image (optional)" />
      <F label="Image Side">
        <Select value={c.image_side || "left"} onValueChange={(v) => set("image_side", v)}>
          <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
          <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
            <SelectItem value="left">Left</SelectItem>
            <SelectItem value="right">Right</SelectItem>
          </SelectContent>
        </Select>
      </F>
    </div>
  );
}

// =================== REVIEWS ===================
function ReviewsEditor({ config, onChange }) {
  const c = config;
  const set = (k, v) => onChange({ ...c, [k]: v });
  const items = Array.isArray(c.items) ? c.items : [];
  const setItem = (i, k, v) => { const s = [...items]; s[i] = { ...s[i], [k]: v }; set("items", s); };
  const addItem = () => set("items", [...items, { name: "", role: "Verified Buyer", rating: 5, text: "" }]);
  const delItem = (i) => set("items", items.filter((_, j) => j !== i));
  return (
    <div className="space-y-4">
      <Row>
        <F label="Eyebrow"><Input className={inputCls} value={c.eyebrow || ""} onChange={(e) => set("eyebrow", e.target.value)} /></F>
        <F label="Heading"><Input className={inputCls} value={c.heading || ""} onChange={(e) => set("heading", e.target.value)} /></F>
      </Row>

      <div className="border border-zinc-800 p-3 space-y-3">
        <Label className="text-xs uppercase tracking-widest text-zinc-400">Display</Label>
        <Row>
          <F label="Layout">
            <Select value={c.layout || "grid"} onValueChange={(v) => set("layout", v)}>
              <SelectTrigger className={inputCls}><SelectValue/></SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                <SelectItem value="grid">Grid (static)</SelectItem>
                <SelectItem value="carousel">Carousel (auto-scroll)</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Direction (carousel)">
            <Select value={c.direction || "ltr"} onValueChange={(v) => set("direction", v)}>
              <SelectTrigger className={inputCls}><SelectValue/></SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                <SelectItem value="ltr">Left → Right</SelectItem>
                <SelectItem value="rtl">Right → Left</SelectItem>
              </SelectContent>
            </Select>
          </F>
        </Row>
        <Row>
          <F label="Speed">
            <Select value={c.speed || "medium"} onValueChange={(v) => set("speed", v)}>
              <SelectTrigger className={inputCls}><SelectValue/></SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                <SelectItem value="slow">Slow</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="fast">Fast</SelectItem>
              </SelectContent>
            </Select>
          </F>
          <F label="Autoplay">
            <div className="h-10 flex items-center"><Switch checked={c.autoplay !== false} onCheckedChange={(v) => set("autoplay", v)} /></div>
          </F>
        </Row>
      </div>

      <div>
        <Label className="text-xs uppercase tracking-widest text-zinc-400">Reviews</Label>
        <div className="space-y-3 mt-1">
          {items.map((it, i) => (
            <div key={i} className="border border-zinc-800 p-3 space-y-2 relative">
              <button onClick={() => delItem(i)} className="absolute top-2 right-2 text-zinc-500 hover:text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
              <Row>
                <Input placeholder="Name" value={it.name || ""} onChange={(e) => setItem(i, "name", e.target.value)} className={inputCls} />
                <Input placeholder="Role / Subtitle" value={it.role || ""} onChange={(e) => setItem(i, "role", e.target.value)} className={inputCls} />
              </Row>
              <Input type="number" min={1} max={5} placeholder="Rating 1-5" value={it.rating || 5} onChange={(e) => setItem(i, "rating", parseInt(e.target.value) || 5)} className={`${inputCls} max-w-[120px]`} />
              <Textarea placeholder="Review text" value={it.text || ""} onChange={(e) => setItem(i, "text", e.target.value)} className={inputCls} rows={2} />
            </div>
          ))}
          <Button type="button" onClick={addItem} className="bg-zinc-900 hover:bg-zinc-800 rounded-none text-xs uppercase tracking-widest"><Plus className="h-3 w-3 mr-1" /> Add Review</Button>
        </div>
      </div>
    </div>
  );
}

// =================== CUSTOM ===================
function CustomEditor({ config, onChange }) {
  const c = config;
  const set = (k, v) => onChange({ ...c, [k]: v });
  const t = c.block_type || "heading_text";
  return (
    <div className="space-y-4">
      <F label="Block Type">
        <Select value={t} onValueChange={(v) => set("block_type", v)}>
          <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
          <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
            <SelectItem value="heading_text">Heading + Text</SelectItem>
            <SelectItem value="image_hero">Full-width Hero Image with Text Overlay</SelectItem>
            <SelectItem value="image_text">Split: Image + Text</SelectItem>
          </SelectContent>
        </Select>
      </F>
      <F label="Eyebrow (small uppercase)"><Input className={inputCls} value={c.eyebrow || ""} onChange={(e) => set("eyebrow", e.target.value)} /></F>
      <F label="Heading"><Input className={inputCls} value={c.heading || ""} onChange={(e) => set("heading", e.target.value)} /></F>
      <F label="Text"><Textarea className={inputCls} value={c.text || ""} onChange={(e) => set("text", e.target.value)} rows={4} /></F>
      {(t === "image_hero" || t === "image_text") && (
        <MediaUploader value={{ image_id: c.image_id, image_url: c.image_url }} onChange={(v) => onChange({ ...c, image_id: v.image_id, image_url: v.image_url })} label="Image" />
      )}
      {t === "image_text" && (
        <F label="Image Side">
          <Select value={c.image_side || "left"} onValueChange={(v) => set("image_side", v)}>
            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </F>
      )}
      <Row>
        <F label="Alignment">
          <Select value={c.alignment || "center"} onValueChange={(v) => set("alignment", v)}>
            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              <SelectItem value="left">Left</SelectItem>
              <SelectItem value="center">Center</SelectItem>
              <SelectItem value="right">Right</SelectItem>
            </SelectContent>
          </Select>
        </F>
        <F label="Padding">
          <Select value={c.padding || "md"} onValueChange={(v) => set("padding", v)}>
            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              <SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem>
              <SelectItem value="lg">Large</SelectItem>
            </SelectContent>
          </Select>
        </F>
        <F label="Max Width">
          <Select value={c.max_width || "narrow"} onValueChange={(v) => set("max_width", v)}>
            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              <SelectItem value="narrow">Narrow</SelectItem>
              <SelectItem value="wide">Wide</SelectItem>
              <SelectItem value="full">Full</SelectItem>
            </SelectContent>
          </Select>
        </F>
        <F label="Optional CTA Label"><Input className={inputCls} value={c.cta_label || ""} onChange={(e) => set("cta_label", e.target.value)} /></F>
        <F label="CTA Link"><Input className={inputCls} value={c.cta_link || ""} onChange={(e) => set("cta_link", e.target.value)} placeholder="/shop" /></F>
      </Row>
    </div>
  );
}

const EDITORS_REMOVED_BELOW_DUPLICATE = null;

function ShopEditor({ config, onChange }) {
  const c = config;
  const set = (k, v) => onChange({ ...c, [k]: v });
  const [cats, setCats] = React.useState([]);
  React.useEffect(() => {
    import("@/lib/api").then(({ default: api }) => api.get("/categories").then(({ data }) => setCats(data)));
  }, []);
  return (
    <div className="space-y-4">
      <Row>
        <F label="Eyebrow"><Input className={inputCls} value={c.eyebrow || ""} onChange={(e) => set("eyebrow", e.target.value)} /></F>
        <F label="Heading"><Input className={inputCls} value={c.heading || ""} onChange={(e) => set("heading", e.target.value)} /></F>
      </Row>
      <F label="Subheading"><Textarea className={inputCls} value={c.subheading || ""} onChange={(e) => set("subheading", e.target.value)} rows={2} /></F>
      <Row>
        <F label="Show">
          <Select value={c.scope || "all"} onValueChange={(v) => set("scope", v)}>
            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              <SelectItem value="all">All products</SelectItem>
              <SelectItem value="category">Selected category (incl. sub)</SelectItem>
            </SelectContent>
          </Select>
        </F>
        {c.scope === "category" && (
          <F label="Category">
            <Select value={c.category_slug || ""} onValueChange={(v) => set("category_slug", v)}>
              <SelectTrigger className={inputCls}><SelectValue placeholder="Pick category" /></SelectTrigger>
              <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
                {cats.map((cat) => <SelectItem key={cat.id} value={cat.slug}>{cat.name}{cat.parent_id ? " (sub)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </F>
        )}
      </Row>
      <Row>
        <F label="Max items"><Input type="number" min={2} max={48} className={inputCls} value={c.max_items || 12} onChange={(e) => set("max_items", parseInt(e.target.value) || 12)} /></F>
        <F label="Columns">
          <Select value={String(c.columns || 3)} onValueChange={(v) => set("columns", parseInt(v))}>
            <SelectTrigger className={inputCls}><SelectValue /></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              <SelectItem value="2">2</SelectItem><SelectItem value="3">3</SelectItem>
              <SelectItem value="4">4</SelectItem><SelectItem value="5">5</SelectItem>
            </SelectContent>
          </Select>
        </F>
      </Row>
    </div>
  );
}

function StylePanel({ config, onChange }) {
  const c = config || {};
  const set = (k, v) => onChange({ ...c, [k]: v });
  return (
    <div className="border-t border-zinc-800 pt-5 mt-5 space-y-4">
      <div className="text-xs uppercase tracking-widest text-zinc-400 font-heading">Section Style</div>
      <Row>
        <F label="Background color (blank = theme bg)">
          <div className="flex gap-2">
            <input type="color" value={c.bg_color || "#000000"} onChange={(e) => set("bg_color", e.target.value)} className="w-12 h-10 cursor-pointer bg-transparent border border-zinc-800" />
            <Input className={inputCls} value={c.bg_color || ""} onChange={(e) => set("bg_color", e.target.value || null)} placeholder="#000000 or empty" />
            <Button type="button" onClick={() => set("bg_color", null)} className="bg-zinc-900 hover:bg-zinc-800 rounded-none text-xs">Clear</Button>
          </div>
        </F>
        <F label="Text color (blank = theme text)">
          <div className="flex gap-2">
            <input type="color" value={c.text_color || "#FFFFFF"} onChange={(e) => set("text_color", e.target.value)} className="w-12 h-10 cursor-pointer bg-transparent border border-zinc-800" />
            <Input className={inputCls} value={c.text_color || ""} onChange={(e) => set("text_color", e.target.value || null)} />
            <Button type="button" onClick={() => set("text_color", null)} className="bg-zinc-900 hover:bg-zinc-800 rounded-none text-xs">Clear</Button>
          </div>
        </F>
      </Row>
      <Row>
        <F label="Padding (top + bottom)">
          <Select value={c.padding || ""} onValueChange={(v) => set("padding", v || null)}>
            <SelectTrigger className={inputCls}><SelectValue placeholder="Default" /></SelectTrigger>
            <SelectContent className="bg-zinc-950 border-zinc-800 text-white">
              <SelectItem value="none">None</SelectItem><SelectItem value="sm">Small</SelectItem>
              <SelectItem value="md">Medium</SelectItem><SelectItem value="lg">Large</SelectItem>
              <SelectItem value="xl">Extra large</SelectItem>
            </SelectContent>
          </Select>
        </F>
        <F label={`Background overlay (${c.bg_overlay_opacity ?? 0}%)`}>
          <input type="range" min={0} max={90} value={c.bg_overlay_opacity ?? 0} onChange={(e) => set("bg_overlay_opacity", parseInt(e.target.value))} className="w-full" />
        </F>
      </Row>
    </div>
  );
}

const EDITORS = {
  hero: HeroEditor,
  featured: FeaturedEditor,
  shop: ShopEditor,
  brand: BrandEditor,
  story: StoryEditor,
  reviews: ReviewsEditor,
  custom: CustomEditor,
};

export default function SectionEditor({ section, onChange }) {
  const Cmp = EDITORS[section.section_type];
  if (!Cmp) return <div className="text-zinc-500 text-sm">No editor for {section.section_type}</div>;
  const setCfg = (cfg) => onChange({ ...section, config: cfg });
  return (
    <>
      <Cmp config={section.config || {}} onChange={setCfg} />
      <StylePanel config={section.config || {}} onChange={setCfg} />
    </>
  );
}
