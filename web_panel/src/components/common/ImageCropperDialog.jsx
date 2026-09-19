import React, { useCallback, useState } from "react";
import Cropper from "react-easy-crop";
import { X, ZoomIn, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getCroppedDataUrl } from "@/lib/imageUpload";

/**
 * Reusable image crop dialog (used for ALL profile-picture changes across every
 * panel). Crops to a 1:1 square and returns a compressed (<2 MB) JPEG data URL.
 *
 * Props:
 *   open        boolean
 *   imageSrc    data URL of the picked image
 *   onCancel()  close without saving
 *   onCropped(dataUrl)  called with the final cropped+compressed data URL
 *   aspect      crop aspect ratio (default 1 = square)
 *   title       header text
 */
export default function ImageCropperDialog({ open, imageSrc, onCancel, onCropped, aspect = 1, title = "Adjust your photo" }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [areaPixels, setAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);

  const onCropComplete = useCallback((_area, areaPx) => setAreaPixels(areaPx), []);

  const confirm = async () => {
    if (!areaPixels) return;
    setBusy(true);
    try {
      const dataUrl = await getCroppedDataUrl(imageSrc, areaPixels, { outputSize: 640 });
      onCropped?.(dataUrl);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-4" data-testid="image-cropper-dialog">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
          <h3 className="font-heading font-bold text-slate-900 dark:text-white">{title}</h3>
          <button onClick={onCancel} className="h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800" data-testid="cropper-close"><X className="h-4 w-4" /></button>
        </div>
        <div className="relative w-full bg-slate-950" style={{ height: 320 }}>
          {imageSrc && (
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={aspect}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          )}
        </div>
        <div className="px-5 py-4 space-y-4">
          <div className="flex items-center gap-3">
            <ZoomIn className="h-4 w-4 text-slate-400 shrink-0" />
            <input
              type="range" min={1} max={3} step={0.01} value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              data-testid="cropper-zoom"
              className="w-full accent-primary-700"
              aria-label="Zoom"
            />
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-11 rounded-xl" onClick={onCancel} data-testid="cropper-cancel">Cancel</Button>
            <Button className="flex-1 h-11 rounded-xl bg-primary-700 hover:bg-primary-800" onClick={confirm} disabled={busy || !areaPixels} data-testid="cropper-apply">
              {busy ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Check className="h-4 w-4 mr-1" />} Apply
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
