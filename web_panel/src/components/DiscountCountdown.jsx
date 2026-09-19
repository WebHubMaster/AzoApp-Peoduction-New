import React, { useEffect, useState } from "react";
import { Clock } from "lucide-react";

function fmtRemain(ms) {
  if (ms <= 0) return null;
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  const sec = s % 60;
  return `${m}m ${sec}s`;
}

/**
 * DiscountCountdown — live "ends in 2d 4h" timer for a limited-time offer.
 * `until` is a YYYY-MM-DD date (offer valid through end of that day).
 * Renders nothing if no date or already expired.
 */
export default function DiscountCountdown({ until, className = "" }) {
  const end = until ? new Date(`${until}T23:59:59`).getTime() : null;
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!end) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [end]);
  if (!end) return null;
  const label = fmtRemain(end - now);
  if (!label) return null;
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold text-rose-600 ${className}`}>
      <Clock className="h-3 w-3" /> ends in {label}
    </span>
  );
}
