import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import {
  captureMerchantRefFromURL,
  capturePhysicalQrTokenFromURL,
  setMerchantRefCode,
} from "@/lib/merchantRef";
import api from "@/lib/api";

/**
 * Renders nothing — silently persists any `?ref=CODE` OR `?pqr=<TOKEN>` (physical
 * QR sticker) query param into localStorage on every route change and logs the
 * scan server-side.
 *
 * This works ENTIRELY in the background: the customer is NEVER shown a toast
 * about which merchant they arrived through. The referral is applied internally
 * on booking so the order still appears on the merchant's dashboard.
 *
 * `?pqr=<TOKEN>` (physical QR): the token is dumb — we resolve it against the
 * backend (`/physical-qr/resolve`). Only when it is ACTIVE do we store the
 * returned merchant_code via the SAME mechanism as `?ref=`, so booking
 * attribution is identical. Invalid / unassigned / disabled tokens do nothing
 * (a normal booking, no error).
 *
 * This is mounted once at the App root.
 */
export default function MerchantRefCatcher() {
  const location = useLocation();
  useEffect(() => {
    // Read the raw ?ref before capture strips it — log a real QR scan on every open.
    let rawRef = "";
    try {
      const sp = new URLSearchParams(location.search);
      rawRef = (sp.get("ref") || sp.get("merchant_ref") || "").trim();
    } catch { /* ignore */ }
    captureMerchantRefFromURL();
    if (rawRef) {
      api.post("/merchant/qr-scan", { code: rawRef, source: "qr" }).catch(() => {});
    }

    // Physical QR sticker: `?pqr=<TOKEN>` -> resolve -> store merchant_code silently.
    const pqrToken = capturePhysicalQrTokenFromURL();
    if (pqrToken) {
      api
        .get("/physical-qr/resolve", { params: { token: pqrToken } })
        .then(({ data }) => {
          if (data && data.active && data.merchant_code) {
            setMerchantRefCode(data.merchant_code);
          }
          // invalid / unassigned / disabled -> do nothing (normal booking).
        })
        .catch(() => {});
    }
    // Intentionally NO user-facing toast — the merchant referral is applied silently.
  }, [location.pathname, location.search]);
  return null;
}
