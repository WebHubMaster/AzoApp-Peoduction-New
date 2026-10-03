import React, { useState, useRef, useEffect } from "react";
import { Info } from "lucide-react";
import { useSiteConfig } from "@/context/SiteConfigContext";

/**
 * Small ⓘ icon shown next to "Tax" / "Platform Fee". Hovering (desktop) or tapping
 * (mobile) reveals an admin-configured info tooltip; moving away / tapping elsewhere
 * auto-hides it. Content comes from General Settings → Fees & Taxes (public site
 * config `fee_info`). Renders nothing when no info text is configured.
 *
 * `kind` = "tax" | "platform_fee"
 */
export default function FeeInfoTip({ kind = "tax", text: textProp }) {
  const cfg = useSiteConfig();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const text = (textProp || (cfg?.fee_info || {})[kind] || "").trim();

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  if (!text) return null;

  return (
    <span className="relative inline-flex items-center align-middle ml-1" ref={ref}
      onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button type="button" aria-label={`${kind === "tax" ? "Tax" : "Platform fee"} info`}
        data-testid={`fee-info-${kind}`}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="text-slate-400 hover:text-primary-600 transition-colors">
        <Info className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span role="tooltip" data-testid={`fee-info-tip-${kind}`}
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 max-w-[70vw] z-50
                     rounded-lg bg-slate-900 text-white text-[11px] leading-snug font-normal
                     px-3 py-2 shadow-xl normal-case tracking-normal">
          {text}
          <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-slate-900" />
        </span>
      )}
    </span>
  );
}
