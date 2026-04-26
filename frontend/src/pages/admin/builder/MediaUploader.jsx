import React, { useRef, useState } from "react";
import { Upload, Loader2, Image as ImageIcon, X } from "lucide-react";
import api, { imgSrc, BACKEND_URL } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

/**
 * MediaUploader - file upload + URL input.
 * Value shape: { image_id, image_url } (one of them populated)
 * onChange({ image_id, image_url })
 */
export default function MediaUploader({ value, onChange, label = "Image", accept = "image/*" }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const v = value || {};
  const hasMedia = v.image_id || v.image_url;
  const previewSrc = v.image_id
    ? `${BACKEND_URL}/api/media/${v.image_id}`
    : v.image_url || null;
  const isVideo = accept.startsWith("video");

  const upload = async (file) => {
    if (!file) return;
    const max = isVideo ? 15 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > max) {
      toast.error(`File too large (max ${isVideo ? "15MB" : "5MB"})`);
      return;
    }
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const b64 = reader.result.toString().split(",")[1];
        try {
          const { data } = await api.post("/admin/media", {
            data_base64: b64,
            mime_type: file.type || (isVideo ? "video/mp4" : "image/png"),
            filename: file.name,
          });
          onChange({ image_id: data.id, image_url: "" });
          toast.success("Uploaded");
        } catch {
          toast.error("Upload failed");
        } finally {
          setUploading(false);
        }
      };
      reader.readAsDataURL(file);
    } catch {
      setUploading(false);
    }
  };

  return (
    <div>
      {label && <div className="text-xs uppercase tracking-widest text-zinc-400 mb-2">{label}</div>}

      <div className="border border-zinc-800 bg-zinc-900/40 p-3 space-y-3">
        {hasMedia && (
          <div className="relative group">
            <div className="aspect-video w-full bg-zinc-900 border border-zinc-800 overflow-hidden">
              {isVideo ? (
                <video src={previewSrc} className="w-full h-full object-cover" muted controls/>
              ) : (
                <img src={previewSrc} alt="" className="w-full h-full object-cover" />
              )}
            </div>
            <button
              type="button"
              onClick={() => onChange({ image_id: null, image_url: "" })}
              className="absolute top-2 right-2 bg-black/80 border border-zinc-700 hover:border-red-500 p-1.5"
              data-testid="media-clear-btn"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="bg-zinc-800 hover:bg-zinc-700 text-white rounded-none uppercase tracking-widest text-xs"
            data-testid="media-upload-btn"
          >
            {uploading ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
            {uploading ? "Uploading" : (isVideo ? "Upload Video" : "Upload")}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => upload(e.target.files?.[0])}
          />
          <Button
            type="button"
            onClick={() => onChange({ image_id: null, image_url: "" })}
            className="bg-transparent border border-zinc-800 hover:border-zinc-600 rounded-none uppercase tracking-widest text-xs"
          >
            <ImageIcon className="h-3 w-3 mr-1" /> Clear
          </Button>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1">Or paste a {isVideo ? "video" : "image"} URL</div>
          <Input
            value={v.image_url || ""}
            onChange={(e) => onChange({ image_id: null, image_url: e.target.value })}
            placeholder={isVideo ? "https://...mp4" : "https://..."}
            className="bg-zinc-900 border-zinc-800 rounded-none text-xs"
          />
        </div>
      </div>
    </div>
  );
}
