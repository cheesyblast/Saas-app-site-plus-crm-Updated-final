// Shared client-side image preprocessing for all admin upload UIs.
//
// Goals:
//   1. Auto-shrink huge phone-camera shots to a sensible web size so the
//      base64 payload doesn't blow past server limits.
//   2. Re-encode as JPEG (~85% quality) when the original is large.
//   3. Always tell the caller the *final* file size + dimensions so the UI
//      can display "1.2 MB · 1600×2000" hints to the merchant.
//
// Returns: { dataBase64, mimeType, sizeBytes, width, height, originalSize, originalMime }
// All sizes are of the FINAL (post-compression) payload.
//
// Throws { code: 'TOO_LARGE' } only when an image is so huge that even after
// max compression it still exceeds `maxBytes`. The UI can catch and surface
// a friendly error.

const DEFAULT_MAX_DIM = 2400;
const JPEG_QUALITY = 0.85;

function _readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function _loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function _dataUrlToBase64(dataUrl) {
  const i = dataUrl.indexOf(",");
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

function _b64Bytes(b64) {
  // approx bytes of decoded base64
  const padding = (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
  return Math.floor((b64.length * 3) / 4) - padding;
}

export async function preprocessImage(file, {
  maxBytes = 1.5 * 1024 * 1024,
  maxDim = DEFAULT_MAX_DIM,
  forceJpeg = false,
} = {}) {
  if (!file || !file.type || !file.type.startsWith("image/")) {
    throw { code: "NOT_IMAGE", message: "Please choose an image file (JPG/PNG/WebP)." };
  }
  const originalSize = file.size;
  const originalMime = file.type;
  const originalUrl = await _readAsDataURL(file);
  const img = await _loadImage(originalUrl);
  const { width: ow, height: oh } = img;

  // If original is already under the limit AND not absurdly large, return as-is.
  const isPngWithAlpha = originalMime === "image/png" && !forceJpeg;
  if (originalSize <= maxBytes && Math.max(ow, oh) <= maxDim) {
    const b64 = _dataUrlToBase64(originalUrl);
    return {
      dataBase64: b64, mimeType: originalMime, sizeBytes: originalSize,
      width: ow, height: oh, originalSize, originalMime, compressed: false,
    };
  }

  // Resize via canvas, then re-encode. JPEG for photos; keep PNG only for tiny screenshots.
  const targetMime = isPngWithAlpha && originalSize < maxBytes * 1.5 ? "image/png" : "image/jpeg";
  const scale = Math.min(1, maxDim / Math.max(ow, oh));
  let tw = Math.round(ow * scale);
  let th = Math.round(oh * scale);
  let quality = JPEG_QUALITY;

  // Iterate down at most 3 times to get under maxBytes
  for (let attempt = 0; attempt < 4; attempt++) {
    const c = document.createElement("canvas");
    c.width = tw; c.height = th;
    const ctx = c.getContext("2d");
    if (targetMime === "image/jpeg") {
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, tw, th);
    }
    ctx.drawImage(img, 0, 0, tw, th);
    const dataUrl = c.toDataURL(targetMime, quality);
    const b64 = _dataUrlToBase64(dataUrl);
    const bytes = _b64Bytes(b64);
    if (bytes <= maxBytes || attempt === 3) {
      return {
        dataBase64: b64, mimeType: targetMime, sizeBytes: bytes,
        width: tw, height: th, originalSize, originalMime, compressed: true,
      };
    }
    // Reduce: try smaller dim / lower quality
    if (targetMime === "image/jpeg" && quality > 0.55) {
      quality -= 0.15;
    } else {
      tw = Math.round(tw * 0.8); th = Math.round(th * 0.8);
    }
  }
  throw { code: "TOO_LARGE", message: "Image is too large even after compression. Try a smaller picture." };
}

export function humanFileSize(bytes) {
  if (bytes == null) return "?";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(2) + " MB";
}
