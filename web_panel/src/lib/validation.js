// Central, reusable input validation & sanitizers used across the whole app so
// every field enforces the right type: numbers stay numeric, phone is 10 digits,
// pincode is 6 digits, names are alphabetic, etc.

// Strip everything except digits and (optionally) cap the length.
export const onlyDigits = (v, max) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return max ? d.slice(0, max) : d;
};

// Letters + spaces only (names). Keeps a single space between words.
export const onlyAlpha = (v) => String(v ?? "").replace(/[^A-Za-z\s]/g, "").replace(/\s{2,}/g, " ");

// Letters, numbers and spaces (alphanumeric fields).
export const onlyAlphaNum = (v) => String(v ?? "").replace(/[^A-Za-z0-9\s]/g, "");

// PAN / IFSC inputs — ALPHANUMERIC (letters + digits), uppercased, no spaces or
// symbols. These accept BOTH letters and numbers (e.g. PAN "ABCDE1234F",
// IFSC "SBIN0001234") — they must never be restricted to digits-only.
export const panInput = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
export const ifscInput = (v) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11);
export const isPan = (v) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(v ?? "").toUpperCase().trim());
export const isIfsc = (v) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(v ?? "").toUpperCase().trim());

// Decimal number string (money / quantities). Allows one dot.
export const onlyDecimal = (v) => {
  let s = String(v ?? "").replace(/[^0-9.]/g, "");
  const i = s.indexOf(".");
  if (i !== -1) s = s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, "");
  return s;
};

// Phone input that allows an optional leading "+" (for +91…) then digits only.
export const phoneInput = (v) => {
  let s = String(v ?? "").replace(/[^0-9+]/g, "");
  const plus = s.startsWith("+");
  s = s.replace(/\+/g, "");
  return (plus ? "+" : "") + s.slice(0, plus ? 12 : 10);
};

// --- validators (return true/false) ---
export const isPhone10 = (v) => /^[6-9]\d{9}$/.test(onlyDigits(v, 10));
export const isPincode6 = (v) => /^\d{6}$/.test(onlyDigits(v, 6));
export const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v ?? "").trim());
export const isNonEmpty = (v) => String(v ?? "").trim().length > 0;

// Human message helpers
export const phoneError = (v) => (!v ? "Mobile number is required" : !isPhone10(v) ? "Enter a valid 10-digit mobile number" : "");
export const pincodeError = (v) => (!v ? "Pincode is required" : !isPincode6(v) ? "Enter a valid 6-digit pincode" : "");
