/** runPayment — port of web_panel/src/lib/payments.js: mock gateway path (sandbox) + graceful fallback. */
import { api } from "../api/client";

export async function runPayment(opts: { purpose: "booking" | "booking_group" | "wallet" | "additional"; bookingId?: string; groupId?: string; amount?: number }, toast?: any): Promise<boolean> {
  const body: any = { purpose: opts.purpose, booking_id: opts.bookingId, group_id: opts.groupId, amount: opts.amount };
  try {
    const order: any = await api.post("/payments/order", body);
    if (order?.mock) {
      await api.post("/payments/mock", body);
      toast?.success?.(opts.purpose === "wallet" ? "Money added to wallet" : "Payment successful");
      return true;
    }
    toast?.info?.("Online payment gateway is not available in the app yet — please use wallet or pay from the web panel.");
    return false;
  } catch (e: any) {
    toast?.error?.(e?.message || "Payment failed");
    return false;
  }
}
