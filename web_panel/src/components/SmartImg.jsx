import { useState, useEffect } from "react";
import { mediaSrc } from "@/lib/api";

/**
 * Resilient <img> for admin media/avatars. Two permanent fixes for the
 * "image sometimes shows, sometimes broken" problem:
 *  1. Resolves RELATIVE backend URLs ("/api/media/...") against the backend
 *     origin via mediaSrc(), so they load even when the panel host differs
 *     from the backend host.
 *  2. On load error (missing file, transient failure) it renders `fallback`
 *     (initials / icon) instead of leaving a broken-image icon forever.
 *
 * Pass `fallback` as the node to show when there is no src OR the image fails.
 */
export default function SmartImg({ src, alt = "", className = "", fallback = null, ...rest }) {
  const resolved = mediaSrc(src);
  const [failed, setFailed] = useState(false);
  // Reset the error flag whenever the source changes (new row, updated photo).
  useEffect(() => { setFailed(false); }, [resolved]);

  if (!resolved || failed) return fallback;
  return (
    <img
      src={resolved}
      alt={alt}
      className={className}
      loading="lazy"
      onError={() => setFailed(true)}
      {...rest}
    />
  );
}
