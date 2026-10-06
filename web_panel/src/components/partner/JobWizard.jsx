import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ArrowLeft, ArrowRight, Camera, Video, X, Check, CheckCircle2, ShieldCheck, MapPin, Phone, Navigation, Clock, ClipboardList, User as UserIcon, Crosshair, Loader2, PlayCircle, Lock, AlertTriangle, Wrench, Trash2, Plus, BadgeCheck, RefreshCw } from "lucide-react";
import api, { fmt } from "@/lib/api";
import { toast } from "sonner";
import CameraCapture from "@/components/partner/CameraCapture";
import VideoCapture from "@/components/partner/VideoCapture";
import { RateCardModal } from "@/components/RateCardModal";
import { StatusBadge } from "@/components/partner/ui/kit";
import { isVideoUrl } from "@/components/WorkProof";
import JobDetailsBlock from "@/components/partner/JobDetailsBlock";

export const MAX_PROOF_FILES = 5;
const CHUNK = 700 * 1024;
const STEPS = [
  { key: "details", label: "Details", icon: ClipboardList },
  { key: "checkin", label: "Check-in", icon: Camera },
  { key: "start", label: "Start", icon: PlayCircle },
  { key: "complete", label: "Complete", icon: BadgeCheck },
];
const fmtDT = (iso) => (iso ? new Date(iso).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
const haversineKm = (a, b, c, d) => { const R = 6371, dLat = ((c - a) * Math.PI) / 180, dLng = ((d - b) * Math.PI) / 180; const x = Math.sin(dLat / 2) ** 2 + Math.cos((a * Math.PI) / 180) * Math.cos((c * Math.PI) / 180) * Math.sin(dLng / 2) ** 2; return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)); };
const errMsg = (e, d) => e?.response?.data?.detail || d;

/** Which wizard step the booking is really at (server truth). */
export function phaseOf(b) {
  if (!b) return 0;
  if (["completed", "paid"].includes(b.status)) return 4;
  if (b.status === "started") return 3;
  if (b.checkin) return 2;
  return 1;
}

const blobToB64 = (blob) => new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(",")[1] || ""); fr.onerror = () => rej(new Error("read failed")); fr.readAsDataURL(blob); });

/** Chunked base64 video upload → /bookings/{id}/evidence/chunk */
async function uploadVideoChunked(bookingId, stage, file, onProgress) {
  const b64 = await blobToB64(file);
  const total = Math.max(1, Math.ceil(b64.length / CHUNK));
  const upload_id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  let out = null;
  for (let i = 0; i < total; i++) {
    out = (await api.post(`/bookings/${bookingId}/evidence/chunk`, { stage, upload_id, index: i, total, content_type: file.type || "video/webm", data: b64.slice(i * CHUNK, (i + 1) * CHUNK) })).data;
    onProgress?.(Math.round(((i + 1) / total) * 100));
  }
  return out;
}

export function OtpBoxes({ value, onChange, len = 4, testid = "otp-boxes" }) {
  const refs = useRef([]);
  const digits = Array.from({ length: len }, (_, i) => (value || "")[i] || "");
  const setAt = (i, d) => { const arr = (value || "").padEnd(len, " ").split(""); arr[i] = d || " "; onChange(arr.join("").replace(/ /g, "").slice(0, len)); if (d && refs.current[i + 1]) refs.current[i + 1].focus(); };
  // Paste / keyboard-suggested code → spread digits across the boxes from box i.
  const fillFrom = (i, digitsStr) => {
    const arr = (value || "").padEnd(len, " ").split("");
    digitsStr.slice(0, len - i).split("").forEach((c, k) => { arr[i + k] = c; });
    const next = arr.join("").replace(/ /g, "").slice(0, len);
    onChange(next);
    refs.current[Math.min(len - 1, i + digitsStr.length)]?.focus();
  };
  const onBoxChange = (i, raw, d) => {
    const t = raw.replace(/\D/g, "");
    if (t.length > 2 || (t.length === 2 && !d)) return fillFrom(t.length >= len ? 0 : i, t);
    setAt(i, t.slice(-1));
  };
  return (
    <div className="flex gap-2.5 justify-center" data-testid={testid}
      onPaste={(e) => { const t = (e.clipboardData.getData("text") || "").replace(/\D/g, ""); if (t) { e.preventDefault(); fillFrom(t.length >= len ? 0 : Math.max(0, refs.current.indexOf(document.activeElement)), t); } }}>
      {digits.map((d, i) => (
        <input key={i} ref={(el) => (refs.current[i] = el)} inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={len} value={d} data-testid={`otp-box-${i}`}
          onChange={(e) => onBoxChange(i, e.target.value, d)}
          onKeyDown={(e) => { if (e.key === "Backspace" && !d && i > 0) { e.preventDefault(); setAt(i - 1, ""); refs.current[i - 1]?.focus(); } }}
          onFocus={(e) => { e.target.select(); setTimeout(() => e.target.scrollIntoView({ block: "center", behavior: "smooth" }), 250); }}
          className="h-14 w-14 rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-center text-2xl font-extrabold text-slate-900 dark:text-white focus:border-primary-500 focus:ring-2 focus:ring-primary-200 outline-none transition" />
      ))}
    </div>
  );
}

function ProofGrid({ items, onPhoto, onVideo, onRemove, busy, progress, testid, locked }) {
  const [playing, setPlaying] = useState(null);
  const full = items.length >= MAX_PROOF_FILES;
  return (
    <div data-testid={testid}>
      <div className="flex items-center justify-between mb-2.5">
        <p className="text-xs font-semibold text-slate-500">Photos & videos · live camera only</p>
        <span data-testid={`${testid}-count`} className={`text-[11px] font-extrabold rounded-md px-2.5 py-0.5 ${items.length ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{items.length}/{MAX_PROOF_FILES}</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
        {items.map((u, i) => (
          <div key={u} className="relative aspect-square rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100" data-testid={`${testid}-item-${i}`}>
            {isVideoUrl(u)
              ? <button type="button" data-testid={`${testid}-play-${i}`} onClick={() => setPlaying(u)} className="h-full w-full grid place-items-center bg-slate-900 text-white"><PlayCircle className="h-8 w-8" /><span className="absolute bottom-1 text-[10px] font-bold text-slate-300">VIDEO</span></button>
              : <img src={u} alt="" className="h-full w-full object-cover" />}
            <button type="button" data-testid={`${testid}-remove-${i}`} disabled={busy} onClick={() => onRemove(u)} className="absolute top-1 right-1 h-6 w-6 rounded-full bg-black/65 text-white grid place-items-center"><X className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        {!full && !locked && (
          <>
            <button type="button" data-testid={`${testid}-photo`} disabled={busy} onClick={onPhoto} className="aspect-square rounded-md border-2 border-dashed border-primary-300 bg-primary-50/70 text-primary-700 grid place-items-center hover:bg-primary-100 transition disabled:opacity-60">
              <span className="flex flex-col items-center gap-1"><Camera className="h-6 w-6" /><span className="text-[11px] font-bold">Photo</span></span>
            </button>
            <button type="button" data-testid={`${testid}-video`} disabled={busy} onClick={onVideo} className="aspect-square rounded-md border-2 border-dashed border-violet-300 bg-violet-50/80 text-violet-700 grid place-items-center hover:bg-violet-100 transition disabled:opacity-60">
              <span className="flex flex-col items-center gap-1"><Video className="h-6 w-6" /><span className="text-[11px] font-bold">Video ≤30s</span></span>
            </button>
          </>
        )}
      </div>
      {busy && <p data-testid={`${testid}-uploading`} className="mt-2 text-xs font-semibold text-slate-500 flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {progress ? `Uploading video… ${progress}%` : "Uploading…"}</p>}
      <p className="text-[11px] text-slate-400 mt-2">{full ? `Maximum ${MAX_PROOF_FILES} files reached — remove one to add another.` : "Gallery upload is not allowed. Max 5 files, videos up to 30 sec."}</p>
      {playing && createPortal(
        <div data-testid="video-player-modal" className="fixed inset-0 z-[300] bg-black/90 flex items-center justify-center p-4" onClick={() => setPlaying(null)}>
          <video src={playing} controls autoPlay playsInline className="max-h-full max-w-full rounded-xl" onClick={(e) => e.stopPropagation()} />
        </div>, document.body)}
    </div>
  );
}

const Card = ({ children, className = "", testid }) => <div data-testid={testid} className={`rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 ${className}`}>{children}</div>;
const Title = ({ icon: Icon, children }) => <p className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-2.5"><Icon className="h-3.5 w-3.5" /> {children}</p>;

function DetailsStep({ b }) {
  const [tlOpen, setTlOpen] = useState(false);
  const a = b.address || {};
  const timeline = b.timeline || [];
  const dest = a.lat && a.lng ? `${a.lat},${a.lng}` : encodeURIComponent(`${a.line || ""}, ${a.city || ""}`);
  return (
    <>
      <Card testid="wizard-details">
        <Title icon={ClipboardList}>Job details</Title>
        <JobDetailsBlock b={b} />
      </Card>
      <Card testid="wizard-customer">
        <Title icon={UserIcon}>Customer details</Title>
        <div className="flex items-center gap-3">
          <span className="h-11 w-11 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary-700 font-black grid place-items-center">{String(b.customer_name || "C").trim().charAt(0).toUpperCase()}</span>
          <div className="min-w-0"><p className="font-heading font-extrabold text-slate-900 dark:text-white">{b.customer_name || "Customer"}</p>{b.customer_phone && <p className="text-xs text-slate-500">{b.customer_phone}</p>}</div>
        </div>
        <p className="text-[13.5px] text-slate-600 dark:text-slate-300 mt-3 flex items-start gap-1.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 p-2.5"><MapPin className="h-4 w-4 text-primary-600 shrink-0 mt-0.5" /> {a.line || "Address unavailable"}{a.landmark ? `, ${a.landmark}` : ""}{a.city ? `, ${a.city}` : ""}{a.pincode ? ` · ${a.pincode}` : ""}</p>
        <div className="grid grid-cols-2 gap-2 mt-3">
          {b.customer_phone ? <a href={`tel:${b.customer_phone}`} data-testid="wizard-call" className="h-10 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 font-bold text-sm flex items-center justify-center gap-1.5"><Phone className="h-4 w-4" /> Call</a> : <span />}
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${dest}`} target="_blank" rel="noreferrer" data-testid="wizard-navigate" className="h-10 rounded-xl border border-primary-200 bg-primary-50 text-primary-700 font-bold text-sm flex items-center justify-center gap-1.5"><Navigation className="h-4 w-4" /> Navigate</a>
        </div>
      </Card>
      {timeline.length > 0 && (
        <Card testid="wizard-timeline">
          <button type="button" data-testid="wizard-timeline-toggle" onClick={() => setTlOpen((o) => !o)} className="w-full flex items-center justify-between">
            <span className="text-[11.5px] font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Job timeline <span className="rounded-md bg-primary-50 text-primary-700 px-2 py-0.5 text-[10.5px]">{timeline.length}</span></span>
            <ChevronDown className={`h-5 w-5 text-slate-400 transition-transform ${tlOpen ? "rotate-180" : ""}`} />
          </button>
          {tlOpen && (
            <ol data-testid="wizard-timeline-list" className="relative border-l border-slate-200 dark:border-slate-700 ml-1.5 space-y-3 pt-1 mt-3">
              {timeline.map((t, i) => <li key={i} className="ml-4"><span className={`absolute -left-[7px] mt-0.5 h-3 w-3 rounded-full ring-4 ring-primary-100 ${i === timeline.length - 1 ? "bg-primary-600" : "bg-slate-300"}`} /><p className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 capitalize">{String(t.status || "").replace(/_/g, " ")}</p><p className="text-[11px] text-slate-400">{t.at ? new Date(t.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</p></li>)}
            </ol>
          )}
        </Card>
      )}
    </>
  );
}

function CheckinStep({ b, onDone }) {
  const [selfie, setSelfie] = useState(null); // { file, url }
  const [camOpen, setCamOpen] = useState(false);
  const [loc, setLoc] = useState(null);
  const [locBusy, setLocBusy] = useState(false);
  const [sending, setSending] = useState(false);
  const a = b.address || {};
  const locked = !!b.schedule?.comm_locked;
  const dist = useMemo(() => (loc && a.lat && a.lng ? haversineKm(loc.lat, loc.lng, Number(a.lat), Number(a.lng)) : null), [loc, a.lat, a.lng]);
  const getLocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported on this device");
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }); setLocBusy(false); },
      (e) => { setLocBusy(false); toast.error(e && e.code === 1 ? "Location permission denied. Allow location access for check-in." : "Couldn't get your location. Check GPS and try again."); },
      { enableHighAccuracy: true, timeout: 12000 });
  };
  useEffect(() => { if (!b.checkin) getLocation(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = async () => {
    if (!selfie || !loc) return;
    setSending(true);
    try {
      const fd = new FormData(); fd.append("file", selfie.file); fd.append("lat", String(loc.lat)); fd.append("lng", String(loc.lng));
      await api.post(`/bookings/${b.id}/checkin/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success("Checked in ✓ — you're marked Arrived"); onDone();
    } catch (e) { toast.error(errMsg(e, "Check-in failed, please retry")); }
    finally { setSending(false); }
  };
  if (b.checkin) {
    const c = b.checkin;
    return (
      <Card testid="wizard-checkin-done">
        <Title icon={CheckCircle2}>Checked in</Title>
        <div className="flex gap-4 items-center">
          <img src={c.selfie_url} alt="selfie" className="h-28 w-24 rounded-xl object-cover border border-slate-200" />
          <div className="text-sm"><p className="font-extrabold text-emerald-700">Selfie & location recorded</p><p className="text-slate-500 text-xs mt-1">{fmtDT(c.at)}</p>{c.distance_km != null && <p className={`text-xs font-semibold mt-1 ${c.far ? "text-amber-700" : "text-slate-500"}`}>~{c.distance_km} km from customer address</p>}</div>
        </div>
      </Card>
    );
  }
  const ready = selfie && loc && !sending && !locked;
  return (
    <>
      <Card testid="wizard-checkin">
        <Title icon={Camera}>Step 1 · Live selfie</Title>
        <p className="text-xs text-slate-500 mb-3">Take a clear selfie at the customer's door. Front camera only — shared with the customer & admin for safety.</p>
        <button type="button" data-testid="wizard-selfie-btn" onClick={() => setCamOpen(true)} className={`mx-auto block h-52 w-40 rounded-2xl overflow-hidden border-2 ${selfie ? "border-emerald-500" : "border-dashed border-primary-300 bg-primary-50/70"} grid place-items-center`}>
          {selfie ? <img src={selfie.url} alt="selfie" className="h-full w-full object-cover" /> : <span className="flex flex-col items-center gap-2 text-primary-700"><Camera className="h-9 w-9" /><span className="text-sm font-bold">Take selfie</span></span>}
        </button>
        {selfie && <button type="button" data-testid="wizard-selfie-retake" onClick={() => setCamOpen(true)} className="mx-auto block mt-2 text-sm font-bold text-primary-700">Retake</button>}
      </Card>
      <Card testid="wizard-location">
        <Title icon={Crosshair}>Step 2 · Live location</Title>
        {loc ? (
          <div className="flex items-center gap-3">
            <span className="h-10 w-10 rounded-full bg-emerald-100 text-emerald-700 grid place-items-center shrink-0"><MapPin className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1"><p data-testid="wizard-location-ok" className="text-sm font-bold text-slate-800 dark:text-slate-100">Location captured</p><p className="text-xs text-slate-500">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}{loc.acc ? ` · ±${Math.round(loc.acc)} m` : ""}</p>{dist != null && <p className={`text-xs font-bold mt-0.5 ${dist > 0.5 ? "text-amber-700" : "text-emerald-700"}`}>{dist > 0.5 ? `You appear ~${dist.toFixed(1)} km from the customer's address` : "You're at the customer's location ✓"}</p>}</div>
            <button type="button" data-testid="wizard-location-refresh" onClick={getLocation} className="text-slate-400 hover:text-slate-600"><RefreshCw className="h-4 w-4" /></button>
          </div>
        ) : (
          <button type="button" data-testid="wizard-location-btn" onClick={getLocation} disabled={locBusy} className="w-full h-11 rounded-md border border-primary-200 text-primary-700 font-bold text-sm flex items-center justify-center gap-2">{locBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Crosshair className="h-4 w-4" />} {locBusy ? "Getting location…" : "Share live location"}</button>
        )}
      </Card>
      {locked && <p className="rounded-xl bg-slate-100 dark:bg-slate-800 p-3 text-xs text-slate-500 flex items-center gap-2"><Lock className="h-4 w-4" /> Check-in opens 30 minutes before the scheduled time ({b.schedule?.scheduled_time}).</p>}
      <button type="button" data-testid="wizard-checkin-submit" disabled={!ready} onClick={submit} className="w-full h-13 py-3.5 rounded-2xl bg-primary-700 hover:bg-primary-800 text-white font-extrabold flex items-center justify-center gap-2 disabled:opacity-45">{sending ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} {sending ? "Checking in…" : "Check-in & Continue"}</button>
      <CameraCapture key={camOpen ? "selfie-open" : "selfie-closed"} open={camOpen} title="Take your live selfie" initialFacing="user" faceGuide onClose={() => setCamOpen(false)}
        onCapture={(file) => { setSelfie({ file, url: URL.createObjectURL(file) }); setCamOpen(false); }} />
    </>
  );
}

function AdditionalWork({ b, onUpdate }) {
  const [rcCard, setRcCard] = useState(null);
  const [rcOpen, setRcOpen] = useState(false);
  const addl = b.additional || null;
  useEffect(() => { if (!b.category_id) return; api.get(`/ratecards/by-category/${b.category_id}`).then((r) => { if (r.data && (r.data.groups || []).length) setRcCard(r.data); }).catch(() => {}); }, [b.category_id]);
  const addRow = async (row) => {
    // Billing rule: the rate card's service/product charge is the ITEM cost — it goes
    // 100% to the partner, tax-free & commission-free (→ part_charge). Only the labour
    // charge is commissionable, and GST is levied solely on that commission portion.
    const part = Number(row.service_charge) || 0;
    const labour = Number(row.labour_charge) || 0;
    if (part <= 0 && labour <= 0) return toast.error("This item has no charge to add");
    try { await api.post(`/bookings/${b.id}/additional`, { items: [{ description: row.description, part_charge: part, labour_charge: labour, warranty: row.warranty || "", ratecard_row_id: row.id, category_id: b.category_id }] }); toast.success(`Added "${row.description}" — ask customer to pay`); onUpdate(); }
    catch (e) { toast.error(errMsg(e, "Failed to add")); }
  };
  const remove = async (id) => { try { await api.delete(`/bookings/${b.id}/additional/${id}`); toast.success("Removed"); onUpdate(); } catch (e) { toast.error(errMsg(e, "Failed")); } };
  return (
    <Card testid={`additional-section-${b.code}`}>
      <div className="flex items-center justify-between mb-1.5">
        <Title icon={Wrench}>Additional work</Title>
        {addl && (addl.total || 0) > 0 && <span className={`text-[11px] font-bold rounded-md px-2.5 py-0.5 ${addl.status === "paid" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{addl.status === "paid" ? "Paid" : "Payment pending"}</span>}
      </div>
      <p className="text-xs text-slate-500 mb-3">If any extra parts or labour were used, add them from the category rate card. <b className="text-amber-700">Collect the payment for additional work from the customer first, then complete the job.</b></p>
      {addl && (addl.items || []).length > 0 && (
        <div className="space-y-1.5 mb-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg p-3">
          {addl.items.map((it) => <div key={it.id} className="flex items-center justify-between text-sm"><span className="text-slate-700 dark:text-slate-200">{it.description}<span className="text-slate-400"> · {fmt((Number(it.part_charge) || 0) + (Number(it.labour_charge) || 0))}</span></span>{addl.status !== "paid" && <button data-testid={`addl-remove-${it.id}`} onClick={() => remove(it.id)} className="text-red-500 ml-2"><Trash2 className="h-4 w-4" /></button>}</div>)}
          <div className="flex justify-between text-sm font-extrabold text-slate-900 dark:text-white pt-1.5 border-t border-slate-200"><span>Additional total</span><span>{fmt(addl.total)}</span></div>
          {addl.status === "paid" ? <p className="text-[12px] text-emerald-700 font-semibold flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Customer paid — you can complete the job now</p> : <p className="text-[12px] text-amber-700 font-semibold flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Waiting for customer to pay the additional amount</p>}
        </div>
      )}
      {addl?.status !== "paid" && (rcCard
        ? <button type="button" data-testid={`add-additional-${b.code}`} onClick={() => setRcOpen(true)} className="h-9 px-3 rounded-md border border-primary-300 text-primary-700 text-sm font-semibold inline-flex items-center gap-1"><Plus className="h-4 w-4" /> Add from rate card</button>
        : <p className="text-xs text-slate-400">No rate card configured for this category — additional work unavailable.</p>)}
      {rcOpen && rcCard && <RateCardModal card={rcCard} onClose={() => setRcOpen(false)} onAdd={addRow} />}
    </Card>
  );
}

// Track the visual viewport so the wizard shrinks to sit right above the mobile keyboard (no blank gap).
function useVisualViewport() {
  const [v, setV] = useState({ h: 0, top: 0 });
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;
    const on = () => setV({ h: vv.height, top: vv.offsetTop });
    on();
    vv.addEventListener("resize", on); vv.addEventListener("scroll", on);
    return () => { vv.removeEventListener("resize", on); vv.removeEventListener("scroll", on); };
  }, []);
  return v;
}

/** Full-screen step wizard: Details → Selfie check-in → Before proof + Start OTP → After proof + Complete OTP */
export default function JobWizard({ booking: initial, onClose, onUpdate }) {
  const [b, setB] = useState(initial);
  const phase = phaseOf(b);
  const [step, setStep] = useState(0);
  const [otp, setOtp] = useState("");
  const { h: vh, top: vTop } = useVisualViewport();
  const [busy, setBusy] = useState(null);
  const [progress, setProgress] = useState(0);
  const [cam, setCam] = useState(null); // { stage, kind }
  const [nowTs, setNowTs] = useState(() => Date.now());

  const reload = async () => { try { const r = await api.get(`/bookings/partner/job/${b.id}`); setB(r.data); } catch { /* keep */ } onUpdate?.(); };
  useEffect(() => { const id = setInterval(reload, 10000); return () => clearInterval(id); }, [b.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (step > 0 && phase > step) setStep(phase); }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (b.status !== "started") return undefined; const id = setInterval(() => setNowTs(Date.now()), 1000); return () => clearInterval(id); }, [b.status]);
  useEffect(() => { const onKey = (e) => { if (e.key === "Escape" && !cam) onClose?.(); }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, [cam, onClose]);

  const before = b.evidence?.before || [], after = b.evidence?.after || [];
  const locked = !!b.schedule?.comm_locked;
  const addl = b.additional || null;
  const addlPending = !!addl && (addl.total || 0) > 0 && addl.status !== "paid";
  const demo = b.demo_otps || {};
  const startedAt = (b.timeline || []).filter((t) => ["started", "in_progress"].includes(t.status)).map((t) => t.at).pop();
  const es = startedAt ? Math.max(0, Math.floor((nowTs - new Date(startedAt).getTime()) / 1000)) : 0;
  const elapsed = `${String(Math.floor(es / 3600)).padStart(2, "0")}:${String(Math.floor((es % 3600) / 60)).padStart(2, "0")}:${String(es % 60).padStart(2, "0")}`;

  const uploadPhoto = async (file) => {
    setBusy(`${cam.stage}-photo`);
    try { const fd = new FormData(); fd.append("stage", cam.stage); fd.append("file", file); await api.post(`/bookings/${b.id}/evidence/upload`, fd, { headers: { "Content-Type": "multipart/form-data" } }); toast.success("Photo added ✓"); setCam(null); await reload(); }
    catch (e) { toast.error(errMsg(e, "Upload failed, please retake")); }
    finally { setBusy(null); }
  };
  const uploadVideo = async (file) => {
    if (file.size > 25 * 1024 * 1024) return toast.error("Video too large (max 25 MB). Record a shorter clip.");
    setBusy(`${cam.stage}-video`); setProgress(0);
    try { await uploadVideoChunked(b.id, cam.stage, file, setProgress); toast.success("Video added ✓"); setCam(null); await reload(); }
    catch (e) { toast.error(errMsg(e, "Video upload failed, please retry")); }
    finally { setBusy(null); setProgress(0); }
  };
  const removeProof = async (stage, url) => { try { await api.post(`/bookings/${b.id}/evidence/remove`, { stage, url }); toast.success("Removed"); await reload(); } catch (e) { toast.error(errMsg(e, "Could not remove")); } };
  const verify = async (path, label) => { setBusy(path); try { await api.post(`/bookings/${b.id}/${path}`, { otp }); toast.success(label); setOtp(""); await reload(); } catch (e) { setOtp(""); toast.error(errMsg(e, "Invalid OTP")); } finally { setBusy(null); } };

  const cur = Math.min(step, 3);
  const footer = phase === 4
    ? <FooterBtn testid="wizard-finish" onClick={onClose} className="bg-emerald-600 hover:bg-emerald-700"><ArrowLeft className="h-5 w-5" /> Back to Active Jobs</FooterBtn>
    : step === 0 ? <FooterBtn testid="wizard-continue" onClick={() => setStep(phase)}>{phase >= 3 ? "Continue to Complete Job" : phase >= 2 ? "Continue to Start Job" : "Continue"} <ArrowRight className="h-5 w-5" /></FooterBtn>
    : step === 1 ? (phase >= 2 ? <FooterBtn testid="wizard-next" onClick={() => setStep(2)}>Continue to Start Job <ArrowRight className="h-5 w-5" /></FooterBtn> : <p className="text-center text-xs text-slate-500">Take your selfie & share live location above, then tap <b>Check-in & Continue</b>.</p>)
    : step === 2 ? <FooterBtn testid={`start-otp-${b.code}`} disabled={locked || !before.length || otp.length < 4 || !!busy} onClick={() => verify("start-otp", "Job started ✓")}><PlayCircle className="h-5 w-5" /> {busy === "start-otp" ? "Verifying…" : "Verify OTP & Start Job"}</FooterBtn>
    : <FooterBtn testid={`complete-otp-${b.code}`} disabled={addlPending || !after.length || otp.length < 4 || !!busy} onClick={() => verify("complete", "Job completed! Earnings credited 🎉")} className="bg-emerald-600 hover:bg-emerald-700"><BadgeCheck className="h-5 w-5" /> {busy === "complete" ? "Completing…" : addlPending ? "Additional payment pending" : "Verify OTP & Complete Job"}</FooterBtn>;

  return createPortal(
    <div className="fixed left-0 right-0 top-0 z-[150] bg-slate-50 dark:bg-slate-950 flex flex-col" style={{ height: vh ? `${vh}px` : "100dvh", top: vTop }} data-testid="job-wizard">
      <div className="bg-gradient-to-br from-primary-700 to-primary-500 text-white px-4 pt-4 pb-4 shrink-0">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <button type="button" data-testid="wizard-back" onClick={onClose} className="h-9 w-9 rounded-full bg-white/15 hover:bg-white/25 grid place-items-center"><ArrowLeft className="h-5 w-5" /></button>
            <div className="min-w-0 flex-1"><p className="font-heading font-extrabold truncate">{b.service_name}</p><p className="text-[11.5px] text-white/75 font-mono">#{b.code}</p></div>
            <StatusBadge status={b.status} />
          </div>
          <div className="flex items-start mt-4" data-testid="wizard-steps">
            {STEPS.map((s, i) => { const done = i < cur || phase === 4, active = i === cur && phase !== 4; const I = s.icon; return (
              <div key={s.key} className="flex-1 flex flex-col items-center">
                <div className="flex items-center w-full">
                  <div className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : done || active ? "bg-white" : "bg-white/30"}`} />
                  <div data-testid={`wizard-step-${s.key}${active ? "-active" : done ? "-done" : ""}`} className={`h-8 w-8 rounded-full grid place-items-center shrink-0 ${done || active ? "bg-white text-primary-700" : "bg-white/20 text-white"} ${active ? "ring-4 ring-white/40" : ""}`}>{done ? <Check className="h-4 w-4" /> : <I className="h-4 w-4" />}</div>
                  <div className={`h-0.5 flex-1 ${i === STEPS.length - 1 ? "opacity-0" : done ? "bg-white" : "bg-white/30"}`} />
                </div>
                <span className={`text-[10.5px] mt-1.5 ${active ? "font-extrabold" : "font-semibold text-white/70"}`}>{s.label}</span>
              </div>); })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto"><div className="max-w-2xl mx-auto p-4 space-y-3.5 pb-8">
        {phase === 4 ? (
          <Card testid="wizard-done" className="text-center py-10">
            <span className="mx-auto h-20 w-20 rounded-full bg-emerald-100 text-emerald-600 grid place-items-center"><BadgeCheck className="h-11 w-11" /></span>
            <p className="font-heading text-2xl font-black text-slate-900 dark:text-white mt-4">Job completed!</p>
            <p className="text-sm text-slate-500 mt-1">{b.service_name} · #{b.code}</p>
            {(b.commission?.partner_earning ?? b.breakdown?.earning?.net_earning) != null && <div className="inline-block mt-4 rounded-2xl bg-emerald-50 border border-emerald-200 px-6 py-3"><p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700">You earned</p><p className="text-2xl font-black text-emerald-700">{fmt(b.commission?.partner_earning ?? b.breakdown?.earning?.net_earning)}</p></div>}
          </Card>
        ) : step === 0 ? <DetailsStep b={b} />
        : step === 1 ? <CheckinStep b={b} onDone={reload} />
        : step === 2 ? (
          <>
            {locked && <div data-testid={`start-locked-${b.code}`} className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 text-xs text-slate-500"><p className="font-bold uppercase tracking-wider flex items-center gap-1.5 text-[11px]"><Lock className="h-3.5 w-3.5" /> Start Work locked</p><p className="mt-1">You can start this job 30 minutes before {b.schedule?.scheduled_time} on {b.schedule?.scheduled_date}.</p></div>}
            <Card testid="wizard-before-proof"><Title icon={Camera}>Before work proof</Title><ProofGrid items={before} locked={locked} busy={!!busy && String(busy).startsWith("before")} progress={progress} testid={`before-ev-${b.code}`} onPhoto={() => setCam({ stage: "before", kind: "photo" })} onVideo={() => setCam({ stage: "before", kind: "video" })} onRemove={(u) => removeProof("before", u)} /></Card>
            <Card testid="wizard-start-otp" className="border-primary-100 bg-primary-50/40"><Title icon={ShieldCheck}>Customer verification</Title><p className="text-xs text-slate-500 mb-3.5">Ask the customer for their <b>Start OTP</b> to begin the job.</p><OtpBoxes value={otp} onChange={setOtp} />{demo.start && <p data-testid="demo-start-otp" className="text-center text-xs font-bold text-sky-700 mt-2.5">Demo · Start OTP {demo.start}</p>}{!before.length && <p className="text-center text-xs font-semibold text-amber-700 mt-2.5">Add at least one before-work photo/video to enable Start.</p>}</Card>
          </>
        ) : (
          <>
            <div className="rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-3.5 flex items-center gap-3"><span className="h-2.5 w-2.5 rounded-full bg-white animate-pulse" /><div className="flex-1"><p className="font-heading font-extrabold text-sm">WORK IN PROGRESS</p><p className="text-[11.5px] text-amber-50/90">{startedAt ? `Started ${new Date(startedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</p></div><span data-testid={`elapsed-${b.code}`} className="font-mono font-bold tabular-nums bg-white/20 rounded-lg px-2.5 py-1">{elapsed}</span></div>
            <Card testid="wizard-after-proof"><Title icon={Camera}>After work proof</Title><ProofGrid items={after} busy={!!busy && String(busy).startsWith("after")} progress={progress} testid={`after-ev-${b.code}`} onPhoto={() => setCam({ stage: "after", kind: "photo" })} onVideo={() => setCam({ stage: "after", kind: "video" })} onRemove={(u) => removeProof("after", u)} /></Card>
            <AdditionalWork b={b} onUpdate={reload} />
            {addlPending ? (
              <div data-testid={`complete-locked-${b.code}`} className="rounded-xl border-2 border-amber-300 bg-amber-50 px-4 py-3"><p className="text-sm font-extrabold text-amber-800 flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Additional payment pending</p><p className="text-xs text-amber-700 mt-1">Customer must pay the additional work first — then complete with OTP.</p></div>
            ) : (
              <Card testid="wizard-complete-otp" className="border-emerald-100 bg-emerald-50/40"><Title icon={CheckCircle2}>Complete the job</Title><p className="text-xs text-slate-500 mb-3.5">Enter the customer's <b>Completion OTP</b> to finish & credit your earnings.</p><OtpBoxes value={otp} onChange={setOtp} />{demo.completion && <p data-testid="demo-complete-otp" className="text-center text-xs font-bold text-sky-700 mt-2.5">Demo · Completion OTP {demo.completion}</p>}{!after.length && <p className="text-center text-xs font-semibold text-amber-700 mt-2.5">Add at least one after-work photo/video to enable Complete.</p>}</Card>
            )}
          </>
        )}
      </div></div>

      <div className="shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3" data-testid="wizard-footer"><div className="max-w-2xl mx-auto">{footer}</div></div>

      <CameraCapture key={cam?.kind === "photo" ? `${cam.stage}-photo` : "cam-closed"} open={cam?.kind === "photo"} title={`Capture ${cam?.stage === "before" ? "BEFORE" : "AFTER"}-work photo`} uploading={!!busy} onClose={() => { if (!busy) setCam(null); }} onCapture={uploadPhoto} />
      <VideoCapture key={cam?.kind === "video" ? `${cam.stage}-video` : "vid-closed"} open={cam?.kind === "video"} title={`Record ${cam?.stage === "before" ? "BEFORE" : "AFTER"}-work video (≤30s)`} uploading={!!busy} progress={progress} onClose={() => { if (!busy) setCam(null); }} onCapture={uploadVideo} />
    </div>,
    document.body
  );
}

function FooterBtn({ children, onClick, disabled, testid, className = "bg-primary-700 hover:bg-primary-800" }) {
  return <button type="button" data-testid={testid} disabled={disabled} onClick={onClick} className={`w-full h-13 py-3.5 rounded-2xl text-white font-extrabold flex items-center justify-center gap-2 transition disabled:opacity-45 ${className}`}>{children}</button>;
}
