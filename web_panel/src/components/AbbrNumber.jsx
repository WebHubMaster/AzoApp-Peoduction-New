import * as React from "react";
import { compact } from "@/lib/api";
import ExactHover from "@/components/ExactHover";

/**
 * AbbrNumber — shows a large number abbreviated (1K / 10.3K / 20.6M) and reveals
 * the exact value on hover (desktop) or tap (mobile), via ExactHover.
 */
export function abbr(value, { currency = false } = {}) {
  const c = compact(value);
  return currency ? "\u20b9" + c : c;
}

export default function AbbrNumber({
  value,
  currency = false,
  decimals = 2,
  prefix = "",
  suffix = "",
  className = "",
}) {
  const num = Number(value) || 0;
  const display = prefix + abbr(num, { currency }) + suffix;
  return (
    <ExactHover value={num} currency={currency} decimals={decimals} className={className}>
      <span>{display}</span>
    </ExactHover>
  );
}
