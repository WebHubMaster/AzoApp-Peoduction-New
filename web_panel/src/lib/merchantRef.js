/**
 * Merchant referral / QR-code plumbing.
 *
 * Flow:
 *  1. A merchant shares a link like `https://azoapp.example/?ref=PN2E62W` (or a
 *     printed QR that resolves to that URL).
 *  2. When a customer's browser loads ANY page of AzoApp with `?ref=CODE` in
 *     the query string, we persist the code to `localStorage` under
 *     `azo_merchant_ref` (30-day TTL).
 *  3. Every booking creation payload includes `merchant_ref_code` from that
 *     store, so the backend can tag the booking with `merchant_id` and the
 *     booking will show up on the merchant's dashboard as
 *     "this customer booked through me".
 *  4. On the very first successful booking, the backend also stamps
 *     `customer_merchant_id` on the customer's user record — after that even
 *     bookings without the code auto-tag to the same merchant.
 */

const KEY = "azo_merchant_ref";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function readStore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !parsed.code) return null;
    if (parsed.savedAt && Date.now() - parsed.savedAt > TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Read `?ref=CODE` (or `?merchant_ref=CODE`) from `window.location.search`,
 * save it to localStorage, and strip the param from the URL so subsequent page
 * loads / share links stay clean. Safe to call multiple times.
 */
export function captureMerchantRefFromURL() {
  if (typeof window === "undefined") return null;
  try {
    const url = new URL(window.location.href);
    const code = (url.searchParams.get("ref") || url.searchParams.get("merchant_ref") || "").trim();
    if (!code) return readStore()?.code || null;
    localStorage.setItem(KEY, JSON.stringify({ code, savedAt: Date.now() }));
    // Clean the URL bar so the user doesn't share the code onward accidentally.
    url.searchParams.delete("ref");
    url.searchParams.delete("merchant_ref");
    const clean = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") + url.hash;
    window.history.replaceState({}, "", clean);
    return code;
  } catch {
    return readStore()?.code || null;
  }
}

/** Current merchant referral code, or empty string when none. */
export function getMerchantRefCode() {
  return readStore()?.code || "";
}

/**
 * Directly persist a merchant referral code (used after resolving a PHYSICAL QR
 * token `?pqr=<TOKEN>` -> merchant_code via the backend). Behaves exactly like a
 * `?ref=CODE` capture so booking attribution is identical.
 */
export function setMerchantRefCode(code) {
  const c = (code || "").trim();
  if (!c) return "";
  try {
    localStorage.setItem(KEY, JSON.stringify({ code: c, savedAt: Date.now() }));
  } catch { /* ignore */ }
  return c;
}

/**
 * Read a PHYSICAL QR token from `?pqr=<TOKEN>` in the current URL, strip it from
 * the URL bar (so it isn't shared onward), and return the raw token (or "").
 * The token itself is NOT a merchant code — the caller must resolve it against
 * the backend and then call setMerchantRefCode() with the returned merchant_code.
 */
export function capturePhysicalQrTokenFromURL() {
  if (typeof window === "undefined") return "";
  try {
    const url = new URL(window.location.href);
    const token = (url.searchParams.get("pqr") || "").trim();
    if (!token) return "";
    url.searchParams.delete("pqr");
    const clean = url.pathname + (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") + url.hash;
    window.history.replaceState({}, "", clean);
    return token;
  } catch {
    return "";
  }
}

/**
 * Convenience: merge `merchant_ref_code` (when present) into an existing
 * booking-request body. Never overwrites an explicitly-set value.
 */
export function withMerchantRef(body) {
  const code = getMerchantRefCode();
  if (!code) return body;
  if (body && typeof body === "object" && !body.merchant_ref_code) {
    return { ...body, merchant_ref_code: code };
  }
  return body;
}

/** Called on logout to un-tag the browser from a merchant. */
export function clearMerchantRef() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
