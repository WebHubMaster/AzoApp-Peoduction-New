import { forwardRef, useLayoutEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { TEMPLATES, POSTER_SIZES, resolveTheme } from "@/pages/merchant/scanqr/qrData";

const QR_PCT = { small: 0.32, medium: 0.42, large: 0.52 };

// Renders the branded poster. `scale` multiplies the base 1080px design width
// so the same node can be shown small on-screen and captured at high-res.
// Preview, print, download and share ALL use this same node → identical output.
//
// Instead of a CSS transform (which html2canvas mis-positions on download), we
// shrink the REAL element sizes via a `density` factor until everything fits.
// The content is then vertically centered by flexbox — which html2canvas renders
// correctly — so the downloaded image is perfectly centred and never clipped.
const PosterCanvas = forwardRef(function PosterCanvas({ config, qrValue, code, businessName, scale = 1 }, ref) {
  const tpl = TEMPLATES.find((t) => t.id === config.template) || TEMPLATES[0];
  const size = POSTER_SIZES.find((s) => s.id === config.posterSize) || POSTER_SIZES[0];
  const th = resolveTheme(tpl, config.primary);
  const show = config.show || {};
  const isRow = config.qrPosition === "left" || config.qrPosition === "right";

  const BASE = 1080;
  const OUTER_PAD = 56; // fixed outer padding (base px), keeps a clean margin

  const innerRef = useRef(null);
  const [density, setDensity] = useState(1);

  const px = (n) => `${n * scale}px`;
  const S = (n) => Math.round(n * (size.w / BASE) * density); // sizes shrink with density
  const qrPx = Math.round(size.w * (QR_PCT[config.qrSize] || 0.42) * density);

  // Auto-fit by adjusting real sizes so content fits the available height.
  useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const avail = (size.h - OUTER_PAD * 2) * scale;
    const natural = el.scrollHeight;
    if (!natural) return;
    // 0.97 leaves a little breathing room so it looks nicely centred, not edge-to-edge
    const target = Math.min(1, density * ((avail * 0.97) / natural));
    if (Math.abs(target - density) > 0.01) setDensity(target);
  }, [config, size.h, size.w, scale, qrValue, businessName, density]);

  const Logo = show.logo && config.logoUrl ? (
    <div style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: "#ffffff", borderRadius: px(S(24)),
      padding: `${px(S(16))} ${px(S(26))}`,
      boxShadow: "0 12px 30px rgba(0,0,0,.16)",
    }}>
      <img src={config.logoUrl} alt="logo" crossOrigin="anonymous"
        style={{ height: px(S(96)), width: "auto", maxWidth: px(S(340)), objectFit: "contain", display: "block" }} />
    </div>
  ) : null;

  const QrBlock = (
    <div style={{
      background: "#ffffff", borderRadius: px(S(26)), padding: px(S(20)),
      boxShadow: "0 20px 46px rgba(0,0,0,.20)", display: "inline-flex",
    }}>
      <QRCodeSVG value={qrValue} size={qrPx * scale} level="M" includeMargin={false}
        bgColor="#ffffff" fgColor="#0b1220" />
    </div>
  );

  const TopBrand = Logo && (
    <div style={{ display: "flex", justifyContent: isRow ? "flex-start" : "center", marginBottom: px(S(22)) }}>{Logo}</div>
  );

  const Header = (
    <div style={{ textAlign: isRow ? "left" : "center" }}>
      {!th.minimal && (
        <div style={{ color: th.mode === "dark" ? "rgba(255,255,255,.85)" : th.primary, fontWeight: 800, letterSpacing: 2, fontSize: px(S(17)), marginBottom: px(S(12)), textTransform: "uppercase" }}>AzoApp Partner</div>
      )}
      <div style={{ color: th.fg, fontWeight: 900, fontSize: px(S(58)), lineHeight: 1.05, letterSpacing: -0.5 }}>{businessName}</div>
      {show.tagline && config.tagline && (
        <div style={{ color: th.sub, fontWeight: 600, fontSize: px(S(27)), marginTop: px(S(8)) }}>{config.tagline}</div>
      )}
      <div style={{ height: px(S(5)), width: px(S(110)), background: th.bar, borderRadius: px(S(999)), margin: `${px(S(16))} ${isRow ? "0" : "auto"} 0` }} />
    </div>
  );

  const Body = (
    <div style={{ textAlign: isRow ? "left" : "center", marginTop: px(S(22)) }}>
      <div style={{ color: th.accent === "#ffffff" ? th.fg : th.accent, fontWeight: 900, fontSize: px(S(40)) }}>{config.headline}</div>
      {config.subheadline && <div style={{ color: th.sub, fontWeight: 500, fontSize: px(S(25)), marginTop: px(S(6)) }}>{config.subheadline}</div>}
    </div>
  );

  const Footer = null;

  const Content = isRow ? (
    <>
      {TopBrand}
      <div style={{ display: "flex", gap: px(S(44)), alignItems: "center", flexDirection: config.qrPosition === "left" ? "row" : "row-reverse" }}>
        <div style={{ flexShrink: 0 }}>{QrBlock}</div>
        <div style={{ flex: 1, minWidth: 0 }}>{Header}{Body}{Footer}</div>
      </div>
    </>
  ) : (
    <>
      {TopBrand}
      {config.qrPosition === "top" && <div style={{ display: "flex", justifyContent: "center", marginBottom: px(S(24)) }}>{QrBlock}</div>}
      {Header}
      {config.qrPosition === "center" && <div style={{ display: "flex", justifyContent: "center", margin: `${px(S(24))} 0` }}>{QrBlock}</div>}
      {Body}
      {config.qrPosition === "bottom" && <div style={{ display: "flex", justifyContent: "center", margin: `${px(S(24))} 0` }}>{QrBlock}</div>}
      {Footer}
    </>
  );

  return (
    <div ref={ref} data-testid="poster-canvas" style={{
      width: px(size.w), height: px(size.h), background: th.bg, color: th.fg,
      padding: px(OUTER_PAD), boxSizing: "border-box", overflow: "hidden",
      display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center",
      fontFamily: "'Poppins','Inter',system-ui,sans-serif", position: "relative",
    }}>
      {th.deco && (
        <>
          <div style={{ position: "absolute", top: px(-S(140)), right: px(-S(120)), width: px(S(380)), height: px(S(380)), borderRadius: "50%", background: th.deco.c1 }} />
          <div style={{ position: "absolute", bottom: px(-S(160)), left: px(-S(140)), width: px(S(440)), height: px(S(440)), borderRadius: "50%", background: th.deco.c2 }} />
        </>
      )}
      {th.band && !th.minimal && (
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: px(S(14)), background: th.bar }} />
      )}
      <div ref={innerRef} style={{ position: "relative", zIndex: 1, width: "100%" }}>
        {Content}
      </div>
    </div>
  );
});

export default PosterCanvas;
