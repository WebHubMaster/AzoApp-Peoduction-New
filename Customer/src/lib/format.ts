/** Same helpers as web_panel/src/lib/api.js (fmt / compact / fmtC). */
export const fmt = (n: any) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export const compact = (n: any) => {
  const num = Number(n) || 0;
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  const trim = (v: number) => v.toFixed(2).replace(/\.?0+$/, "");
  if (abs >= 1e9) return sign + trim(abs / 1e9) + "B";
  if (abs >= 1e6) return sign + trim(abs / 1e6) + "M";
  if (abs >= 1e3) return sign + trim(abs / 1e3) + "K";
  return sign + (Number.isInteger(abs) ? String(abs) : trim(abs));
};

export const fmtC = (n: any) => "\u20b9" + compact(n);

export const timeAgo = (iso?: string) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export const onlyDigits = (v: string, max?: number) => {
  const d = (v || "").replace(/[^0-9]/g, "");
  return max ? d.slice(0, max) : d;
};
export const onlyAlpha = (v: string) => (v || "").replace(/[^a-zA-Z\s.'-]/g, "");
export const isPhone10 = (v: string) => /^[6-9]\d{9}$/.test((v || "").trim());
export const isPincode6 = (v: string) => /^\d{6}$/.test((v || "").trim());
