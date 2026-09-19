import api from "@/lib/api";
import { toast } from "sonner";

const loadScript = (src, globalCheck) =>
  new Promise((resolve) => {
    if (globalCheck && globalCheck()) return resolve(true);
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });

const loadRazorpay = () => loadScript("https://checkout.razorpay.com/v1/checkout.js", () => window.Razorpay);

// Submit a hidden form POST (PayU hosted checkout).
function formPost(action, fields) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = action;
  Object.entries(fields || {}).forEach(([name, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value ?? "";
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

// Open the active gateway's checkout for a PRE-CREATED order (used by flows like
// the Starter Kit that create their order on a dedicated endpoint and verify on a
// dedicated endpoint). `onVerify(res)` is called with the gateway response so the
// caller can POST it to its own /verify route. Resolves true only on verified success.
export async function openCheckout(order, { user, name = "AzoApp", description = "Payment", onVerify } = {}) {
  if (!order || order.mock) return false;
  if (order.method === "cashfree_sdk") {
    const ok = await loadScript("https://sdk.cashfree.com/js/v3/cashfree.js", () => window.Cashfree);
    if (!ok) { toast.error("Could not load Cashfree"); return false; }
    try {
      const cashfree = window.Cashfree({ mode: order.cf_mode || "sandbox" });
      const result = await cashfree.checkout({ paymentSessionId: order.payment_session_id, redirectTarget: "_modal" });
      if (result && result.error) { toast.error(result.error.message || "Payment cancelled"); return false; }
      if (onVerify) await onVerify({ gw: "cashfree", order_id: order.order_id });
      return true;
    } catch { toast.error("Payment could not be started"); return false; }
  }
  if (order.method === "form_post") { formPost(order.action, order.fields); return true; }
  if (order.method === "redirect" && order.payment_url) { window.location.assign(order.payment_url); return true; }
  const ok = await loadRazorpay();
  if (!ok) { toast.error("Could not load payment gateway"); return false; }
  return new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key: order.key_id, amount: order.amount, currency: order.currency, order_id: order.order_id,
      name, description,
      prefill: { name: user?.name || "", contact: (user?.phone || "").replace("+91", "") },
      theme: { color: "#0D47A1" },
      handler: async (res) => {
        try {
          if (onVerify) await onVerify(res);
          resolve(true);
        } catch (e) {
          toast.error(e?.response?.data?.detail || "Payment verification failed");
          resolve(false);
        }
      },
      modal: { ondismiss: () => resolve(false) },
    });
    rzp.open();
  });
}

/**
 * Runs a payment. purpose = "booking" | "booking_group" | "wallet".
 * booking_group pays for EVERY booking created in one checkout (order group) with
 * a single combined gateway transaction.
 * Uses whichever gateway the admin has set ACTIVE (Razorpay SDK, Cashfree SDK,
 * PayU form-post, or Easebuzz/Juspay hosted redirect). Falls back to the dev
 * mock endpoint when no gateway is configured. Resolves true on success.
 */
export async function runPayment({ purpose, bookingId, groupId, amount, user }) {
  const { data: order } = await api.post("/payments/order", {
    purpose,
    booking_id: bookingId,
    group_id: groupId,
    amount,
  });

  if (order.mock) {
    await api.post("/payments/mock", { purpose, booking_id: bookingId, group_id: groupId, amount });
    toast.success("Payment successful (dev mode)");
    return true;
  }

  // Cashfree — hosted checkout in a MODAL (stays inside the SPA; no full-page
  // redirect → no lost auth/session). After the modal closes we verify the order
  // status on our backend and confirm the booking(s).
  if (order.method === "cashfree_sdk") {
    const ok = await loadScript("https://sdk.cashfree.com/js/v3/cashfree.js", () => window.Cashfree);
    if (!ok) { toast.error("Could not load Cashfree"); return false; }
    try {
      const cashfree = window.Cashfree({ mode: order.cf_mode || "sandbox" });
      const result = await cashfree.checkout({ paymentSessionId: order.payment_session_id, redirectTarget: "_modal" });
      if (result && result.error) { toast.error(result.error.message || "Payment cancelled"); return false; }
      // Verify with the backend (uses the booking's stored gateway+mode snapshot).
      const { data } = await api.post("/payments/confirm-return", { gw: "cashfree", order_id: order.order_id });
      if (data && data.paid) { toast.success("Payment successful"); return true; }
      toast.error("Payment not completed. If money was debited it will reflect shortly.");
      return false;
    } catch (e) {
      toast.error("Payment could not be started");
      return false;
    }
  }

  // PayU — hosted checkout via signed form POST (full-page redirect)
  if (order.method === "form_post") {
    formPost(order.action, order.fields);
    return true;
  }

  // Easebuzz / Juspay — hosted payment page redirect
  if (order.method === "redirect" && order.payment_url) {
    window.location.assign(order.payment_url);
    return true;
  }

  // Razorpay — in-page SDK
  const ok = await loadRazorpay();
  if (!ok) {
    toast.error("Could not load payment gateway");
    return false;
  }

  return new Promise((resolve) => {
    const rzp = new window.Razorpay({
      key: order.key_id,
      amount: order.amount,
      currency: order.currency,
      order_id: order.order_id,
      name: "AzoApp",
      description: purpose === "wallet" ? "Wallet top-up" : "Service payment",
      prefill: { name: user?.name || "", contact: (user?.phone || "").replace("+91", "") },
      theme: { color: "#0D47A1" },
      handler: async (res) => {
        try {
          await api.post("/payments/verify", {
            order_id: res.razorpay_order_id,
            payment_id: res.razorpay_payment_id,
            signature: res.razorpay_signature,
            purpose,
            booking_id: bookingId,
            group_id: groupId,
            amount,
          });
          toast.success("Payment successful");
          resolve(true);
        } catch (e) {
          toast.error(e?.response?.data?.detail || "Payment verification failed");
          resolve(false);
        }
      },
      modal: { ondismiss: () => resolve(false) },
    });
    rzp.open();
  });
}
