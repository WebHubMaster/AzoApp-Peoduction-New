/** runPayment — real multi-gateway checkout for the app (Razorpay SDK, Cashfree SDK,
 *  PayU form-post, Easebuzz/Juspay hosted redirect) rendered inside a WebView, plus
 *  the dev mock path when no gateway is configured. Mirrors web_panel/src/lib/payments.js.
 *
 *  The WebView UI is provided by <PaymentWebViewHost/> (mounted once at the app root),
 *  which registers an opener here so runPayment can stay a simple awaited function. */
import { api } from "../api/client";

export type PayPurpose = "booking" | "booking_group" | "wallet" | "additional";
export interface PayOpts { purpose: PayPurpose; bookingId?: string; groupId?: string; amount?: number }
export interface PayContext extends PayOpts { toast?: any }

type Opener = (order: any, ctx: PayContext) => Promise<boolean>;
let _opener: Opener | null = null;
/** Called by <PaymentWebViewHost/> on mount. */
export function setPaymentOpener(fn: Opener | null) { _opener = fn; }

export async function runPayment(opts: PayOpts, toast?: any): Promise<boolean> {
  const body: any = { purpose: opts.purpose, booking_id: opts.bookingId, group_id: opts.groupId, amount: opts.amount };
  let order: any;
  try {
    order = await api.post("/payments/order", body);
  } catch (e: any) {
    toast?.error?.(e?.message || e?.detail || "Payment could not be started");
    return false;
  }
  // No gateway configured → backend signals a dev mock order.
  if (order?.mock) {
    try {
      await api.post("/payments/mock", body);
      toast?.success?.(opts.purpose === "wallet" ? "Money added to wallet" : "Payment successful");
      return true;
    } catch (e: any) { toast?.error?.(e?.message || "Payment failed"); return false; }
  }
  if (!_opener) { toast?.error?.("Payment is not ready yet. Please try again in a moment."); return false; }
  return _opener(order, { ...opts, toast });
}
