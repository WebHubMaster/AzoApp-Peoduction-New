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

// Hosted gateways leave the SPA — remember how to confirm & where to come back.
export const PAY_PENDING_KEY = "azo_pay_pending";
function rememberPending(order, confirm) {
  try {
    sessionStorage.setItem(PAY_PENDING_KEY, JSON.stringify({
      order_id: order.order_id, gw: order.gateway, mode: order.mode,
      path: confirm?.path || null, body: confirm?.body || {},
      back: window.location.pathname.replace(/^\/api\/panel/, "") + window.location.search,
    }));
  } catch { /* ignore */ }
}
function leaveForGateway(order, confirm) {
  if (order.method === "form_post") { rememberPending(order, confirm); formPost(order.action, order.fields); return true; }
  if (order.method === "redirect" && order.payment_url) { rememberPending(order, confirm); window.location.assign(order.payment_url); return true; }
  return false;
}

// Open the active gateway's checkout for a PRE-CREATED order (used by flows like
// the Starter Kit that create their order on a dedicated endpoint and verify on a
// dedicated endpoint). `onVerify(res)` is called with the gateway response so the
// caller can POST it to its own /verify route. Resolves true only on verified success.
export async function openCheckout(order, { user, name = "AzoApp", description = "Payment", onVerify, confirm } = {}) {
  if (!order) return false;
  if (order.method === "cashfree_sdk") {
    const ok = await loadScript("https://sdk.cashfree.com/js/v3/cashfree.js", () => window.Cashfree);
    if (!ok) { toast.error("Could not load Cashfree"); return false; }
    try {
      rememberPending(order, confirm);
      const cashfree = window.Cashfree({ mode: order.cf_mode || "sandbox" });
      const result = await cashfree.checkout({ paymentSessionId: order.payment_session_id, redirectTarget: "_modal" });
      if (result && result.error) { toast.error(result.error.message || "Payment cancelled"); return false; }
      if (onVerify) await onVerify({ gw: "cashfree", order_id: order.order_id });
      return true;
    } catch { toast.error("Payment could not be started"); return false; }
  }
  // Full-page hosted checkout: the return page confirms via `confirm.path`.
  if (leaveForGateway(order, confirm)) return new Promise(() => {});
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
          lastPayError = e?.response?.data?.detail || "Payment verification failed";
          toast.error(lastPayError);
          resolve(false);
        }
      },
      modal: { ondismiss: () => { lastPayError = lastPayError || "Payment cancelled"; resolve(false); } },
    });
    rzp.on?.("payment.failed", (r) => { lastPayError = r?.error?.description || "Payment failed at the bank"; });
    rzp.open();
  });
}

/**
 * Runs a payment. purpose = "booking" | "booking_group" | "wallet".
 * booking_group pays for EVERY booking created in one checkout (order group) with
 * a single combined gateway transaction.
 * Uses whichever gateway the admin has set ACTIVE (Razorpay SDK, Cashfree SDK,
 * PayU form-post, or Easebuzz/Juspay hosted redirect) in its selected mode. There
 * is NO dev-mock fallback — if the active gateway is not configured the backend
 * returns a 409 and the caller surfaces the error. Resolves true on success.
 */
export let lastPayError = "";

export async function runPayment(opts) {
  lastPayError = "";
  try {
    return await _runPayment(opts);
  } catch (e) {
    lastPayError = e?.response?.data?.detail || e?.message || "Payment could not be started";
    toast.error(lastPayError);
    return false;
  }
}

async function _runPayment({ purpose, bookingId, groupId, amount, user }) {
  const { data: order } = await api.post("/payments/order", {
    purpose,
    booking_id: bookingId,
    group_id: groupId,
    amount,
  });

  // Cashfree — hosted checkout in a MODAL (stays inside the SPA; no full-page
  // redirect → no lost auth/session). After the modal closes we verify the order
  // status on our backend and confirm the booking(s).
  if (order.method === "cashfree_sdk") {
    const ok = await loadScript("https://sdk.cashfree.com/js/v3/cashfree.js", () => window.Cashfree);
    if (!ok) { toast.error("Could not load Cashfree"); return false; }
    try {
      rememberPending(order, null);
      const cashfree = window.Cashfree({ mode: order.cf_mode || "sandbox" });
      const result = await cashfree.checkout({ paymentSessionId: order.payment_session_id, redirectTarget: "_modal" });
      if (result && result.error) { toast.error(result.error.message || "Payment cancelled"); return false; }
      // Verify with the backend (uses the booking's stored gateway+mode snapshot).
      const { data } = await api.post("/payments/confirm-return", { gw: "cashfree", order_id: order.order_id });
      if (data && data.paid) { toast.success("Payment successful"); return true; }
      lastPayError = "Payment not completed. If money was debited it will reflect shortly.";
      toast.error(lastPayError);
      return false;
    } catch (e) {
      lastPayError = e?.response?.data?.detail || "Payment could not be started";
      toast.error(lastPayError);
      return false;
    }
  }

  // PayU (form POST) / Easebuzz / Juspay (hosted page) — full-page redirect; the
  // /payment/return page confirms the payment when the gateway sends the user back.
  if (leaveForGateway(order, null)) return new Promise(() => {});

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
          lastPayError = e?.response?.data?.detail || "Payment verification failed";
          toast.error(lastPayError);
          resolve(false);
        }
      },
      modal: { ondismiss: () => { lastPayError = lastPayError || "Payment cancelled"; resolve(false); } },
    });
    rzp.on?.("payment.failed", (r) => { lastPayError = r?.error?.description || "Payment failed at the bank"; });
    rzp.open();
  });
}
