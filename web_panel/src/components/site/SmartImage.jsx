import React, { useState, useMemo } from "react";

/*
  SmartImage — fast, smooth image loading on any network.
  - Fills its parent (parent must set the size / aspect-ratio & overflow-hidden).
  - Shows a lightweight skeleton shimmer until the image decodes.
  - Fades the image in on load (no janky pop-in), even on very slow networks.
  - loading="lazy" + decoding="async" so off-screen images never block the UI.
  - Auto-optimizes known CDNs (Pexels/Unsplash/Cloudinary) by requesting a
    right-sized, compressed variant + a responsive srcset — this is what makes
    images load fast on slow / 3G networks (tiny payloads instead of full-res).
  Pass hover / scale utility classes via `className` (applied to the <img>).
*/

// Build an optimized URL for supported CDNs at a target display width.
function optimize(src, w) {
  if (!src || typeof src !== "string") return src;
  try {
    // Skip data URIs / local uploads (already small / not resizable).
    if (src.startsWith("data:") || src.startsWith("blob:")) return src;
    const u = new URL(src, typeof window !== "undefined" ? window.location.origin : "http://x");
    const host = u.hostname;

    if (host.includes("images.pexels.com")) {
      u.searchParams.set("auto", "compress");
      u.searchParams.set("cs", "tinysrgb");
      u.searchParams.set("dpr", "1");
      u.searchParams.set("w", String(w));
      return u.toString();
    }
    if (host.includes("images.unsplash.com")) {
      u.searchParams.set("auto", "format");
      u.searchParams.set("fit", "crop");
      u.searchParams.set("q", "70");
      u.searchParams.set("w", String(w));
      return u.toString();
    }
    if (host.includes("res.cloudinary.com") && u.pathname.includes("/upload/")) {
      return src.replace("/upload/", `/upload/f_auto,q_auto,w_${w}/`);
    }
    return src;
  } catch {
    return src;
  }
}

export default function SmartImage({
  src,
  alt = "",
  className = "",
  eager = false,
  width = 640, // target display width (px) used to size the CDN request
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 320px",
  ...rest
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  const { finalSrc, srcSet } = useMemo(() => {
    const base = optimize(src, width);
    // Only build a srcset for resizable CDNs (optimize returns a changed URL).
    const resizable = base !== src;
    if (!resizable) return { finalSrc: src, srcSet: undefined };
    const widths = [Math.round(width * 0.5), width, Math.round(width * 1.5), width * 2];
    const uniq = [...new Set(widths.filter((n) => n > 0))];
    const set = uniq.map((wv) => `${optimize(src, wv)} ${wv}w`).join(", ");
    return { finalSrc: base, srcSet: set };
  }, [src, width]);

  return (
    <>
      {(!loaded || errored) && (
        <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-slate-100 to-slate-200" aria-hidden="true" />
      )}
      {src && !errored && (
        <img
          src={finalSrc}
          srcSet={srcSet}
          sizes={srcSet ? sizes : undefined}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          fetchPriority={eager ? "high" : "low"}
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setErrored(true)}
          className={`relative h-full w-full object-cover transition-opacity duration-500 ease-out ${loaded ? "opacity-100" : "opacity-0"} ${className}`}
          {...rest}
        />
      )}
    </>
  );
}
