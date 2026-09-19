import PremiumSelect from "@/components/ui/PremiumSelect";
import { useEffect, useState, useCallback } from "react";
import { QRCodeSVG, QRCodeCanvas } from "qrcode.react";
import { toast } from "sonner";
import {
  QrCode, Plus, Printer, Search, RefreshCw, Ban, History, Users, Loader2, X,
  CheckCircle2, Store, ShieldCheck, Banknote, Download,
} from "lucide-react";

import api from "@/lib/api";
import { useSiteConfig } from "@/context/SiteConfigContext";
import QrMapPanel from "@/components/qr/QrMapPanel";
import QrBookingPoster, { POSTER_SIZES, posterDims } from "@/components/qr/QrBookingPoster";

const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

const STATUS_COLOR = {
  active: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  unassigned: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  disabled: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
};

function StatusPill({ status }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[status] || ""}`}>{status}</span>;
}

// ───────────────────────────── BATCHES TAB ─────────────────────────────
function BatchesTab() {
  const [batches, setBatches] = useState([]);
  const [count, setCount] = useState(24);
  const [name, setName] = useState("");
  const [prefix, setPrefix] = useState("PQR");
  const [creating, setCreating] = useState(false);
  const [printData, setPrintData] = useState(null);
  const [posterData, setPosterData] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/physical-qr/batches");
      setBatches(data.batches || []);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!count || count < 1) { toast.error("Enter a valid count"); return; }
    setCreating(true);
    try {
      const { data } = await api.post("/admin/physical-qr/batch", {
        count: Number(count), batch_name: name, prefix: prefix || "PQR",
      });
      toast.success(`Generated ${data.count} QR stickers`);
      setName("");
      load();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not create batch");
    } finally {
      setCreating(false);
    }
  };

  const openPrint = async (batch_id) => {
    try {
      const { data } = await api.get(`/admin/physical-qr/batch/${batch_id}/print`);
      setPrintData(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load batch");
    }
  };

  const openPoster = async (batch_id) => {
    try {
      const { data } = await api.get(`/admin/physical-qr/batch/${batch_id}/print`);
      setPosterData(data);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not load batch");
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
          <Plus className="w-4 h-4 text-[#0D47A1]" /> Generate a new batch of stickers
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-slate-500">How many QRs</label>
            <input type="number" min={1} max={500} value={count}
              data-testid="batch-count-input"
              onChange={(e) => setCount(e.target.value)}
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs text-slate-500">Batch name (optional)</label>
            <input value={name}
              data-testid="batch-name-input"
              onChange={(e) => setName(e.target.value)} placeholder="e.g. Ranchi Field Kit — Aug"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100" />
          </div>
          <div>
            <label className="text-xs text-slate-500">Prefix</label>
            <input value={prefix}
              data-testid="batch-prefix-input"
              onChange={(e) => setPrefix(e.target.value.toUpperCase().slice(0, 6))} placeholder="PQR"
              className="mt-1 w-full px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100" />
          </div>
        </div>
        <button onClick={create} disabled={creating}
          data-testid="batch-create-btn"
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#0D47A1] text-white text-sm font-semibold hover:bg-[#0b3c8a] disabled:opacity-60">
          {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Generate stickers
        </button>
        <p className="mt-2 text-xs text-slate-400">Max 500 per batch. Each sticker gets a unique token encoding the booking link.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3">Batches</h3>
        {batches.length === 0 && <p className="text-sm text-slate-400">No batches yet — generate one above.</p>}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {batches.map((b) => (
            <div key={b.batch_id} data-testid="batch-card" className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="flex items-start justify-between">
                <div className="font-medium text-slate-800 dark:text-slate-100">{b.batch_name}</div>
                <span className="text-xs text-slate-400">{b.total} QRs</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">{b.active} active</span>
                <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">{b.unassigned} free</span>
                <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">{b.disabled} off</span>
                <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">{b.scans} scans</span>
              </div>
              {b.agent_name && <div className="mt-2 text-xs text-slate-500 flex items-center gap-1"><Users className="w-3 h-3" /> {b.agent_name}</div>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => openPoster(b.batch_id)}
                  data-testid="batch-poster-btn"
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[#0D47A1] text-white font-semibold hover:bg-[#0b3c8a]">
                  <Printer className="w-3.5 h-3.5" /> Print poster (4×6)
                </button>
                <button onClick={() => openPrint(b.batch_id)}
                  data-testid="batch-print-btn"
                  className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200">
                  <Printer className="w-3.5 h-3.5" /> Print A4 sheet
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {printData && <PrintSheet data={printData} onClose={() => setPrintData(null)} />}
      {posterData && <PosterSheet data={posterData} onClose={() => setPosterData(null)} />}
    </div>
  );
}

function PrintSheet({ data, onClose }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-start justify-center p-4" data-testid="print-sheet">
      <style>{`@media print { body * { visibility: hidden !important; } .qr-print-area, .qr-print-area * { visibility: visible !important; } .qr-print-area { position: absolute; left: 0; top: 0; width: 100%; } .qr-no-print { display: none !important; } }`}</style>
      <div className="bg-white rounded-xl w-full max-w-4xl my-4 max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
        <div className="qr-no-print flex-shrink-0 flex items-center justify-between p-4 border-b bg-white">
          <h3 className="font-semibold text-slate-800">Print sheet — {data.batch_name} ({data.qrs.length})</h3>
          <div className="flex gap-2">
            <button onClick={() => window.print()} data-testid="print-now-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D47A1] text-white text-sm"><Printer className="w-4 h-4" /> Print</button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="qr-print-area flex-1 overflow-auto p-4">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {data.qrs.map((q) => (
              <div key={q.token} className="border border-slate-300 rounded-lg p-2 flex flex-col items-center text-center break-inside-avoid">
                <QRCodeCanvas value={q.url} size={120} includeMargin />
                <div className="mt-1 font-mono text-[11px] text-slate-700">{q.token}</div>
                <div className="text-[9px] text-slate-400">Scan &amp; book with AzoApp</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── POSTER ─────────────────────────────
// Uses the SHARED QrBookingPoster (single source of truth) — pixel-identical to
// the merchant Scan-QR poster. Paper sizes (4×6 / A6 / A7) come from the shared
// POSTER_SIZES config so preview == PDF == print for every size.

// Renders one poster on its exact physical paper canvas (fills width, no
// letter-box). `m` scales the raster resolution for export (1 = screen/print).
function PosterPage({ q, brand, size, m = 1 }) {
  const { canvasW, canvasH, scale } = posterDims(size, m);
  return (
    <div className="qr-poster-page" style={{ width: `${canvasW}px`, height: `${canvasH}px`, background: "#fff", overflow: "hidden" }}>
      <QrBookingPoster qrValue={q.url} token={q.token} brand={brand} width={canvasW} height={canvasH} scale={scale} />
    </div>
  );
}

function PosterSheet({ data, onClose }) {
  const cfg = useSiteConfig();
  const [size, setSize] = useState("4x6");
  const [busy, setBusy] = useState(false);
  const S = POSTER_SIZES[size] || POSTER_SIZES["4x6"];

  const branding = cfg?.branding || {};
  const theme = cfg?.theme || {};
  const brand = {
    logo: branding.logo_light || branding.logo || branding.logo_dark || "",
    siteName: branding.site_name || "AzoApp",
    tagline: branding.tagline || "Service at Your Doorstep",
    primary: theme.primary || "#0D47A1",
    secondary: theme.secondary || theme.primary || "#1565C0",
  };

  const downloadPdf = async () => {
    setBusy(true);
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import("jspdf").then((m) => ({ default: m.jsPDF || m.default })),
        import("html2canvas"),
      ]);
      const pages = Array.from(document.querySelectorAll(".qr-poster-area .qr-poster-page"));
      if (!pages.length) throw new Error("No posters to export");
      // Ensure brand fonts are fully loaded so the export never falls back to a
      // different font (preview == export).
      if (document.fonts && document.fonts.ready) { try { await document.fonts.ready; } catch { /* noop */ } }
      const pdf = new jsPDF({ unit: S.pdf.unit, format: S.pdf.format, orientation: "portrait" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], { scale: 3, backgroundColor: "#ffffff", useCORS: true, logging: false });
        const img = canvas.toDataURL("image/jpeg", 0.92);
        if (i > 0) pdf.addPage(S.pdf.format, "portrait");
        pdf.addImage(img, "JPEG", 0, 0, pw, ph);
      }
      pdf.save(`${(data.batch_name || "qr-posters").replace(/[^\w\-]+/g, "_")}-${size}.pdf`);
      toast.success(`PDF ready — ${pages.length} page(s)`);
    } catch (e) {
      toast.error("Could not build PDF: " + (e?.message || e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex items-start justify-center p-4" data-testid="poster-sheet">
      <style>{`
        @media print {
          @page { size: ${S.page}; margin: 0; }
          body * { visibility: hidden !important; }
          .qr-poster-area, .qr-poster-area * { visibility: visible !important; }
          .qr-poster-area { position: absolute; left: 0; top: 0; }
          .qr-no-print { display: none !important; }
          .qr-poster-page { page-break-after: always; break-after: page; }
          .qr-poster-page:last-child { page-break-after: auto; }
        }
        .qr-poster, .qr-poster-page, .qr-poster *, .qr-poster-page * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      `}</style>
      <div className="bg-white rounded-xl w-full max-w-3xl my-4 max-h-[calc(100vh-2rem)] flex flex-col overflow-hidden">
        <div className="qr-no-print flex-shrink-0 flex flex-wrap items-center justify-between gap-3 p-4 border-b bg-white">
          <h3 className="font-semibold text-slate-800">Posters — {data.batch_name} ({data.qrs.length})</h3>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-xs text-slate-500">Size</label>
            <PremiumSelect value={size} onChange={(e) => setSize(e.target.value)} data-testid="poster-size-select" searchable={false}
              className="!h-9 !w-auto min-w-[140px] rounded-lg">
              {Object.entries(POSTER_SIZES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </PremiumSelect>
            <button onClick={downloadPdf} disabled={busy} data-testid="poster-pdf-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#0D47A1] text-[#0D47A1] text-sm font-semibold disabled:opacity-60">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />} Download PDF
            </button>
            <button onClick={() => window.print()} data-testid="poster-print-now-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#0D47A1] text-white text-sm"><Printer className="w-4 h-4" /> Print</button>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          <p className="qr-no-print px-4 pt-3 text-xs text-slate-500">Each QR prints on its own <b>{S.label}</b> page (one QR = one page). In the browser print dialog set paper size to match and margins to <b>None</b>. Logo &amp; colours follow your Admin → Branding/Theme settings.</p>
          <div className="qr-poster-area p-4 flex flex-wrap gap-4 justify-center">
            {data.qrs.map((q) => (
              <PosterPage key={q.token} q={q} brand={brand} size={size} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────── REGISTRY TAB ─────────────────────────────
function RegistryTab() {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState({ items: [], total: 0, counts: {}, page: 1, page_size: 25 });
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState(null);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/physical-qr", { params: { status, q, page, page_size: 25 } });
      setData(data);
    } catch { /* ignore */ }
  }, [status, q, page]);
  useEffect(() => { const id = setTimeout(load, 250); return () => clearTimeout(id); }, [load]);

  const counts = data.counts || {};
  const tabs = [
    { k: "", label: `All (${counts.all ?? 0})` },
    { k: "unassigned", label: `Unassigned (${counts.unassigned ?? 0})` },
    { k: "active", label: `Active (${counts.active ?? 0})` },
    { k: "disabled", label: `Disabled (${counts.disabled ?? 0})` },
  ];

  const act = async (token, action) => {
    try {
      await api.post(`/admin/physical-qr/${encodeURIComponent(token)}/${action}`);
      toast.success(`QR ${action}d`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Action failed"); }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => (
          <button key={t.k} onClick={() => { setStatus(t.k); setPage(1); }}
            data-testid={`registry-tab-${t.k || "all"}`}
            className={`text-xs px-3 py-1.5 rounded-full border ${status === t.k ? "bg-[#0D47A1] text-white border-[#0D47A1]" : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"}`}>
            {t.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }}
            data-testid="registry-search"
            placeholder="Search token / merchant / code"
            className="pl-9 pr-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100 w-64 max-w-full" />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Token</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Merchant</th>
                <th className="text-left px-4 py-3">Scans</th>
                <th className="text-left px-4 py-3">Mapped by</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.items.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No QRs found.</td></tr>
              )}
              {data.items.map((r) => (
                <tr key={r.token} data-testid="registry-row" className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                  <td className="px-4 py-3 font-mono text-slate-800 dark:text-slate-100">{r.token}</td>
                  <td className="px-4 py-3"><StatusPill status={r.status} /></td>
                  <td className="px-4 py-3 text-slate-700 dark:text-slate-200">{r.merchant_name ? <>{r.merchant_name} <span className="text-xs text-slate-400 font-mono">{r.merchant_code}</span></> : <span className="text-slate-400">—</span>}</td>
                  <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{r.scans}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{r.mapped_by_role || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => setDetail(r.token)} data-testid="registry-history-btn"
                        className="p-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500" title="History"><History className="w-4 h-4" /></button>
                      {r.status !== "disabled" ? (
                        <button onClick={() => act(r.token, "disable")} data-testid="registry-disable-btn"
                          className="p-1.5 rounded-lg border border-rose-300 text-rose-600" title="Disable"><Ban className="w-4 h-4" /></button>
                      ) : (
                        <button onClick={() => act(r.token, "enable")} data-testid="registry-enable-btn"
                          className="p-1.5 rounded-lg border border-emerald-300 text-emerald-600" title="Enable"><CheckCircle2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {data.total > data.page_size && (
        <div className="flex items-center justify-center gap-3 text-sm">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40">Prev</button>
          <span className="text-slate-500">Page {page} of {Math.ceil(data.total / data.page_size)}</span>
          <button disabled={page >= Math.ceil(data.total / data.page_size)} onClick={() => setPage((p) => p + 1)} className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 disabled:opacity-40">Next</button>
        </div>
      )}

      {detail && <HistoryDrawer token={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function HistoryDrawer({ token, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => {
    api.get(`/admin/physical-qr/${encodeURIComponent(token)}`).then(({ data }) => setD(data)).catch(() => setD({ qr: null, events: [] }));
  }, [token]);
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex justify-end" data-testid="history-drawer" onClick={onClose}>
      <div className="w-full max-w-md bg-white dark:bg-slate-900 h-full overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><History className="w-4 h-4" /> {token}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        {!d && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
        {d?.qr && (
          <div className="mb-4 flex items-center gap-3">
            <QRCodeSVG value={d.qr.url} size={72} />
            <div className="text-sm">
              <div className="flex items-center gap-2"><StatusPill status={d.qr.status} /></div>
              <div className="mt-1 text-slate-600 dark:text-slate-300">{d.qr.merchant_name || "Unmapped"}</div>
              <div className="text-xs text-slate-400 break-all">{d.qr.url}</div>
            </div>
          </div>
        )}
        <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-2">
          {(d?.events || []).map((e) => (
            <li key={e.id} className="mb-4 ml-4">
              <div className="absolute w-2.5 h-2.5 bg-[#0D47A1] rounded-full -left-[5px] mt-1.5" />
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100 capitalize">{e.action}</div>
              <div className="text-xs text-slate-400">{new Date(e.at).toLocaleString()}{e.by_role ? ` · ${e.by_role}` : ""}</div>
              {e.meta?.merchant_name && <div className="text-xs text-slate-500">→ {e.meta.merchant_name} ({e.meta.merchant_code})</div>}
            </li>
          ))}
          {d && (d.events || []).length === 0 && <p className="text-sm text-slate-400 ml-4">No history.</p>}
        </ol>
      </div>
    </div>
  );
}

// ───────────────────────────── AGENTS TAB ─────────────────────────────
function AgentsTab() {
  const [agents, setAgents] = useState([]);
  const [batches, setBatches] = useState([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [creating, setCreating] = useState(false);
  const [detailAgent, setDetailAgent] = useState(null);

  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        api.get("/admin/physical-qr/agents"),
        api.get("/admin/physical-qr/batches"),
      ]);
      setAgents(a.data.agents || []);
      setBatches(b.data.batches || []);
    } catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!name.trim() || !phone.trim()) { toast.error("Name and phone required"); return; }
    setCreating(true);
    try {
      await api.post("/admin/physical-qr/agents", { name: name.trim(), phone: phone.trim() });
      toast.success("Agent created — they can log in with OTP 123456");
      setName(""); setPhone("");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not create agent"); }
    finally { setCreating(false); }
  };

  const toggleBatch = async (agent, batch_id) => {
    const set = new Set(agent.assigned_batch_ids || []);
    if (set.has(batch_id)) set.delete(batch_id); else set.add(batch_id);
    try {
      await api.post(`/admin/physical-qr/agents/${agent.id}/batches`, { batch_ids: Array.from(set) });
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const toggleActive = async (agent) => {
    try {
      await api.post(`/admin/physical-qr/agents/${agent.id}/toggle`, null, { params: { active: !agent.agent_active } });
      load();
    } catch { toast.error("Failed"); }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <h3 className="font-semibold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-[#0D47A1]" /> Add a field agent</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Agent name"
            data-testid="agent-name-input"
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone e.g. +9190000000XX"
            data-testid="agent-phone-input"
            className="px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm text-slate-800 dark:text-slate-100" />
          <button onClick={create} disabled={creating}
            data-testid="agent-create-btn"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-[#0D47A1] text-white text-sm font-semibold disabled:opacity-60">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Create agent
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-400">Agents log in at <b>/login</b> with their phone (demo OTP 123456) and land on the field mapping screen. Assign batches below.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {agents.length === 0 && <p className="text-sm text-slate-400">No agents yet.</p>}
        {agents.map((a) => (
          <div key={a.id} data-testid="agent-card" className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-full bg-blue-50 dark:bg-blue-900/40 flex items-center justify-center"><ShieldCheck className="w-4 h-4 text-[#0D47A1]" /></div>
                <div>
                  <div className="font-medium text-slate-800 dark:text-slate-100">{a.name}</div>
                  <div className="text-xs text-slate-400">{a.phone}</div>
                </div>
              </div>
              <button onClick={() => toggleActive(a)} data-testid="agent-toggle-active"
                className={`text-xs px-2.5 py-1 rounded-full font-medium ${a.agent_active ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                {a.agent_active ? "Active" : "Disabled"}
              </button>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 py-2">
                <div className="text-sm font-bold text-slate-800 dark:text-slate-100">{a.mappings ?? 0}</div>
                <div className="text-[10px] text-slate-400">Mappings</div>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 py-2">
                <div className="text-sm font-bold text-emerald-600">{money(a.total_earned)}</div>
                <div className="text-[10px] text-slate-400">Earned</div>
              </div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 py-2">
                <div className="text-sm font-bold text-[#0D47A1]">{money(a.available)}</div>
                <div className="text-[10px] text-slate-400">Available</div>
              </div>
            </div>
            <div className="mt-3 text-xs text-slate-500">Batches assigned ({a.batch_count} · {a.qr_count} QRs):</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {batches.map((b) => {
                const on = (a.assigned_batch_ids || []).includes(b.batch_id);
                return (
                  <button key={b.batch_id} onClick={() => toggleBatch(a, b.batch_id)}
                    data-testid="agent-batch-chip"
                    className={`text-xs px-2.5 py-1 rounded-full border ${on ? "bg-[#0D47A1] text-white border-[#0D47A1]" : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"}`}>
                    {on && <CheckCircle2 className="w-3 h-3 inline mr-1" />}{b.batch_name}
                  </button>
                );
              })}
              {batches.length === 0 && <span className="text-xs text-slate-400">Create a batch first.</span>}
            </div>
            <button onClick={() => setDetailAgent(a.id)} data-testid="agent-view-history"
              className="mt-3 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200">
              <History className="w-3.5 h-3.5" /> View history &amp; details
            </button>
          </div>
        ))}
      </div>
      {detailAgent && <AgentDetailDrawer agentId={detailAgent} onClose={() => setDetailAgent(null)} onChanged={load} />}
    </div>
  );
}

// ───────────────────────────── MAIN ─────────────────────────────
const SECTION_META = {
  batches: { title: "QR Batches", desc: "Generate & print pre-printed QR stickers." },
  map: { title: "Map / Assign", desc: "Scan a printed QR and map it to a merchant." },
  registry: { title: "QR Registry", desc: "All stickers, their status, mapped merchant & history." },
  agents: { title: "Field Agents", desc: "Create agent logins, assign batches & see their mapping history." },
};

export default function QRConfig({ section = "batches" }) {
  const meta = SECTION_META[section] || SECTION_META.batches;
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0D47A1] text-white flex items-center justify-center"><QrCode className="w-5 h-5" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">{meta.title}</h1>
          <p className="text-sm text-slate-500">{meta.desc}</p>
        </div>
      </div>

      {section === "batches" && <BatchesTab />}
      {section === "map" && <QrMapPanel onMapped={() => {}} />}
      {section === "registry" && <RegistryTab />}
      {section === "agents" && <AgentsTab />}
    </div>
  );
}


// ───────────────────────────── AGENT DETAIL DRAWER (admin) ─────────────────────────────
function AgentDetailDrawer({ agentId, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/admin/physical-qr/agents/${agentId}/detail`);
      setD(data);
    } catch { setD({ agent: null, wallet: {}, earnings: [], withdrawals: [], shops: [] }); }
  }, [agentId]);
  useEffect(() => { load(); }, [load]);

  const verifyBank = async (verified) => {
    try {
      await api.post(`/admin/physical-qr/agents/${agentId}/verify-bank`, null, { params: { verified } });
      toast.success(verified ? "Bank verified" : "Bank verification removed");
      load(); onChanged && onChanged();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const bank = d?.agent?.bank;
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 flex justify-end" data-testid="agent-detail-drawer" onClick={onClose}>
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 h-full overflow-auto p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2"><Users className="w-4 h-4" /> {d?.agent?.name || "Agent"}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>
        {!d && <Loader2 className="w-5 h-5 animate-spin text-slate-400" />}
        {d && (
          <>
            <div className="grid grid-cols-4 gap-2 text-center mb-4">
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 py-2"><div className="text-sm font-bold text-slate-800 dark:text-slate-100">{d.wallet.mappings ?? 0}</div><div className="text-[10px] text-slate-400">Mapped</div></div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 py-2"><div className="text-sm font-bold text-emerald-600">{money(d.wallet.total_earned)}</div><div className="text-[10px] text-slate-400">Earned</div></div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 py-2"><div className="text-sm font-bold text-amber-600">{money(d.wallet.pending)}</div><div className="text-[10px] text-slate-400">Pending</div></div>
              <div className="rounded-lg bg-slate-50 dark:bg-slate-800 py-2"><div className="text-sm font-bold text-[#0D47A1]">{money(d.wallet.available)}</div><div className="text-[10px] text-slate-400">Available</div></div>
            </div>

            {/* Bank */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5"><Banknote className="w-4 h-4" /> Bank details</h4>
                {bank && <span className={`text-xs px-2 py-0.5 rounded-full ${bank.verified ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{bank.verified ? "Verified" : "Unverified"}</span>}
              </div>
              {!bank && <p className="text-xs text-slate-400">Agent has not submitted bank details yet.</p>}
              {bank && (
                <div className="text-sm text-slate-600 dark:text-slate-300 space-y-0.5">
                  <div>{bank.account_name}</div>
                  <div className="font-mono">{bank.account_number} · {bank.ifsc}</div>
                  {bank.bank_name && <div className="text-xs text-slate-400">{bank.bank_name}</div>}
                  {!bank.verified
                    ? <button onClick={() => verifyBank(true)} data-testid="agent-verify-bank" className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white">Verify bank</button>
                    : <button onClick={() => verifyBank(false)} className="mt-2 text-xs px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-500">Un-verify</button>}
                </div>
              )}
            </div>

            {/* Shops mapped */}
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5"><Store className="w-4 h-4" /> Shops mapped ({d.shops.length})</h4>
            <div className="flex flex-wrap gap-2 mb-4">
              {d.shops.map((s) => (
                <span key={s.merchant_id} className="text-xs px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-slate-700 dark:text-slate-200">{s.merchant_name} <b>×{s.count}</b></span>
              ))}
              {d.shops.length === 0 && <span className="text-xs text-slate-400">None yet.</span>}
            </div>

            {/* Mapping history */}
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Mapping history</h4>
            <div className="space-y-2 mb-4">
              {d.earnings.map((e) => (
                <div key={e.id} className="flex items-center justify-between text-sm rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2">
                  <div>
                    <div className="text-slate-700 dark:text-slate-200">{e.merchant_name} <span className="font-mono text-xs text-slate-400">{e.token}</span></div>
                    <div className="text-xs text-slate-400">{new Date(e.at).toLocaleString()}</div>
                  </div>
                  <span className="font-semibold text-emerald-600">+{money(e.amount)}</span>
                </div>
              ))}
              {d.earnings.length === 0 && <p className="text-sm text-slate-400">No mappings yet.</p>}
            </div>

            {/* Withdrawals */}
            <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Withdrawals</h4>
            <div className="space-y-2">
              {d.withdrawals.map((w) => (
                <div key={w.id} className="flex items-center justify-between text-sm rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2">
                  <div><div className="text-slate-700 dark:text-slate-200">{money(w.amount)}</div><div className="text-xs text-slate-400">{new Date(w.requested_at).toLocaleString()}</div></div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${w.status === "approved" ? "bg-emerald-100 text-emerald-700" : w.status === "rejected" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>{w.status}</span>
                </div>
              ))}
              {d.withdrawals.length === 0 && <p className="text-sm text-slate-400">No withdrawals yet.</p>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────── AGENT PAYOUTS (admin — "Agent Withdraw") ─────────────────────────────
export function AgentPayouts() {
  const [status, setStatus] = useState("pending");
  const [data, setData] = useState({ withdrawals: [], stats: {} });
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/admin/physical-qr/agent-withdrawals", { params: { status } });
      setData(data);
    } catch { /* ignore */ }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const process = async (wid, action) => {
    setBusy(wid);
    try {
      await api.post(`/admin/physical-qr/agent-withdrawals/${wid}/${action}`, null,
        action === "reject" ? { params: { reason: "Rejected by admin" } } : undefined);
      toast.success(`Withdrawal ${action}d`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setBusy(""); }
  };

  const stats = data.stats || {};
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[#0D47A1] text-white flex items-center justify-center"><Banknote className="w-5 h-5" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">Agent Withdraw</h1>
          <p className="text-sm text-slate-500">Review & approve field-agent payout requests (bank-verified agents only).</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {["pending", "approved", "rejected"].map((s) => (
          <button key={s} onClick={() => setStatus(s)}
            data-testid={`agent-wd-tab-${s}`}
            className={`text-xs px-3 py-1.5 rounded-full border capitalize ${status === s ? "bg-[#0D47A1] text-white border-[#0D47A1]" : "border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300"}`}>
            {s} ({stats[s] ?? 0})
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Agent</th>
                <th className="text-left px-4 py-3">Amount</th>
                <th className="text-left px-4 py-3">Bank</th>
                <th className="text-left px-4 py-3">Requested</th>
                <th className="text-right px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.withdrawals.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">No {status} requests.</td></tr>}
              {data.withdrawals.map((w) => (
                <tr key={w.id} data-testid="agent-wd-row">
                  <td className="px-4 py-3 text-slate-800 dark:text-slate-100">{w.agent_name}</td>
                  <td className="px-4 py-3 font-semibold">{money(w.amount)}</td>
                  <td className="px-4 py-3 text-xs text-slate-500">{w.bank?.account_number} · {w.bank?.ifsc}</td>
                  <td className="px-4 py-3 text-xs text-slate-400">{new Date(w.requested_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-right">
                    {w.status === "pending" ? (
                      <div className="flex items-center justify-end gap-2">
                        <button disabled={busy === w.id} onClick={() => process(w.id, "approve")} data-testid="agent-wd-approve"
                          className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 text-white disabled:opacity-50">Approve</button>
                        <button disabled={busy === w.id} onClick={() => process(w.id, "reject")} data-testid="agent-wd-reject"
                          className="text-xs px-3 py-1.5 rounded-lg border border-rose-300 text-rose-600 disabled:opacity-50">Reject</button>
                      </div>
                    ) : (
                      <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${w.status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{w.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
