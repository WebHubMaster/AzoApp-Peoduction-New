/** Currency + number formatting shared with the web panel behaviour. */
export const fmt = (n: number | undefined | null) =>
  "₹" +
  Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const compact = (n: number | undefined | null) => {
  const num = Number(n) || 0;
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  const trim = (v: number) => v.toFixed(2).replace(/\.?0+$/, "");
  if (abs >= 1e9) return sign + trim(abs / 1e9) + "B";
  if (abs >= 1e6) return sign + trim(abs / 1e6) + "M";
  if (abs >= 1e3) return sign + trim(abs / 1e3) + "K";
  return sign + (Number.isInteger(abs) ? String(abs) : trim(abs));
};

export const fmtC = (n: number | undefined | null) => "₹" + compact(n);

export function timeAgo(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso).getTime();
  if (isNaN(d)) return "";
  const s = Math.floor((Date.now() - d) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function fmtDate(iso?: string): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

export function initials(name?: string): string {
  if (!name) return "?";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
}
