import { QRCodeSVG } from "qrcode.react";
import { Lightbulb, AirVent, Cctv, Home, Refrigerator, ChevronRight } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// QrBookingPoster — THE single source of truth for the AzoApp booking poster.
//
// Used identically in:
//   • Merchant Panel → Scan QR (preview + PNG/JPG/PDF/Print/Share)
//   • Admin → QR Batches → Print poster (4×6) (preview + PDF/Print)
//
// Design principles that guarantee "preview == download == print":
//   1. FIXED coordinate system — the poster is always drawn on a fixed
//      BASE_W × BASE_H canvas (4×6 ratio). Nothing is measured or auto-fit,
//      so the layout is 100% deterministic.
//   2. A `scale` prop multiplies EVERY pixel value, so the exact same node can
//      be rendered tiny (preview) or full-size (export) with identical layout —
//      no CSS transform tricks that html2canvas mis-positions.
//   3. Vector QR (QRCodeSVG) → stays razor-sharp at any export DPI.
//   4. A safe inner padding keeps all important content away from the edges;
//      only decorative blobs bleed toward the edges (never clipped content).
// ─────────────────────────────────────────────────────────────────────────────

export const POSTER_BASE = { w: 384, h: 576, ratio: 384 / 576 };

// ─────────────────────────────────────────────────────────────────────────────
// SUPPORTED PHYSICAL POSTER SIZES — single source of truth for BOTH the admin
// QR-batch poster sheet AND the merchant Scan-QR poster. Every px value is the
// physical size at 96dpi (so 1px === 1/96in) which lets the browser map the
// captured node 1:1 to the paper when printing.
//   • 4×6 in  → 384×576 px  (ratio 0.667 — the poster's native design ratio)
//   • A6      → 105×148 mm → 397×559 px (ratio 0.710)
//   • A7      → 74×105 mm  → 280×397 px (ratio 0.705)
// The design ratios differ, so instead of letter-boxing (which leaves ugly white
// margins) we scale the WHOLE composition to FILL the paper width and let the
// flex `space-between` column re-distribute the three groups vertically. Result:
// same composition, zero whitespace, zero clipping, zero distortion at any size.
// ─────────────────────────────────────────────────────────────────────────────
export const POSTER_SIZES = {
  "4x6": { label: "4×6 in", w: 384, h: 576, page: "4in 6in", imgW: "4in", imgH: "6in", pdf: { unit: "in", format: [4, 6] } },
  a6: { label: "A6 (105×148mm)", w: 397, h: 559, page: "105mm 148mm", imgW: "105mm", imgH: "148mm", pdf: { unit: "mm", format: "a6" } },
  a7: { label: "A7 sticker (74×105mm)", w: 280, h: 397, page: "74mm 105mm", imgW: "74mm", imgH: "105mm", pdf: { unit: "mm", format: [74, 105] } },
};

// ─────────────────────────────────────────────────────────────────────────────
// SOCIAL MEDIA SIZES — used by the Merchant Scan-QR poster so partners can export
// a share-ready graphic sized for each platform. These have very different aspect
// ratios from the poster's native 2:3, so they render in FRAMED mode: the poster
// composition is scaled to FIT (min of width/height) and CENTERED on a branded
// gradient mat that fills the exact platform canvas — no clipping, no overlap.
// (Admin QR-batch paper sizes above are untouched and keep their fill-width look.)
// ─────────────────────────────────────────────────────────────────────────────
export const SOCIAL_SIZES = {
  ig_post: { label: "Instagram Post", short: "IG Post", w: 1080, h: 1350, social: true, page: "1080px 1350px", imgW: "1080px", imgH: "1350px", pdf: { unit: "px", format: [1080, 1350] } },
  ig_story: { label: "Instagram Story", short: "IG Story", w: 1080, h: 1920, social: true, page: "1080px 1920px", imgW: "1080px", imgH: "1920px", pdf: { unit: "px", format: [1080, 1920] } },
  fb_post: { label: "Facebook Post", short: "Facebook", w: 1200, h: 1500, social: true, page: "1200px 1500px", imgW: "1200px", imgH: "1500px", pdf: { unit: "px", format: [1200, 1500] } },
  wa_status: { label: "WhatsApp Status", short: "WhatsApp", w: 1080, h: 1920, social: true, page: "1080px 1920px", imgW: "1080px", imgH: "1920px", pdf: { unit: "px", format: [1080, 1920] } },
  square: { label: "Square Post", short: "Square", w: 1080, h: 1080, social: true, page: "1080px 1080px", imgW: "1080px", imgH: "1080px", pdf: { unit: "px", format: [1080, 1080] } },
};

// Compute the poster canvas + content scale for a given paper size.
// `m` is a render multiplier (1 = physical @96dpi for on-screen/print, >1 for
// high-DPI raster export). The content scale fills the paper WIDTH so no size is
// ever letter-boxed; the poster's own space-between layout fills the height.
export function posterDims(sizeKey, m = 1) {
  const ALL = { ...POSTER_SIZES, ...SOCIAL_SIZES };
  const conf = ALL[sizeKey] || POSTER_SIZES["4x6"];
  const key = ALL[sizeKey] ? sizeKey : "4x6";
  // Paper sizes fill the paper WIDTH (native look). Social sizes FIT inside the
  // canvas (min of both axes) so the poster is never clipped when the aspect
  // ratio differs a lot from the poster's native 2:3.
  const contentScale = conf.social
    ? Math.min(conf.w / POSTER_BASE.w, conf.h / POSTER_BASE.h)
    : conf.w / POSTER_BASE.w;
  return { conf, sizeKey: key, canvasW: conf.w * m, canvasH: conf.h * m, scale: contentScale * m };
}

// Append 8-bit hex alpha to a #RRGGBB colour for tints (e.g. "26" = ~15%).
const withAlpha = (hex, aa) =>
  typeof hex === "string" && /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}${aa}` : hex;

// Lighten/darken a hex colour by amt (−255..255).
const adjust = (hex, amt = 0) => {
  try {
    let h = (hex || "").replace("#", "").trim();
    if (h.length === 3) h = h.split("").map((c) => c + c).join("");
    if (h.length !== 6) return hex;
    const n = parseInt(h, 16);
    const r = Math.min(255, Math.max(0, (n >> 16) + amt));
    const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt));
    const b = Math.min(255, Math.max(0, (n & 0xff) + amt));
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  } catch { return hex; }
};

// Fixed brand service categories (part of the AzoApp poster identity).
const SERVICES = [
  { icon: Lightbulb, label: "Electrical\nWork" },
  { icon: AirVent, label: "AC Service\n& Repair" },
  { tools: false, icon: Refrigerator, label: "Home\nAppliances" },
  { icon: Cctv, label: "CCTV\nInstallation" },
  { icon: Home, label: "All Home\nServices" },
];

// Phone with inner scan brackets (CTA button glyph).
function ScanPhone({ size = 26, color = "#ffffff" }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} fill="none" stroke={color} strokeWidth={1.7}
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="8" y="3" width="16" height="26" rx="3" />
      <path d="M12.5 12.5v-1.5h1.5M18 11h1.5v1.5M19.5 18v1.5H18M14 19.5h-1.5V18" />
      <circle cx="16" cy="15.5" r="0.9" fill={color} stroke="none" />
    </svg>
  );
}

/**
 * @param {object} props
 * @param {string} props.qrValue      URL encoded by the QR (content NEVER changed here)
 * @param {string} [props.token]      code shown under the QR (merchant ref / sticker token)
 * @param {string} [props.merchantName] when present, shows the partner block prominently
 * @param {object} [props.brand]      { logo, siteName, tagline, primary, secondary }
 * @param {number} [props.scale]      multiplies every px value (1 = base 384×576)
 */
export default function QrBookingPoster({
  qrValue = "",
  token = "",
  merchantName = "",
  brand = {},
  scale = 1,
  trustLine = "Trusted Home Services",
  width,
  height,
  framed = false,
}) {
  const S = (n) => n * scale;
  const px = (n) => `${S(n)}px`;
  // Final canvas pixels. When width/height are supplied (size-aware callers) the
  // poster FILLS that exact paper canvas; otherwise it falls back to the native
  // 4×6 base × scale (backward compatible with older callers).
  const canvasW = width != null ? width : POSTER_BASE.w * scale;
  const canvasH = height != null ? height : POSTER_BASE.h * scale;
  // In FRAMED (social) mode the poster body keeps its native 2:3 composition
  // (BASE × scale) and is centered on a branded mat that fills the platform
  // canvas. In paper mode the body IS the canvas (unchanged legacy behaviour).
  const bodyW = framed ? POSTER_BASE.w * scale : canvasW;
  const bodyH = framed ? POSTER_BASE.h * scale : canvasH;

  const primary = brand.primary && /^#[0-9a-fA-F]{6}$/.test(brand.primary) ? brand.primary : "#0D47A1";
  const secondary = brand.secondary && /^#[0-9a-fA-F]{6}$/.test(brand.secondary) ? brand.secondary : adjust(primary, 46);
  const logo = brand.logo || "";
  const siteName = brand.siteName || "AzoApp";

  const pale = withAlpha(primary, "14");     // ~8%  icon circles / soft blobs
  const paleSoft = withAlpha(primary, "0F"); // ~6%  large soft accents
  const line = withAlpha(primary, "2B");     // separators / footer rules

  const qrSize = 156;

  const card = (
    <div
      className="qr-poster"
      style={{
        width: `${bodyW}px`,
        height: `${bodyH}px`,
        background: "#FFFFFF",
        position: "relative",
        overflow: "hidden",
        boxSizing: "border-box",
        borderRadius: framed ? px(30) : 0,
        boxShadow: framed ? "0 24px 70px rgba(2,20,50,0.28)" : "none",
        fontFamily: "'Poppins','Segoe UI',system-ui,-apple-system,sans-serif",
      }}
    >
      {/* ── decorative shapes (bleed toward edges, always behind content) ── */}
      <div style={{ position: "absolute", top: px(-70), left: px(-70), width: px(150), height: px(150), borderRadius: "50%", background: `linear-gradient(135deg, ${primary}, ${secondary})` }} />
      <div style={{ position: "absolute", bottom: px(-198), right: px(-95), width: px(244), height: px(244), borderRadius: "50%", background: paleSoft }} />
      <div style={{ position: "absolute", bottom: px(-176), right: px(-70), width: px(206), height: px(206), borderRadius: "50%", background: `linear-gradient(135deg, ${secondary}, ${primary})` }} />
      <div style={{ position: "absolute", bottom: px(-110), left: px(-72), width: px(150), height: px(150), borderRadius: "50%", background: pale }} />

      {/* top-right big corner circle (bleeds off the corner) with the script tagline
          centred in its visible area. Absolute positioning + safe right margin so it
          never clips on export. */}
      <div style={{ position: "absolute", top: px(-42), right: px(-42), width: px(172), height: px(172), borderRadius: "50%", background: pale, zIndex: 1 }} />
      <div style={{ position: "absolute", top: px(28), right: px(10), width: px(120), textAlign: "center", color: primary, fontStyle: "italic", fontFamily: "'Segoe Script','Brush Script MT',cursive", lineHeight: 1.18, zIndex: 2 }}>
        <div style={{ fontSize: px(13) }}>Your Home</div>
        <div style={{ fontSize: px(13), fontWeight: 700 }}>Our Priority</div>
      </div>

      {/* ── content: four groups EVENLY distributed to fill the poster height for
          ANY aspect ratio (space-between → no single awkward gap). Deterministic
          (no flex-grow / no measuring) so html2canvas export == preview. ── */}
      <div style={{ position: "relative", zIndex: 1, height: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", justifyContent: "space-between", alignItems: "center", padding: `${px(30)} ${px(24)} ${px(16)}` }}>
        {/* GROUP 1 — brand (logo → partner → merchant name → trust line) */}
        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
          {logo ? (
            <img src={logo} alt={siteName} crossOrigin="anonymous"
              style={{ height: px(46), maxWidth: px(280), width: "auto", objectFit: "contain", display: "block" }} />
          ) : (
            <div style={{ fontSize: px(64), fontWeight: 900, letterSpacing: px(-2), color: primary, lineHeight: 0.95 }}>{siteName}</div>
          )}

          {merchantName ? (
            <>
              <div style={{ marginTop: px(8), fontSize: px(9), fontWeight: 800, letterSpacing: px(2), textTransform: "uppercase", color: withAlpha(primary, "B3") }}>
                {siteName} Partner
              </div>
              <div style={{ marginTop: px(2), fontSize: px(21), fontWeight: 900, color: "#1F2A3A", lineHeight: 1.05, textAlign: "center", maxWidth: px(300) }}>
                {merchantName}
              </div>
            </>
          ) : null}

          {/* Trusted Home Services — centred sub-label */}
          {trustLine ? (
            <div style={{ marginTop: px(merchantName ? 3 : 0), width: "100%", textAlign: "center", whiteSpace: "nowrap" }}>
              <span style={{ display: "inline-block", verticalAlign: "middle", width: px(18), height: px(2), borderRadius: px(2), background: primary, marginRight: px(8) }} />
              <span style={{ verticalAlign: "middle", fontSize: px(12), fontWeight: 700, letterSpacing: px(0.3), color: primary }}>{trustLine}</span>
              <span style={{ display: "inline-block", verticalAlign: "middle", width: px(18), height: px(2), borderRadius: px(2), background: primary, marginLeft: px(8) }} />
            </div>
          ) : null}
        </div>

        {/* GROUP 2 — QR card + token */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <div style={{ position: "relative", background: "#fff", borderRadius: px(22), padding: px(17), boxShadow: `0 10px 26px ${withAlpha(primary, "26")}` }}>
            {[
              { top: px(10), left: px(10), br: `${px(4)} 0 0 0`, sides: ["top", "left"] },
              { top: px(10), right: px(10), br: `0 ${px(4)} 0 0`, sides: ["top", "right"] },
              { bottom: px(10), left: px(10), br: `0 0 0 ${px(4)}`, sides: ["bottom", "left"] },
              { bottom: px(10), right: px(10), br: `0 0 ${px(4)} 0`, sides: ["bottom", "right"] },
            ].map((c, i) => (
              <span key={i} style={{
                position: "absolute", width: px(28), height: px(28),
                borderTop: c.sides.includes("top") ? `${px(5)} solid ${secondary}` : "none",
                borderBottom: c.sides.includes("bottom") ? `${px(5)} solid ${secondary}` : "none",
                borderLeft: c.sides.includes("left") ? `${px(5)} solid ${secondary}` : "none",
                borderRight: c.sides.includes("right") ? `${px(5)} solid ${secondary}` : "none",
                borderRadius: c.br,
                top: c.top, bottom: c.bottom, left: c.left, right: c.right,
              }} />
            ))}
            <QRCodeSVG value={qrValue} size={S(qrSize)} level="M" includeMargin={false} bgColor="#ffffff" fgColor="#0f172a" style={{ display: "block" }} />
          </div>

          {token ? (
            <div style={{ marginTop: px(6), fontFamily: "monospace", fontSize: px(10), letterSpacing: px(1), color: "#B4BECC" }}>{token}</div>
          ) : null}
        </div>

        {/* GROUP 3 — CTA button (absolute internals → export-safe) */}
        <div style={{ width: "100%", textAlign: "center" }}>
          <div style={{ position: "relative", display: "inline-block", width: px(324), maxWidth: "100%", height: px(64), background: `linear-gradient(180deg, ${adjust(primary, 34)}, ${primary})`, color: "#fff", borderRadius: px(50), boxShadow: `0 12px 26px ${withAlpha(primary, "59")}`, verticalAlign: "middle" }}>
            <span style={{ position: "absolute", left: px(9), top: px(9), height: px(46), width: px(46), borderRadius: "50%", background: "#ffffff", boxShadow: "0 2px 6px rgba(2,32,71,0.18)" }}>
              <span style={{ position: "absolute", left: px(10), top: px(10) }}><ScanPhone size={S(26)} color={primary} /></span>
            </span>
            <span style={{ position: "absolute", left: px(64), top: px(16), width: px(1.5), height: px(32), background: "rgba(255,255,255,0.5)" }} />
            <span style={{ position: "absolute", left: 0, right: 0, top: px(15) }}>
              <span style={{ display: "block", textAlign: "center", fontSize: px(16), fontWeight: 800, whiteSpace: "nowrap", lineHeight: 1.1 }}>Scan to Book a Service</span>
              <span style={{ display: "block", textAlign: "center", fontSize: px(9), fontWeight: 600, letterSpacing: px(0.5), color: "rgba(255,255,255,0.82)", marginTop: px(2), whiteSpace: "nowrap" }}>Fast  •  Easy  •  Trusted</span>
            </span>
            <span style={{ position: "absolute", right: px(9), top: px(11), height: px(42), width: px(42), borderRadius: "50%", background: "rgba(255,255,255,0.22)" }}>
              <span style={{ position: "absolute", left: px(9.5), top: px(9.5) }}><ChevronRight style={{ width: px(23), height: px(23) }} strokeWidth={2.8} /></span>
            </span>
          </div>
        </div>

        {/* GROUP 4 — services + footer */}
        <div style={{ width: "100%", textAlign: "center" }}>
          <div style={{ width: "100%", textAlign: "center", fontSize: 0 }}>
            {SERVICES.map((s, i) => (
              <div key={i} style={{ display: "inline-block", verticalAlign: "top", width: px(63), textAlign: "center" }}>
                <div style={{ width: px(44), height: px(44), margin: "0 auto", borderRadius: "50%", background: pale, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <s.icon style={{ width: px(23), height: px(23), color: primary }} strokeWidth={1.9} />
                </div>
                <div style={{ marginTop: px(6), fontSize: px(9.5), fontWeight: 700, color: "#2C3A4B", textAlign: "center", whiteSpace: "pre-line", lineHeight: 1.14 }}>{s.label}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: px(12), width: "100%", textAlign: "center" }}>
            <span style={{ fontSize: px(8.5), fontWeight: 700, letterSpacing: px(1.6), color: withAlpha(primary, "B3"), whiteSpace: "nowrap" }}>— BETTER HOMES BRIGHTER TOMORROW —</span>
          </div>
        </div>
      </div>
    </div>
  );

  if (!framed) return card;

  // FRAMED (social): center the native poster card on a branded gradient mat
  // that fills the exact platform canvas (e.g. 1080×1350). Nothing is clipped.
  return (
    <div
      style={{
        width: `${canvasW}px`,
        height: `${canvasH}px`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: `linear-gradient(135deg, ${primary}, ${secondary})`,
        overflow: "hidden",
        boxSizing: "border-box",
      }}
    >
      {card}
    </div>
  );
}
