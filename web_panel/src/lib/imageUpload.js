// Client-side image compression + progress upload.
//
// Compressing in the browser BEFORE upload is the single biggest real-world
// upload-speed win on slow networks: a 3-5 MB phone photo becomes ~200-400 KB,
// so far fewer bytes travel the wire (and the server does less work too).
// Falls back gracefully — non-images, SVG/GIF, or any failure just upload the
// original file unchanged, so nothing ever breaks.

const SKIP_TYPES = ["image/svg+xml", "image/gif"];

// Hard upload cap across the whole app: 2 MB (binary bytes).
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

export function humanSize(bytes) {
  const b = Number(bytes || 0);
  if (b >= 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${b} B`;
}

/** Approx binary byte size of a base64 / data-URL string. */
export function dataUrlBytes(dataUrl) {
  try {
    const b64 = String(dataUrl).includes(",") ? String(dataUrl).split(",")[1] : String(dataUrl);
    const len = b64.length;
    const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
    return Math.floor((len * 3) / 4) - pad;
  } catch {
    return (dataUrl || "").length;
  }
}

function loadBitmap(file) {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file).catch(() => loadViaImg(file));
  }
  return loadViaImg(file);
}

function loadViaImg(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

/**
 * Downscale + re-encode an image File to WebP (fallback JPEG).
 * @returns {Promise<File>} a smaller File, or the original if compression
 *   doesn't help / isn't applicable.
 */
export async function compressImage(file, { maxSide = 1600, quality = 0.82 } = {}) {
  try {
    if (!file || !file.type || !file.type.startsWith("image/")) return file;
    if (SKIP_TYPES.includes(file.type)) return file;
    // Tiny files aren't worth the CPU.
    if (file.size <= 120 * 1024) return file;

    const bmp = await loadBitmap(file);
    const w = bmp.width || bmp.naturalWidth;
    const h = bmp.height || bmp.naturalHeight;
    if (!w || !h) return file;

    const scale = Math.min(1, maxSide / Math.max(w, h));
    const tw = Math.round(w * scale);
    const th = Math.round(h * scale);

    const canvas = document.createElement("canvas");
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(bmp, 0, 0, tw, th);
    if (bmp.close) bmp.close();

    // Prefer WebP; some old browsers fall back to JPEG automatically.
    const blob = await new Promise((res) => canvas.toBlob(res, "image/webp", quality));
    if (!blob || blob.size >= file.size) return file; // no gain → keep original
    const name = (file.name || "image").replace(/\.[^.]+$/, "") + ".webp";
    return new File([blob], name, { type: "image/webp", lastModified: Date.now() });
  } catch {
    return file; // never block an upload because compression failed
  }
}

/**
 * Validate a picked File against the app-wide 2 MB cap.
 * For NON-images (PDF/doc/etc.) we can't compress, so oversize is rejected.
 * @returns {{ ok: boolean, error?: string }}
 */
export function validateUploadFile(file, { maxBytes = MAX_UPLOAD_BYTES } = {}) {
  if (!file) return { ok: false, error: "No file selected." };
  const isImage = file.type && file.type.startsWith("image/");
  if (!isImage && file.size > maxBytes) {
    return { ok: false, error: `File is ${humanSize(file.size)}. Maximum allowed is 2 MB.` };
  }
  return { ok: true };
}

/**
 * Encode a File/Blob to a base64 data URL.
 */
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/**
 * Compress an image File so its BINARY size is under `maxBytes` (default 2 MB) and
 * return a base64 data URL — ideal for profile photos stored as base64 via
 * /auth/profile. Iteratively lowers dimension + quality until it fits. Non-image
 * files are returned as-is (already validated by validateUploadFile).
 */
export async function compressImageToDataUrl(file, { maxBytes = MAX_UPLOAD_BYTES } = {}) {
  if (!file || !file.type || !file.type.startsWith("image/") || SKIP_TYPES.includes(file.type)) {
    return fileToDataUrl(file);
  }
  try {
    let side = 1280;
    let quality = 0.85;
    for (let i = 0; i < 8; i += 1) {
      const dataUrl = await encodeToDataUrl(file, side, quality);
      if (dataUrlBytes(dataUrl) <= maxBytes) return dataUrl;
      // Shrink for the next pass.
      if (quality > 0.5) quality -= 0.12;
      else side = Math.round(side * 0.82);
    }
    return encodeToDataUrl(file, 800, 0.5);
  } catch {
    return fileToDataUrl(file);
  }
}

async function encodeToDataUrl(fileOrBitmap, maxSide, quality) {
  const bmp = fileOrBitmap instanceof Blob ? await loadBitmap(fileOrBitmap) : fileOrBitmap;
  const w = bmp.width || bmp.naturalWidth;
  const h = bmp.height || bmp.naturalHeight;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  const canvas = document.createElement("canvas");
  canvas.width = tw;
  canvas.height = th;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, tw, th);
  ctx.drawImage(bmp, 0, 0, tw, th);
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Given an image source (data URL) + a react-easy-crop pixel-crop area, return a
 * cropped, compressed (<2 MB) square/rect data URL.
 */
export async function getCroppedDataUrl(imageSrc, cropPixels, { maxBytes = MAX_UPLOAD_BYTES, outputSize = 640 } = {}) {
  const img = await loadImageSrc(imageSrc);
  const canvas = document.createElement("canvas");
  const size = outputSize;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(
    img,
    cropPixels.x, cropPixels.y, cropPixels.width, cropPixels.height,
    0, 0, size, size,
  );
  let quality = 0.9;
  for (let i = 0; i < 8; i += 1) {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrlBytes(dataUrl) <= maxBytes || quality <= 0.4) return dataUrl;
    quality -= 0.1;
  }
  return canvas.toDataURL("image/jpeg", 0.4);
}

// Load any image source (data URL / object URL / http URL) into an <img>.
function loadImageSrc(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/**
 * Compress (if image) then upload via the shared axios `api` instance with real
 * progress. `onProgress(pct)` receives 0-100. Enforces the app-wide 2 MB cap:
 * images are compressed to fit; non-images over 2 MB throw a clear error.
 * @returns the response `data`.
 */
export async function uploadImage(api, file, {
  url = "/media/upload", folder = "media", fields = {}, onProgress, compress = true, maxBytes = MAX_UPLOAD_BYTES,
} = {}) {
  const isImage = file && file.type && file.type.startsWith("image/");
  // SVG is a vector/text format: upload it AS-IS (no raster conversion) so it keeps
  // its exact format, full quality and transparent background (no black box). The
  // backend stores SVG unchanged (12 MB cap). Only raster images are compressed.
  const isSvg = !!file && (file.type === "image/svg+xml" || /\.svg$/i.test(file.name || ""));
  let finalFile = compress && isImage && !isSvg ? await compressImage(file) : file;
  // Hard enforce 2 MB. Images: keep shrinking until they fit. Non-images (SVG): pass through.
  if (!isSvg && finalFile.size > maxBytes) {
    if (isImage) {
      let side = 1400;
      let quality = 0.8;
      for (let i = 0; i < 6 && finalFile.size > maxBytes; i += 1) {
        finalFile = await compressImage(file, { maxSide: side, quality }); // eslint-disable-line no-await-in-loop
        if (quality > 0.5) quality -= 0.12; else side = Math.round(side * 0.82);
      }
    }
    if (finalFile.size > maxBytes) {
      throw new Error(`File is ${humanSize(finalFile.size)}. Maximum allowed is 2 MB.`);
    }
  }
  const fd = new FormData();
  fd.append("file", finalFile);
  if (folder) fd.append("folder", folder);
  Object.entries(fields).forEach(([k, v]) => fd.append(k, v));
  const { data } = await api.post(url, fd, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 120000,
    // Uploads (esp. SVG/large logos going to S3 on the live server) can be slow —
    // use a generous timeout so a slow round-trip is NOT surfaced as a false
    // "Connection issue / Upload failed" (which is what the default ~20s caused).
    timeout: 120000,
    onUploadProgress: (e) => {
      if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
    },
  });
  return data;
}
