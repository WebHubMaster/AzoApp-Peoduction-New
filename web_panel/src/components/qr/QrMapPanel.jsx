import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { QrCode, Store, Search, CheckCircle2, RefreshCw, Ban, Loader2, ScanLine, Lock } from "lucide-react";

import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import QrScanner from "@/components/qr/QrScanner";

/** Pull a physical-QR token out of a scanned string (`.../?pqr=TOKEN` or raw). */
function parseToken(text) {
  if (!text) return "";
  try {
    const u = new URL(text);
    const t = u.searchParams.get("pqr");
    if (t) return t.trim();
  } catch { /* not a URL */ }
  return String(text).trim();
}

/** Premium step indicator. */
function StepBadge({ n, done }) {
  return (
    <span
      className={`w-8 h-8 shrink-0 rounded-full grid place-items-center text-sm font-bold shadow-sm ring-4 ${
        done
          ? "bg-emerald-500 text-white ring-emerald-100 dark:ring-emerald-900/40"
          : "bg-gradient-to-br from-[#0D47A1] to-[#1769d6] text-white ring-blue-100 dark:ring-blue-900/40"
      }`}
    >
      {done ? <CheckCircle2 className="w-4 h-4" /> : n}
    </span>
  );
}

/**
 * Map / assign a physical QR sticker to a merchant.
 * Works for both admin and field agents (same API, agent-scoped server-side).
 */
export default function QrMapPanel({ onMapped }) {
  const { user } = useAuth();
  const isAgent = user?.role === "agent";
  const [token, setToken] = useState("");
  const [qr, setQr] = useState(null);
  const [loadingQr, setLoadingQr] = useState(false);

  const [merchantCode, setMerchantCode] = useState("");
  const [search, setSearch] = useState("");
  const [merchants, setMerchants] = useState([]);
  const [selectedMerchant, setSelectedMerchant] = useState(null);
  const [mapping, setMapping] = useState(false);

  const loadQr = useCallback(async (tok) => {
    const t = parseToken(tok);
    if (!t) return;
    setToken(t);
    setLoadingQr(true);
    setQr(null);
    try {
      const { data } = await api.get(`/admin/physical-qr/${encodeURIComponent(t)}`);
      setQr(data.qr);
      toast.success(`QR ${t} loaded`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "QR not found");
      setQr(null);
    } finally {
      setLoadingQr(false);
    }
  }, []);

  useEffect(() => {
    let alive = true;
    const id = setTimeout(async () => {
      try {
        const { data } = await api.get("/admin/physical-qr/merchant-search", { params: { q: search } });
        if (alive) setMerchants(data.merchants || []);
      } catch { /* ignore */ }
    }, 300);
    return () => { alive = false; clearTimeout(id); };
  }, [search]);

  const doMap = useCallback(async () => {
    if (!token || !qr) { toast.error("Scan or enter a QR token first"); return; }
    const body = {};
    if (selectedMerchant) body.merchant_id = selectedMerchant.id;
    else if (merchantCode.trim()) body.merchant_code = merchantCode.trim().toUpperCase();
    else { toast.error("Pick a merchant or enter a merchant code"); return; }
    setMapping(true);
    try {
      const { data } = await api.post(`/admin/physical-qr/${encodeURIComponent(token)}/assign`, body);
      setQr(data.qr);
      toast.success(data.reassigned ? "QR re-assigned to merchant" : "QR mapped to merchant");
      onMapped && onMapped();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not map this QR");
    } finally {
      setMapping(false);
    }
  }, [token, qr, selectedMerchant, merchantCode, onMapped]);

  const toggleDisable = useCallback(async () => {
    if (!qr) return;
    const enable = qr.status === "disabled";
    try {
      const { data } = await api.post(`/admin/physical-qr/${encodeURIComponent(qr.token)}/${enable ? "enable" : "disable"}`);
      setQr(data.qr);
      toast.success(enable ? "QR enabled" : "QR disabled");
      onMapped && onMapped();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    }
  }, [qr, onMapped]);

  const statusColor = {
    active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
    unassigned: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
    disabled: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  };

  const canMap = !!qr && (!!selectedMerchant || !!merchantCode.trim());
  // Once a QR is mapped (active) a field agent cannot re-map it — it's locked.
  const locked = isAgent && !!qr && qr.status === "active" && !!qr.merchant_id;
  const cardCls = "rounded-[20px] border border-slate-200/80 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-[0_2px_12px_-4px_rgba(13,71,161,0.12)]";
  const inputCls = "w-full px-3.5 py-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50/60 dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 placeholder:text-slate-400 focus:bg-white focus:border-[#0D47A1] focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40 outline-none transition";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* STEP 1 — identify the physical QR */}
      <div className={cardCls}>
        <div className="flex items-center gap-3 mb-4">
          <StepBadge n={1} done={!!qr} />
          <div>
            <div className="text-[11px] font-semibold tracking-wide text-[#0D47A1] uppercase">Step 1</div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 leading-tight">Scan the printed QR</h3>
          </div>
        </div>

        <QrScanner onDetected={(t) => loadQr(t)} label="Scan the sticker QR, or enter its token below" />

        <div className="mt-4">
          <label className="text-[11px] font-medium text-slate-500 ml-0.5">QR token</label>
          <div className="mt-1 flex gap-2">
            <input
              data-testid="qr-token-input"
              value={token}
              onChange={(e) => setToken(e.target.value.toUpperCase())}
              placeholder="e.g. PQRAUM6DX"
              className={inputCls}
            />
            <button
              data-testid="qr-token-load"
              onClick={() => loadQr(token)}
              className="shrink-0 px-4 rounded-xl bg-slate-800 dark:bg-slate-700 text-white text-sm font-medium inline-flex items-center gap-1.5 hover:bg-slate-900 active:scale-[0.98] transition"
            >
              {loadingQr ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScanLine className="w-4 h-4" />} Load
            </button>
          </div>
        </div>

        {qr && (
          <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/60 p-4" data-testid="qr-loaded-card">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-[#0D47A1]" />
                <span className="font-mono font-semibold text-slate-800 dark:text-slate-100">{qr.token}</span>
              </div>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${statusColor[qr.status] || ""}`}>{qr.status}</span>
            </div>
            <div className="mt-2 text-sm text-slate-600 dark:text-slate-300">
              {qr.merchant_id
                ? <>Currently mapped to <b>{qr.merchant_name}</b> ({qr.merchant_code})</>
                : <>Not mapped to any merchant yet.</>}
            </div>
            {locked && (
              <div data-testid="qr-locked-banner" className="mt-3 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/30 dark:border-emerald-800 px-3 py-2.5 text-emerald-800 dark:text-emerald-200">
                <Lock className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="text-xs leading-snug">
                  <b>Already mapped.</b> This QR is locked to <b>{qr.merchant_name}</b>. It cannot be mapped again.
                </div>
              </div>
            )}
            <div className="mt-1 text-xs text-slate-400">Batch: {qr.batch_name} · Scans: {qr.scans}</div>
            <button
              data-testid="qr-toggle-disable"
              onClick={toggleDisable}
              className="mt-3 text-xs inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition"
            >
              <Ban className="w-3.5 h-3.5" /> {qr.status === "disabled" ? "Enable QR" : "Disable QR"}
            </button>
          </div>
        )}
      </div>

      {/* STEP 2 — pick the merchant */}
      <div className={cardCls}>
        <div className="flex items-center gap-3 mb-4">
          <StepBadge n={2} done={!!(selectedMerchant || merchantCode.trim())} />
          <div>
            <div className="text-[11px] font-semibold tracking-wide text-[#0D47A1] uppercase">Step 2</div>
            <h3 className="font-bold text-slate-800 dark:text-slate-100 leading-tight">Choose the merchant</h3>
          </div>
        </div>

        <label className="text-[11px] font-medium text-slate-500 ml-0.5">Enter / scan merchant code</label>
        <input
          data-testid="merchant-code-input"
          value={merchantCode}
          onChange={(e) => { setMerchantCode(e.target.value.toUpperCase()); setSelectedMerchant(null); }}
          placeholder="e.g. 3L6MKM3"
          className={`${inputCls} mt-1 font-mono tracking-wide`}
        />

        <div className="my-4 flex items-center gap-3">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
          <span className="text-[11px] text-slate-400 font-medium">or search the merchant list</span>
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>

        <div className="relative">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            data-testid="merchant-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search shop name / code / phone"
            className={`${inputCls} pl-10`}
          />
        </div>

        <div className="mt-3 max-h-56 overflow-auto space-y-2 pr-0.5">
          {merchants.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-400">No merchants found.</p>
          )}
          {merchants.map((m) => {
            const active = selectedMerchant?.id === m.id;
            return (
              <button
                key={m.id}
                data-testid="merchant-option"
                onClick={() => { setSelectedMerchant(m); setMerchantCode(m.merchant_code || ""); }}
                className={`w-full text-left px-3.5 py-3 rounded-xl border flex items-center gap-3 transition ${
                  active
                    ? "border-[#0D47A1] bg-blue-50/80 dark:bg-blue-900/30 ring-2 ring-blue-100 dark:ring-blue-900/40"
                    : "border-slate-200 dark:border-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                }`}
              >
                <span className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-900/40 grid place-items-center shrink-0">
                  <Store className="w-4 h-4 text-[#0D47A1]" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{m.shop_name || m.name}</span>
                  <span className="block text-xs font-mono text-slate-400">{m.merchant_code}</span>
                </span>
                {active && <CheckCircle2 className="w-5 h-5 text-[#0D47A1] shrink-0" />}
              </button>
            );
          })}
        </div>

        <button
          data-testid="qr-map-submit"
          onClick={doMap}
          disabled={mapping || !canMap || locked}
          className={`mt-4 w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl text-sm font-semibold transition active:scale-[0.99] ${
            canMap && !mapping && !locked
              ? "bg-gradient-to-br from-[#0D47A1] to-[#1769d6] text-white shadow-[0_6px_16px_-6px_rgba(13,71,161,0.6)] hover:brightness-105"
              : "bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed"
          }`}
        >
          {locked ? <Lock className="w-4 h-4" /> : mapping ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
          {locked ? "Already mapped — locked" : qr && qr.merchant_id ? "Re-map to this merchant" : "Map to this merchant"}
        </button>
      </div>
    </div>
  );
}
