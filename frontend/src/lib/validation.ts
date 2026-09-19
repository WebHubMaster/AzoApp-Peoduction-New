/* Mirrors web lib/validation.js — same sanitizers/validators so every field behaves identically. */
export const onlyDigits = (v: any, max?: number) => {
  const d = String(v ?? "").replace(/\D/g, "");
  return max ? d.slice(0, max) : d;
};
export const onlyAlpha = (v: any) => String(v ?? "").replace(/[^A-Za-z\s]/g, "").replace(/\s{2,}/g, " ");
export const isPhone10 = (v: any) => /^[6-9]\d{9}$/.test(onlyDigits(v, 10));
export const phoneError = (v: string) => (!v ? "Mobile number is required" : !isPhone10(v) ? "Enter a valid 10-digit mobile number" : "");
export const isEmail = (v: any) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v ?? "").trim());

/** web OtpLogin.normalized(): +91 prefix, strip leading zeros. */
export const normalizePhone = (p: string) => {
  let x = p.trim().replace(/\s/g, "");
  if (!x.startsWith("+")) x = "+91" + x.replace(/^0+/, "");
  return x;
};
