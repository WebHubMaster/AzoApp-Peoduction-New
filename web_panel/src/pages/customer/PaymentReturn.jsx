import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2, CheckCircle2, Clock, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import api from "@/lib/api";
import { useCart } from "@/context/CartContext";
import { Button } from "@/components/ui/button";

/**
 * Landing page for hosted-checkout gateways (Cashfree/Juspay/Easebuzz) after they
 * redirect the customer back with ?gw=&order_id=. It verifies the payment on the
 * server, confirms the booking, clears the cart, then routes to My Bookings.
 */
export default function PaymentReturn() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { clear } = useCart();
  const [state, setState] = useState("checking"); // checking | paid | pending | error
  const [kind, setKind] = useState("booking");
  const [count, setCount] = useState(0);
  const ran = useRef(false);

  const gw = params.get("gw");
  const orderId = params.get("order_id");
  const isKit = kind === "starter_kit";
  const dest = isKit ? "/partner" : "/account";

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    // The booking already exists — remove the items from the cart either way.
    try { clear(); } catch (e) { /* ignore */ }
    if (!orderId) { setState("error"); return; }
    (async () => {
      try {
        const { data } = await api.post("/payments/confirm-return", { gw, order_id: orderId });
        if (data?.kind) setKind(data.kind);
        if (data?.count) setCount(data.count);
        if (data?.paid) {
          setState("paid");
          toast.success(data.kind === "starter_kit" ? "Payment successful — welcome to AzoApp Pro! 🎉" : "Payment successful — booking confirmed!");
          setTimeout(() => navigate(data.kind === "starter_kit" ? "/partner" : "/account", { replace: true }), 2000);
        } else {
          setState("pending");
        }
      } catch (e) {
        setState("error");
      }
    })();
  }, [gw, orderId, clear, navigate]);

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center px-6 text-center" data-testid="payment-return">
      {state === "checking" && (
        <>
          <Loader2 className="h-12 w-12 text-primary-700 animate-spin mb-5" />
          <h1 className="font-heading font-bold text-2xl text-slate-900">Confirming your payment…</h1>
          <p className="text-slate-500 mt-2 max-w-sm">Please wait a moment — do not close this page.</p>
        </>
      )}
      {state === "paid" && (
        <>
          <div className="h-20 w-20 rounded-full bg-emerald-500 flex items-center justify-center mb-5 shadow-lg shadow-emerald-500/30" data-testid="payment-return-paid">
            <CheckCircle2 className="h-10 w-10 text-white" />
          </div>
          <h1 className="font-heading font-black text-2xl sm:text-3xl text-slate-900">Payment successful!</h1>
          <p className="text-slate-500 mt-2 max-w-sm">{isKit ? "You're now an AzoApp Pro partner — your premium badge is live and your kit is on the way." : count > 1 ? `All ${count} bookings are confirmed with one payment. We're finding the best professionals near you.` : "Your booking is confirmed. We're finding the best professionals near you."}</p>
          <Button data-testid="return-go-bookings" onClick={() => navigate(dest, { replace: true })} className="mt-6 h-12 px-8 bg-primary-700 hover:bg-primary-800">{isKit ? "Go to dashboard" : "View my bookings"} <ArrowRight className="h-4 w-4 ml-1" /></Button>
        </>
      )}
      {(state === "pending" || state === "error") && (
        <>
          <div className="h-20 w-20 rounded-full bg-amber-100 flex items-center justify-center mb-5">
            <Clock className="h-10 w-10 text-amber-600" />
          </div>
          <h1 className="font-heading font-bold text-2xl text-slate-900">Payment not completed</h1>
          <p className="text-slate-500 mt-2 max-w-sm" data-testid="payment-return-pending">
            {state === "error"
              ? "We couldn't confirm this payment. If money was deducted it will auto-refund, or you can retry from My Bookings."
              : "Your booking is saved but payment is still pending. You can complete the payment anytime from My Bookings."}
          </p>
          <Button data-testid="return-retry-bookings" onClick={() => navigate(dest, { replace: true })} className="mt-6 h-12 px-8 bg-primary-700 hover:bg-primary-800">{isKit ? "Back to dashboard" : "Go to My Bookings"} <ArrowRight className="h-4 w-4 ml-1" /></Button>
        </>
      )}
    </div>
  );
}
