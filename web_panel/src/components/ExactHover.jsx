import * as React from "react";

// Exact value with thousands grouping (international, matches K/M abbreviation).
export function exactValue(value, { currency = false, decimals = 2 } = {}) {
  const num = Number(value) || 0;
  const s = num.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  return currency ? "\u20b9" + s : s;
}

/**
 * ExactHover — wraps an already-formatted (possibly abbreviated) number and
 * reveals the exact value on hover (desktop) or tap (mobile).
 *
 * Lightweight, self-contained tooltip (no Radix) so hover-out and tap-toggle
 * always behave correctly:
 *  - Desktop: mouse enter shows, mouse leave hides.
 *  - Mobile: tap toggles; tapping elsewhere closes it.
 * Only activates when the underlying value is >= 1000 (actually abbreviated);
 * otherwise it renders children untouched.
 */
export default function ExactHover({
  value,
  currency = false,
  decimals = 2,
  children,
  className = "",
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);
  const num = Number(value) || 0;

  const active = typeof value === "number" && Math.abs(num) >= 1000;

  // Close on outside tap / Escape (mobile).
  React.useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDoc, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDoc, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  if (!active) return children;

  const full = exactValue(num, { currency, decimals });

  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <span
        role="button"
        tabIndex={0}
        aria-label={full}
        className={
          "cursor-help underline decoration-dotted decoration-1 underline-offset-2 " +
          className
        }
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
      >
        {children}
      </span>
      {open && (
        <span
          role="tooltip"
          className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-slate-900 px-2.5 py-1 text-xs font-semibold tabular-nums text-white shadow-lg dark:bg-slate-700"
        >
          {full}
          <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900 dark:border-t-slate-700" />
        </span>
      )}
    </span>
  );
}

// Compact abbreviation (1K / 10.3K / 20.6M) — max 2 decimals, trailing zeros stripped.
function compactNum(n) {
  const num = Number(n) || 0;
  const sign = num < 0 ? "-" : "";
  const abs = Math.abs(num);
  const trim = (v) => v.toFixed(2).replace(/\.?0+$/, "");
  if (abs >= 1e9) return sign + trim(abs / 1e9) + "B";
  if (abs >= 1e6) return sign + trim(abs / 1e6) + "M";
  if (abs >= 1e3) return sign + trim(abs / 1e3) + "K";
  return sign + (Number.isInteger(abs) ? String(abs) : trim(abs));
}

/**
 * StatValue — drop-in smart renderer for headline stat values. Accepts either a
 * raw number or an already-formatted string (e.g. "₹1,23,456", "10,300").
 * Large magnitudes (>= 1000) are abbreviated (₹5.27K / 20.6M) with the exact
 * value revealed on hover/tap; everything else renders unchanged.
 */
export function StatValue({ value, className = "" }) {
  if (value === null || value === undefined || value === "") {
    return <span className={className}>—</span>;
  }
  if (typeof value === "number") {
    return (
      <ExactHover value={value} className={className}>
        <span>{compactNum(value)}</span>
      </ExactHover>
    );
  }
  const str = String(value);
  const m = str.match(/^\s*(₹|Rs\.?\s*|\$)?\s*(-?[\d,]+(?:\.\d+)?)\s*$/);
  if (m) {
    const rawSym = (m[1] || "").trim();
    const isRupee = rawSym.includes("₹") || /^Rs/i.test(rawSym);
    const num = parseFloat(m[2].replace(/,/g, ""));
    if (!Number.isNaN(num) && Math.abs(num) >= 1000) {
      const symbol = rawSym ? (isRupee ? "\u20b9" : rawSym) : "";
      return (
        <ExactHover value={num} currency={isRupee} className={className}>
          <span>{symbol + compactNum(num)}</span>
        </ExactHover>
      );
    }
  }
  return <span className={className}>{str}</span>;
}
