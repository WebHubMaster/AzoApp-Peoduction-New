import PremiumSelect from "@/components/ui/PremiumSelect";
import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Phone, Mail, MapPin, Receipt, CreditCard, Package, Clock, Truck, CheckCircle2, ShieldCheck, Copy } from "lucide-react";
import { toast } from "sonner";
import { Avatar, StatusBadge, STATUS_META, STATUS_ORDER, inr, fmtDateTime, fmtDate, methodLabel } from "./parts";
import { useIsMobile } from "../people/ui";

const KV = ({ icon: Icon, label, value, mono, copy }) => (
  <div className="flex items-start gap-3 py-2.5">
    <div className="h-8 w-8 rounded-lg bg-slate-50 ring-1 ring-slate-200 flex items-center justify-center text-slate-500 shrink-0"><Icon className="h-4 w-4" /></div>
    <div className="min-w-0 flex-1">
      <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{label}</p>
      <p className={`text-sm text-slate-800 font-medium break-all ${mono ? "font-mono text-xs" : ""}`}>{value || "—"}</p>
    </div>
    {copy && value && (
      <button onClick={() => { navigator.clipboard?.writeText(value); toast.success("Copied"); }} className="text-slate-400 hover:text-primary-700 p-1 rounded-md hover:bg-slate-100 transition-colors" aria-label="Copy">
        <Copy className="h-3.5 w-3.5" />
      </button>
    )}
  </div>
);

function Timeline({ purchase }) {
  const tl = purchase.tracking_timeline || [];
  const at = (s) => tl.find((e) => e.status === s)?.at;
  const current = purchase.tracking_status || "processing";
  const curIdx = STATUS_ORDER.indexOf(current);
  const steps = [
    { key: "placed", label: "Order Placed", time: purchase.created_at, done: true },
    ...STATUS_ORDER.map((s, i) => ({ key: s, label: STATUS_META[s].label, time: at(s), done: i <= curIdx, current: s === current })),
  ];
  return (
    <ol className="relative ml-3 border-l-2 border-slate-200 space-y-5" data-testid="sk-drawer-timeline">
      {steps.map((s, i) => (
        <li key={s.key} className="ml-5 relative">
          <span className={`absolute -left-[27px] top-0.5 h-4 w-4 rounded-full border-2 border-white flex items-center justify-center ${s.done ? (s.current || (s.key === "placed" && curIdx < 0) ? "bg-primary-700 ring-4 ring-primary-100" : "bg-emerald-500") : "bg-slate-200"}`}>
            {s.done && !s.current && s.key !== "placed" && <CheckCircle2 className="h-3 w-3 text-white" />}
          </span>
          <p className={`text-sm font-semibold ${s.done ? "text-slate-800" : "text-slate-400"}`}>{s.label}</p>
          <p className="text-[11px] text-slate-400">{s.time ? fmtDateTime(s.time) : s.done ? "Time not recorded" : "Pending"}</p>
        </li>
      ))}
    </ol>
  );
}

export default function PurchaseDrawer({ purchase, kitTitle, onClose, onUpdateStatus }) {
  const mobile = useIsMobile();
  useEffect(() => {
    if (!purchase) return;
    const k = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", k); document.body.style.overflow = ""; };
  }, [purchase, onClose]);

  const p = purchase;
  const loc = p?.location || {};
  const locStr = [loc.city, loc.state, loc.pincode].filter(Boolean).join(", ");

  return createPortal(
    <AnimatePresence>
      {p && (
        <motion.div key="bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}
          className={`fixed inset-0 z-[90] bg-slate-900/40 backdrop-blur-[2px] flex ${mobile ? "items-end" : "justify-end"}`} onMouseDown={onClose} data-testid="sk-drawer-overlay">
          <motion.aside onMouseDown={(e) => e.stopPropagation()} data-testid="sk-drawer"
            initial={mobile ? { y: "100%" } : { x: "100%" }} animate={mobile ? { y: 0 } : { x: 0 }} exit={mobile ? { y: "100%" } : { x: "100%" }}
            transition={{ type: "spring", stiffness: 380, damping: 36 }}
            className={`bg-white shadow-2xl flex flex-col ${mobile ? "w-full max-h-[92vh] rounded-t-3xl" : "h-full w-full max-w-[480px]"}`}>
            {mobile && <div className="mx-auto mt-2.5 h-1.5 w-12 rounded-full bg-slate-200" />}
            <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name={p.user_name} size="h-11 w-11 text-sm" />
                <div className="min-w-0">
                  <p className="font-heading font-bold text-slate-900 truncate" data-testid="sk-drawer-name">{p.user_name || "Partner"}</p>
                  <p className="text-xs text-slate-500">{p.user_phone}</p>
                </div>
              </div>
              <button onClick={onClose} data-testid="sk-drawer-close" className="h-9 w-9 rounded-lg hover:bg-slate-100 text-slate-500 flex items-center justify-center transition-colors"><X className="h-5 w-5" /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              <div className="rounded-2xl bg-primary-700 text-white p-4 flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-wider font-bold text-white/70">Amount paid</p>
                  <p className="font-heading font-extrabold text-2xl tabular-nums" data-testid="sk-drawer-amount">{inr(p.amount)}</p>
                </div>
                <div className="text-right">
                  <p className="text-[11px] uppercase tracking-wider font-bold text-white/70">Payment</p>
                  <p className="text-sm font-semibold inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4" /> {p.status === "paid" ? "Paid" : (p.status || "—")} · {methodLabel(p.method)}</p>
                </div>
              </div>

              <section>
                <h4 className="text-[11px] uppercase tracking-[0.12em] font-bold text-slate-400 mb-1">Order</h4>
                <div className="divide-y divide-slate-100">
                  <KV icon={Receipt} label="Order ID" value={p.order_id} mono copy />
                  <KV icon={CreditCard} label="Payment ID" value={p.payment_id} mono copy />
                  <KV icon={Package} label="Kit" value={kitTitle} />
                  <KV icon={Clock} label="Order date" value={fmtDateTime(p.created_at)} />
                  <KV icon={Clock} label="Membership expires" value={p.expires_at ? fmtDate(p.expires_at) : "Lifetime"} />
                </div>
              </section>

              <section>
                <h4 className="text-[11px] uppercase tracking-[0.12em] font-bold text-slate-400 mb-1">Partner & shipping</h4>
                <div className="divide-y divide-slate-100">
                  <KV icon={Phone} label="Phone" value={p.user_phone} copy />
                  {p.user_email && <KV icon={Mail} label="Email" value={p.user_email} />}
                  <KV icon={MapPin} label="Location" value={locStr} />
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-[11px] uppercase tracking-[0.12em] font-bold text-slate-400">Delivery status</h4>
                  <StatusBadge status={p.tracking_status} />
                </div>
                <div className="flex items-center gap-2 mb-4">
                  <Truck className="h-4 w-4 text-slate-400 shrink-0" />
                  <PremiumSelect value={p.tracking_status || "processing"} data-testid="sk-drawer-track" onChange={(e) => onUpdateStatus(p.id, e.target.value)} searchable={false}
                    className="flex-1 !h-10 rounded-xl">
                    {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_META[s].label}</option>)}
                  </PremiumSelect>
                </div>
                <Timeline purchase={p} />
              </section>
            </div>
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>, document.body);
}
