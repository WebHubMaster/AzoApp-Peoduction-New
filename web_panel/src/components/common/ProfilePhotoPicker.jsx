import React, { useRef, useState } from "react";
import { Camera, User as UserIcon } from "lucide-react";
import { toast } from "sonner";
import ImageCropperDialog from "@/components/common/ImageCropperDialog";
import { fileToDataUrl } from "@/lib/imageUpload";

/**
 * Reusable profile-picture widget used in EVERY panel (customer, partner,
 * merchant, admin). Flow: pick file → validate it is an image → crop (square) →
 * auto-compress under 2 MB → onChange(dataUrl).
 *
 * Props:
 *   value      current photo (data URL or http URL)
 *   onChange(dataUrl)
 *   disabled   when true the camera button is hidden (e.g. not applicable)
 *   size       px diameter of the avatar (default 80)
 *   testId
 */
export default function ProfilePhotoPicker({ value, onChange, disabled = false, size = 80, testId = "profile-photo" }) {
  const inputRef = useRef(null);
  const [rawSrc, setRawSrc] = useState(null);
  const [cropOpen, setCropOpen] = useState(false);

  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file) return;
    if (!file.type || !file.type.startsWith("image/")) {
      toast.error("Please select an image file (JPG or PNG).");
      return;
    }
    fileToDataUrl(file)
      .then((src) => { setRawSrc(src); setCropOpen(true); })
      .catch(() => toast.error("Could not read that image. Try another one."));
  };

  const onCropped = (dataUrl) => {
    setCropOpen(false);
    setRawSrc(null);
    onChange?.(dataUrl);
    toast.success("Photo ready — don't forget to save.");
  };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="rounded-full bg-primary-50 dark:bg-primary-900/30 overflow-hidden grid place-items-center border border-slate-200 dark:border-slate-700"
        style={{ width: size, height: size }}
      >
        {value
          ? <img src={value} alt="avatar" className="h-full w-full object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
          : <UserIcon className="text-primary-700" style={{ height: size * 0.4, width: size * 0.4 }} />}
      </div>
      {!disabled && (
        <label
          className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full bg-primary-700 hover:bg-primary-800 text-white grid place-items-center cursor-pointer shadow-md"
          data-testid={`${testId}-label`}
          title="Change photo"
        >
          <Camera className="h-4 w-4" />
          <input ref={inputRef} data-testid={`${testId}-input`} type="file" accept="image/*" className="hidden" onChange={pick} />
        </label>
      )}
      <ImageCropperDialog
        open={cropOpen}
        imageSrc={rawSrc}
        onCancel={() => { setCropOpen(false); setRawSrc(null); }}
        onCropped={onCropped}
      />
    </div>
  );
}
