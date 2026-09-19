"""Decimal-safe money helpers (spec #21).

All financial arithmetic should use these so we never accumulate binary floating
point error (e.g. 0.1 + 0.2 == 0.30000000000000004). Amounts are rupees rounded to
2 decimals using ROUND_HALF_UP (standard accounting rounding). We return plain
floats so existing JSON serialization / Mongo storage is unchanged — the guarantee
is that the *value* is computed exactly and rounded deterministically.
"""
from decimal import Decimal, ROUND_HALF_UP

TAX_LABEL = "Est. Govt. Taxes"

TWO = Decimal("0.01")


def D(x) -> Decimal:
    """Coerce any number/str/None to a Decimal safely (via str to avoid float noise)."""
    if x is None or x == "":
        return Decimal("0")
    if isinstance(x, Decimal):
        return x
    return Decimal(str(x))


def money(x) -> float:
    """Round an amount to 2-decimal rupees (ROUND_HALF_UP) and return a float."""
    return float(D(x).quantize(TWO, rounding=ROUND_HALF_UP))


def pct(amount, percent) -> float:
    """amount * percent% → 2-decimal rupees, computed in Decimal."""
    return float((D(amount) * D(percent) / Decimal("100")).quantize(TWO, rounding=ROUND_HALF_UP))


def add(*amounts) -> float:
    """Sum amounts exactly in Decimal, then round to 2 dp."""
    total = Decimal("0")
    for a in amounts:
        total += D(a)
    return float(total.quantize(TWO, rounding=ROUND_HALF_UP))
