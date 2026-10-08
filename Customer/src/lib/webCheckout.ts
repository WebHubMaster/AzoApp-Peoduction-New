/** Browser checkout for the Customer app's WEB build (react-native-webview has no web
 *  support). Mirrors PaymentWebViewHost: Razorpay / Cashfree run in-page; PayU /
 *  Easebuzz / Juspay leave the page and come back to /payment/return. */
import { api } from "../api/client";
import type { PayContext } from "./payments";

export const PAY_PENDING_KEY = "azo_pay_pending";
const w: any = typeof window !== "undefined" ? window : {};

const loadScript = (src: string, ready: () => boolean) => new Promise<boolean>((resolve) => {
  if (ready()) return resolve(true);
  const s = document.createElement("script");
  s.src = src; s.onload = () => resolve(true); s.onerror = () => resolve(false);
  document.body.appendChild(s);
});

/** Confirms a hosted (non-Razorpay) payment for the given purpose. */
export async function confirmHosted(ctx: { purpose?: string; subscriptionId?: string }, orderId: string, gw?: string) {
  if (ctx?.purpose === "subscription") {
    const d: any = await api.post(`/subscriptions/${ctx.subscriptionId}/pay/confirm`, { order_id: orderId, gw });
    return { paid: !!(d && (d.payment_status === "paid" || d.id)), kind: "subscription" };
  }
  const d: any = await api.post("/payments/confirm-return", { gw, order_id: orderId });
  return { paid: !!d?.paid, kind: d?.kind || "booking" };
}

function remember(order: any, ctx: PayContext) {
  try {
    w.sessionStorage?.setItem(PAY_PENDING_KEY, JSON.stringify({
      order_id: order.order_id, gw: order.gateway, purpose: ctx.purpose, subscriptionId: ctx.subscriptionId,
    }));
  } catch { /* ignore */ }
}

function formPost(action: string, fields: Record<string, any>) {
  const form = document.createElement("form");
  form.method = "POST"; form.action = action;
  Object.entries(fields || {}).forEach(([k, v]) => {
    const i = document.createElement("input");
    i.type = "hidden"; i.name = k; i.value = String(v ?? ""); form.appendChild(i);
  });
  document.body.appendChild(form); form.submit();
}

async function razorpay(order: any, ctx: PayContext, user: any): Promise<boolean> {
  if (!(await loadScript("https://checkout.razorpay.com/v1/checkout.js", () => !!w.Razorpay))) {
    ctx.toast?.error?.("Could not load the payment gateway"); return false;
  }
  return new Promise<boolean>((resolve) => {
    const rzp = new w.Razorpay({
      key: order.key_id, amount: order.amount, currency: order.currency || "INR", order_id: order.order_id,
      name: "AzoApp", description: ctx.purpose === "wallet" ? "Wallet top-up" : "Service payment",
      prefill: { name: user?.name || "", email: user?.email || "", contact: String(user?.phone || "").replace("+91", "") },
      theme: { color: "#0D47A1" },
      handler: async (res: any) => {
        try {
          if (ctx.purpose === "subscription") {
            await api.post(`/subscriptions/${ctx.subscriptionId}/pay/verify`, { order_id: res.razorpay_order_id, payment_id: res.razorpay_payment_id, signature: res.razorpay_signature });
          } else {
            await api.post("/payments/verify", { order_id: res.razorpay_order_id, payment_id: res.razorpay_payment_id, signature: res.razorpay_signature, purpose: ctx.purpose, booking_id: ctx.bookingId, group_id: ctx.groupId, amount: ctx.amount });
          }
          ctx.toast?.success?.("Payment successful"); resolve(true);
        } catch (e: any) { ctx.toast?.error?.(e?.detail || e?.message || "Payment verification failed"); resolve(false); }
      },
      modal: { ondismiss: () => resolve(false) },
    });
    rzp.open();
  });
}

async function cashfree(order: any, ctx: PayContext): Promise<boolean> {
  if (!(await loadScript("https://sdk.cashfree.com/js/v3/cashfree.js", () => !!w.Cashfree))) {
    ctx.toast?.error?.("Could not load Cashfree"); return false;
  }
  try {
    remember(order, ctx);
    const cf = w.Cashfree({ mode: order.cf_mode || "sandbox" });
    const result = await cf.checkout({ paymentSessionId: order.payment_session_id, redirectTarget: "_modal" });
    if (result?.error) { ctx.toast?.error?.(result.error.message || "Payment cancelled"); return false; }
    const r = await confirmHosted(ctx, order.order_id, "cashfree");
    w.sessionStorage?.removeItem(PAY_PENDING_KEY);
    if (r.paid) { ctx.toast?.success?.("Payment successful"); return true; }
    ctx.toast?.error?.("Payment not completed. If money was debited it will reflect shortly.");
    return false;
  } catch { ctx.toast?.error?.("Payment could not be started"); return false; }
}

export async function openOnWeb(order: any, ctx: PayContext, user: any): Promise<boolean> {
  if (order.method === "form_post") { remember(order, ctx); formPost(order.action, order.fields); return new Promise(() => {}); }
  if (order.method === "redirect" && order.payment_url) { remember(order, ctx); w.location.assign(order.payment_url); return new Promise(() => {}); }
  if (order.method === "cashfree_sdk") return cashfree(order, ctx);
  return razorpay(order, ctx, user);
}
