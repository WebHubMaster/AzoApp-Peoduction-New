import QrBookingPoster, { POSTER_SIZES, posterDims } from "@/components/qr/QrBookingPoster";

const LOGO = "data:image/svg+xml;utf8," + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='70'><text x='150' y='48' text-anchor='middle' font-family='Poppins,Arial' font-size='44' font-weight='900' fill='#0D47A1'>AzoApp</text></svg>`
);
const BRAND = { logo: LOGO, siteName: "AzoApp", tagline: "Service at Your Doorstep", primary: "#0D47A1", secondary: "#1565C0" };
const Q = { url: "https://example.com/?ref=DEMO123", token: "PQRC4R28M" };

export default function PosterDevTest() {
  return (
    <div style={{ padding: 24, background: "#e2e8f0", minHeight: "100vh" }}>
      <div style={{ display: "flex", gap: 32, alignItems: "flex-start", flexWrap: "wrap" }}>
        {Object.keys(POSTER_SIZES).map((k) => {
          const d = posterDims(k, 1);
          return (
            <div key={k} data-testid={`dev-poster-${k}`}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontFamily: "sans-serif" }}>{POSTER_SIZES[k].label}</div>
              <div style={{ width: d.canvasW, height: d.canvasH, background: "#fff", overflow: "hidden", boxShadow: "0 8px 24px rgba(0,0,0,.2)" }}>
                <QrBookingPoster qrValue={Q.url} token={Q.token} merchantName="" brand={BRAND} width={d.canvasW} height={d.canvasH} scale={d.scale} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
