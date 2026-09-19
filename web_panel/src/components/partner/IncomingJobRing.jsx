import React, { useEffect, useRef, useState, useCallback } from "react";
import { Phone, PhoneOff, MapPin, IndianRupee, Briefcase, Clock, Zap, BellOff, Navigation } from "lucide-react";
import api from "@/lib/api";
import { useRealtime } from "@/context/RealtimeContext";
import { getRingPrefs, isDndActive, isSnoozed, TONES, playCustomSound, stopCustomSound, syncPrefsFromServer } from "@/lib/ringPrefs";
import { toast } from "sonner";

// Job requests NEVER auto-decline anymore — the request stays on screen until the
// partner Accepts / Rejects, or another partner grabs it. We only show how long it
// has been waiting (elapsed), never a countdown that cancels the job.

/**
 * Full-screen, call-style incoming job request UI for partners.
 * - Listens to the SSE "job_request" event and queues incoming requests.
 * - Plays a loud, looping ringtone (Web Audio, no asset) + vibration until the
 *   partner Accepts / Rejects or the offer expires.
 * - Also handles deep-links from a push notification: /partner?job=<id>&ring=accept|reject|open
 */
export default function IncomingJobRing({ onAccepted, onChanged }) {
  const { subscribe } = useRealtime();
  const [queue, setQueue] = useState([]);
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [myPos, setMyPos] = useState(null);
  const handledRef = useRef(new Set());     // ids already accepted/rejected
  const ring = useRef({ ctx: null, timer: null });

  const current = queue[0] || null;
  const silent = current ? (isDndActive() && current.schedule_type !== "emergency") : false;

  // Grab the partner's location once (best-effort) to estimate distance/ETA.
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setMyPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {}, { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 });
  }, []);

  const distanceKm = (() => {
    if (!current || !myPos || current.lat == null || current.lng == null) return null;
    const R = 6371, toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(current.lat - myPos.lat), dLng = toRad(current.lng - myPos.lng);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(myPos.lat)) * Math.cos(toRad(current.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  })();
  const etaMin = distanceKm != null ? Math.max(3, Math.round((distanceKm / 25) * 60)) : null;

  /* ------------------------- ringtone engine ------------------------- */
  const ensureCtx = useCallback(() => {
    const r = ring.current;
    if (!r.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) r.ctx = new AC();
    }
    if (r.ctx && r.ctx.state === "suspended") r.ctx.resume().catch(() => {});
    return r.ctx;
  }, []);

  const ringOnce = useCallback((ctx, prefs) => {
    const now = ctx.currentTime;
    const vol = Math.max(0.05, Math.min(1, prefs.volume != null ? prefs.volume : 0.7));
    const pattern = TONES[prefs.tone] || TONES.classic;
    pattern.forEach(({ f, t }) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = "sine"; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, now + t);
      g.gain.exponentialRampToValueAtTime(vol, now + t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.42);
      o.start(now + t); o.stop(now + t + 0.46);
    });
  }, []);

  const startRing = useCallback(() => {
    const r = ring.current;
    if (r.timer || r.customPlaying) return;  // already ringing — never stack instances
    const prefs = getRingPrefs();
    // Do-Not-Disturb: stay silent for non-emergency requests during quiet hours.
    if (isDndActive(prefs) && current && current.schedule_type !== "emergency") return;
    const vibrate = () => { try { if (navigator.vibrate) navigator.vibrate([400, 180, 400]); } catch { /* ignore */ } };
    if (prefs.customSoundUrl) {
      // Admin-uploaded ring: play ONCE with native loop so the COMPLETE tone
      // repeats seamlessly (never cut mid-way, never restarted from the middle)
      // until the partner accepts/rejects or it expires.
      playCustomSound(prefs.customSoundUrl, prefs.volume, true);
      r.customPlaying = true;
      vibrate();
      r.timer = setInterval(vibrate, 1700);  // vibration pulse only
    } else {
      // Synthesized tone: re-trigger the short pattern each beat for a classic ring.
      const beat = () => {
        const ctx = ensureCtx();
        try { if (ctx) ringOnce(ctx, getRingPrefs()); } catch { /* ignore */ }
        vibrate();
      };
      beat();
      r.timer = setInterval(beat, 1700);
    }
  }, [ensureCtx, ringOnce, current]);

  const stopRing = useCallback(() => {
    const r = ring.current;
    if (r.timer) { clearInterval(r.timer); r.timer = null; }
    r.customPlaying = false;
    stopCustomSound();
    try { if (navigator.vibrate) navigator.vibrate(0); } catch { /* ignore */ }
  }, []);

  // Pull the admin ring config (tone / volume / custom sound / quiet hours) once.
  useEffect(() => { syncPrefsFromServer().catch(() => {}); }, []);

  // Prime the audio context on the first user gesture so the ring can play
  // instantly the moment a request arrives.
  useEffect(() => {
    const prime = () => ensureCtx();
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, [ensureCtx]);

  // Ring while there's a current request; stop otherwise.
  useEffect(() => {
    if (current) startRing(); else stopRing();
    return () => stopRing();
  }, [current, startRing, stopRing]);

  /* ------------------------- queue management ------------------------- */
  const removeFromQueue = useCallback((id) => {
    setQueue((q) => q.filter((j) => j.id !== id));
  }, []);

  const enqueue = useCallback((job, force = false) => {
    if (!job || !job.id) return;
    if (handledRef.current.has(job.id)) return;
    // Smart Snooze: while the partner is "busy", silently ignore non-emergency
    // requests — they are NOT enqueued, so they never auto-decline as missed and
    // the accept-streak stays intact. Emergency requests still come through.
    if (!force && isSnoozed() && job.schedule_type !== "emergency") return;
    const isTest = !!job.is_test || String(job.id).startsWith("test-");
    setQueue((q) => (q.find((x) => x.id === job.id) ? q : [...q, { ...job, is_test: isTest, _manual: isTest || job._manual, _at: Date.now() }]));
    if (isTest) return; // synthetic ring — nothing to record server-side
    // Tell the backend this partner's device actually displayed the ring so the
    // admin Live Dispatch feed can show delivered → seen → responded. Idempotent.
    try { api.post(`/bookings/${job.id}/seen`).catch(() => {}); } catch { /* ignore */ }
  }, []);

  // Auto-decline is REMOVED. A request never times out on its own — it waits for
  // the partner to Accept/Reject or for another partner to grab it (job_taken).

  // Elapsed timer for the current request (informational only — never cancels).
  useEffect(() => {
    if (!current) { setElapsed(0); return undefined; }
    setElapsed(0);
    const startedAt = Date.now();
    const iv = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(iv);
  }, [current]);

  // SSE: new job requests + jobs taken by someone else.
  useEffect(() => subscribe((ev) => {
    if (ev.type === "job_request") enqueue(ev.data || {});
    else if (ev.type === "job_taken") { const id = ev.data?.id; if (id) { handledRef.current.add(id); removeFromQueue(id); } }
  }), [subscribe, enqueue, removeFromQueue]);

  // RELIABILITY FALLBACK: SSE can drop on mobile / background tabs and push may be
  // unavailable. Poll the server for offers that should be ringing right now (every
  // 6s, and immediately when the tab regains focus / comes online) and enqueue any
  // we have not shown yet. Also drops rings for jobs that are no longer searching.
  useEffect(() => {
    let stopped = false;
    const check = async () => {
      if (stopped || document.visibilityState === "hidden") return;
      try {
        const { data } = await api.get("/bookings/partner/ring-pending");
        const list = Array.isArray(data) ? data : [];
        list.forEach((j) => enqueue(j));
        const live = new Set(list.map((j) => j.id));
        // keep very fresh SSE arrivals (server may still be recording the offer) and manual re-opens
        setQueue((q) => q.filter((j) => live.has(j.id) || j._manual || (Date.now() - (j._at || 0)) < 15000));
      } catch { /* network hiccup — try again next tick */ }
    };
    check();
    const iv = setInterval(check, 6000);
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      stopped = true; clearInterval(iv);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [enqueue]);

  // Re-grab a missed job from the dashboard (opens the ring again).
  useEffect(() => {
    const onOpen = (e) => { const job = e.detail; if (job && job.id) { handledRef.current.delete(job.id); enqueue({ ...job, _manual: true }, true); } };
    window.addEventListener("azo-open-ring", onOpen);
    return () => window.removeEventListener("azo-open-ring", onOpen);
  }, [enqueue]);

  /* ------------------------- actions ------------------------- */
  const finishTest = useCallback((job, verb) => {
    handledRef.current.add(job.id);
    stopRing();
    removeFromQueue(job.id);
    toast.success(`Test ring ${verb} — alerts are working on this device`, { description: "Real job requests will look exactly like this." });
    try { window.dispatchEvent(new CustomEvent("azo-test-ring-done", { detail: { id: job.id, verb } })); } catch { /* ignore */ }
  }, [stopRing, removeFromQueue]);

  const doAccept = useCallback(async (job) => {
    if (!job || busy) return;
    if (job.is_test) { finishTest(job, "accepted"); return; }
    setBusy(true);
    try {
      await api.post(`/bookings/${job.id}/accept`);
      handledRef.current.add(job.id);
      stopRing();
      removeFromQueue(job.id);
      toast.success("Job accepted", { description: job.service_name || "" });
      onChanged?.();
      onAccepted?.(job);
    } catch (e) {
      const msg = e?.response?.data?.detail || "Could not accept — it may have been taken.";
      toast.error(msg);
      handledRef.current.add(job.id);
      removeFromQueue(job.id);
    } finally { setBusy(false); }
  }, [busy, stopRing, removeFromQueue, onChanged, onAccepted, finishTest]);

  const doReject = useCallback(async (job) => {
    if (!job || busy) return;
    if (job.is_test) { finishTest(job, "dismissed"); return; }
    setBusy(true);
    try {
      await api.post(`/bookings/${job.id}/reject`, { reason: "" });
      toast("Request declined", { description: job.service_name || "" });
    } catch { /* ignore */ }
    handledRef.current.add(job.id);
    stopRing();
    removeFromQueue(job.id);
    onChanged?.();
    setBusy(false);
  }, [busy, stopRing, removeFromQueue, onChanged, finishTest]);

  /* ------------- deep-link from push notification ------------- */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const jobId = params.get("job");
    const action = params.get("ring");
    if (!jobId) return;
    // clean the URL so it doesn't re-trigger
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("job"); url.searchParams.delete("ring");
      window.history.replaceState({}, "", url.pathname + url.search);
    } catch { /* ignore */ }

    ensureCtx();
    if (jobId.startsWith("test-")) {
      const job = { id: jobId, code: "TEST-RING", is_test: true, service_name: "Test job ring", category_name: "Alert check",
        city: "", address_line: "This is a test alert. Tap Accept or Reject to dismiss.", schedule_type: "emergency", total: 0 };
      if (action === "accept" || action === "reject") finishTest(job, action === "accept" ? "accepted" : "dismissed");
      else enqueue(job, true);
      return;
    }
    api.get("/bookings/partner/jobs").then((r) => {
      const raw = (r.data || []).find((j) => j.id === jobId);
      if (!raw) { toast("This request is no longer available"); return; }
      // Normalise a raw booking doc into the compact "brief" shape the ring uses.
      const job = {
        id: raw.id, code: raw.code,
        service_name: raw.service_name, category_name: raw.category_name,
        service_image: (raw.items && raw.items[0] && raw.items[0].image) || raw.image || "",
        items: (() => {
          const rawItems = Array.isArray(raw.items) ? raw.items : [];
          const lines = [];
          rawItems.forEach((it) => {
            const itAddons = Array.isArray(it.addons) ? it.addons : [];
            const qty = it.qty || 1;
            const addonSum = itAddons.reduce((s, a) => s + Number(a.price || 0) * (a.qty || 1), 0);
            let baseUnit = it.base_price;
            if (baseUnit == null) baseUnit = Number(it.unit_service_value ?? it.price ?? it.total ?? 0) - addonSum;
            lines.push({ name: it.service_name || it.name || it.custom_name, qty, price: Math.round(Number(baseUnit || 0) * qty * 100) / 100, is_addon: false });
            // Add-on quantity is INDEPENDENT — priced at its own qty, not the main qty.
            itAddons.forEach((a) => { const aq = a.qty || 1; lines.push({ name: a.name || "Add-on", qty: aq, price: Math.round(Number(a.price || 0) * aq * 100) / 100, is_addon: true }); });
          });
          if (!lines.length && raw.service_name) {
            const base = raw.pricing ? Number(raw.pricing.base || 0) : 0;
            lines.push({ name: raw.service_name, qty: 1, price: base, is_addon: false });
          }
          return lines;
        })(),
        items_count: (() => {
          const rawItems = Array.isArray(raw.items) ? raw.items : [];
          return rawItems.length || 1;
        })(),
        city: (raw.address && raw.address.city) || "",
        address_line: (raw.address && raw.address.line) || "",
        schedule_type: raw.schedule_type || "",
        total: (raw.pricing && raw.pricing.total) != null ? raw.pricing.total : "",
        services_total: (raw.pricing
          ? (Number(raw.pricing.base || 0) + Number(raw.pricing.addons_total || 0))
          : ""),
        // Partner-facing amount: pre-tax commissionable base (incl. visiting charge,
        // coupon added back → platform-absorbed). Source of truth from the booking.
        partner_amount: (raw.pricing
          ? Math.round((Number(raw.pricing.commissionable_base || 0) + Number(raw.pricing.discount || 0)) * 100) / 100
          : ""),
        visiting_charge: raw.pricing ? Number(raw.pricing.visiting_charge || 0) : 0,
        coupon_code: raw.coupon_code || null,
        coupon_discount: raw.coupon_code && raw.pricing ? Number(raw.pricing.discount || 0) : 0,
      };
      if (action === "accept") doAccept(job);
      else if (action === "reject") doReject(job);
      else enqueue(job);
    }).catch(() => {});
  }, []);

  if (!current) return null;

  const area = current.address_line || current.city || "Customer location";
  // Prominent value = pre-tax amount the partner's commission is computed on. It
  // INCLUDES the visiting charge and ADDS BACK any coupon (platform-absorbed) so the
  // partner-facing amount is never reduced by a customer coupon. Falls back to the
  // service-only total for legacy offers that don't carry partner_amount.
  const total = current.partner_amount != null && current.partner_amount !== ""
    ? current.partner_amount
    : (current.services_total != null && current.services_total !== ""
      ? current.services_total
      : (current.total != null ? current.total : ""));
  const visitingCharge = Number(current.visiting_charge || 0);
  const couponCode = current.coupon_code || null;
  // For a SINGLE-service request, surface the ordered quantity when it is more than one
  // (multi-service requests already list each line with its qty in the breakdown below).
  const singleServiceQty = (() => {
    if (current.items_count > 1) return 0;
    const lines = Array.isArray(current.items) ? current.items.filter((x) => !x.is_addon) : [];
    const q = lines[0] && Number(lines[0].qty || 1);
    return q > 1 ? q : 0;
  })();

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gradient-to-br from-primary-500 via-primary-700 to-primary-900 text-white" data-testid="incoming-job-ring">
      {/* soft animated glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-white/10 blur-2xl animate-pulse" />
        <div className="absolute bottom-10 -right-20 h-72 w-72 rounded-full bg-emerald-400/10 blur-2xl animate-pulse" />
      </div>

      {/* Scrollable content — no matter how many services/add-ons, the action bar
          below stays fixed & visible. Content is centered when short, scrolls when tall. */}
      <div className="relative flex-1 min-h-0 overflow-y-auto">
        <div className="min-h-full flex flex-col items-center justify-center px-6 py-6 text-center">
        <p className="uppercase tracking-[0.3em] text-xs text-white/70 mb-2">{current.is_test ? "Test job ring" : "Incoming job request"}</p>
        {current.is_test && (
          <span data-testid="ring-test-badge" className="mb-3 inline-flex items-center gap-1 rounded-full bg-amber-400 text-amber-950 px-3 py-1 text-[11px] font-bold">TEST · not a real job</span>
        )}
        <div className="flex items-center gap-2 mb-3 flex-wrap justify-center">
          {current.schedule_type === "emergency" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/90 px-3 py-1 text-[11px] font-bold"><Zap className="h-3.5 w-3.5" /> Emergency</span>
          )}
          {silent && (
            <span data-testid="ring-dnd-badge" className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold"><BellOff className="h-3.5 w-3.5" /> Silent · Do Not Disturb</span>
          )}
          {queue.length > 1 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold">+{queue.length - 1} more waiting</span>
          )}
        </div>

        {/* Scheduled work — prominent date/time so the partner knows exactly when (spec 1) */}
        {current.is_scheduled && current.scheduled_date && (
          <div data-testid="ring-scheduled" className="mb-3 w-full max-w-sm rounded-2xl bg-white/15 backdrop-blur border border-white/25 px-4 py-3">
            <p className="text-[10.5px] uppercase tracking-[0.2em] text-white/70 font-bold mb-1">Scheduled Work</p>
            <div className="flex items-center justify-center gap-4 text-lg font-black">
              <span className="inline-flex items-center gap-1.5">📅 {current.scheduled_date}</span>
              <span className="inline-flex items-center gap-1.5">⏰ {current.scheduled_time}</span>
            </div>
            <p className="text-[11.5px] text-white/70 mt-1">Scheduled for {current.scheduled_date} at {current.scheduled_time}</p>
          </div>
        )}

        {/* service image with pulsing rings — steady, non-expiring waiting ring */}
        <div className="relative my-4 h-40 w-40 flex items-center justify-center">
          <span className="absolute h-32 w-32 rounded-full bg-white/10 animate-ping" />
          <svg className="absolute inset-0 animate-spin" style={{ animationDuration: "3s" }} width="160" height="160" viewBox="0 0 160 160" data-testid="ring-countdown">
            <circle cx="80" cy="80" r="74" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="5" />
            <circle cx="80" cy="80" r="74" fill="none" stroke="#ffffff" strokeWidth="5" strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 74 * 0.28} ${2 * Math.PI * 74}`} transform="rotate(-90 80 80)" />
          </svg>
          {current.service_image ? (
            <img src={current.service_image} alt={current.service_name} className="relative h-28 w-28 rounded-full object-cover ring-4 ring-white/30 shadow-2xl" />
          ) : (
            <div className="relative h-28 w-28 rounded-full bg-white/15 ring-4 ring-white/30 flex items-center justify-center shadow-2xl">
              <Briefcase className="h-11 w-11" />
            </div>
          )}
          <span className="absolute -bottom-1 rounded-full bg-slate-900/70 px-2.5 py-0.5 text-xs font-bold tabular-nums" data-testid="ring-seconds">
            {`${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`}
          </span>
        </div>

        <h2 className="font-heading font-black text-4xl leading-tight" data-testid="ring-title">
          {current.items_count > 1 ? `${current.items_count} services` : (current.service_name || "New Service Request")}
        </h2>
        {current.category_name && <p className="text-white/80 mt-1 text-lg font-semibold">{current.category_name}</p>}
        {singleServiceQty > 0 && (
          <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/20 px-3 py-1 text-sm font-bold" data-testid="ring-qty">
            Quantity: {singleServiceQty}
          </span>
        )}

        {/* Prominent booking amount — GST/Tax EXCLUDED, INCLUDES visiting charge */}
        {total !== "" && (
          <div className="mt-4 inline-flex flex-col items-center rounded-2xl bg-white/15 backdrop-blur px-6 py-3 shadow-xl" data-testid="ring-amount">
            <div className="inline-flex items-baseline gap-1">
              <span className="text-2xl font-bold text-emerald-300">₹</span>
              <span className="text-5xl font-heading font-black tabular-nums">{Number(total).toLocaleString("en-IN")}</span>
            </div>
            <span className="text-white/70 text-[11px] mt-0.5 uppercase tracking-wide">
              {visitingCharge > 0 ? "Total incl. visiting charge · excl. taxes" : "Service amount · excl. taxes"}
            </span>
            {visitingCharge > 0 && (
              <span className="text-emerald-200/90 text-[11px] mt-0.5" data-testid="ring-visiting">
                includes ₹{Number(visitingCharge).toLocaleString("en-IN")} visiting charge
              </span>
            )}
          </div>
        )}

        <div className="mt-6 w-full max-w-sm space-y-2.5 text-left">
          {/* Multi-service / add-on breakdown — every service & add-on listed with pre-tax price */}
          {Array.isArray(current.items) && current.items.length > 1 && (
            <div className="rounded-2xl bg-white/10 backdrop-blur px-4 py-3 space-y-1.5" data-testid="ring-services">
              <p className="text-[11px] uppercase tracking-wider text-white/60 font-bold mb-1">Services &amp; add-ons (excl. tax)</p>
              {current.items.map((it, i) => (
                <div key={i} className={`flex items-center justify-between gap-3 text-sm ${it.is_addon ? "pl-3 text-white/80" : "font-medium"}`}>
                  <span className="truncate">{it.is_addon ? "+ " : ""}{it.name}{it.qty > 1 ? ` ×${it.qty}` : ""}</span>
                  {it.price ? <span className={`tabular-nums shrink-0 ${it.is_addon ? "" : "font-bold"}`}>₹{Number(it.price).toLocaleString("en-IN")}</span> : null}
                </div>
              ))}
              {visitingCharge > 0 && (
                <div className="flex items-center justify-between gap-3 text-sm text-white/80 border-t border-white/15 pt-1.5 mt-1">
                  <span className="truncate">Visiting charge</span>
                  <span className="tabular-nums shrink-0">₹{Number(visitingCharge).toLocaleString("en-IN")}</span>
                </div>
              )}
            </div>
          )}
          {couponCode && (
            <div className="rounded-2xl bg-emerald-400/15 border border-emerald-300/30 backdrop-blur px-4 py-3" data-testid="ring-coupon">
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-emerald-200">Coupon {couponCode}</span>
                {Number(current.coupon_discount || 0) > 0 && (
                  <span className="tabular-nums text-emerald-200">₹{Number(current.coupon_discount).toLocaleString("en-IN")} off</span>
                )}
              </div>
              <p className="text-[11px] text-emerald-100/80 mt-1">Funded by AzoApp — your earning is not affected.</p>
            </div>
          )}
          <div className="flex items-center gap-3 rounded-2xl bg-white/10 backdrop-blur px-4 py-3">
            <MapPin className="h-5 w-5 text-white/80 shrink-0" />
            <span className="text-sm font-medium truncate">{area}</span>
          </div>
          {distanceKm != null && (
            <div className="flex items-center gap-3 rounded-2xl bg-white/10 backdrop-blur px-4 py-3" data-testid="ring-distance">
              <Navigation className="h-5 w-5 text-sky-300 shrink-0" />
              <span className="text-sm font-semibold">{distanceKm < 1 ? `${Math.round(distanceKm * 1000)} m` : `${distanceKm.toFixed(1)} km`} away · ~{etaMin} min travel</span>
            </div>
          )}
          <div className="flex items-center gap-3 rounded-2xl bg-white/10 backdrop-blur px-4 py-3">
            <Clock className="h-5 w-5 text-amber-300 shrink-0" />
            <span className="text-sm font-medium">{current.code ? `#${current.code}` : "Respond quickly to grab this job"}</span>
          </div>
        </div>
        </div>
      </div>

      {/* action bar — sticky at the bottom, always visible & tappable */}
      <div className="relative shrink-0 border-t border-white/10 bg-black/10 backdrop-blur px-6 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-4">
        <div className="mx-auto max-w-sm flex items-center justify-between gap-6">
          <button data-testid="ring-reject" onClick={() => doReject(current)} disabled={busy}
            className="flex flex-col items-center gap-2 disabled:opacity-60">
            <span className="h-16 w-16 rounded-full bg-red-500 hover:bg-red-600 active:scale-95 transition flex items-center justify-center shadow-xl shadow-red-900/40">
              <PhoneOff className="h-7 w-7" />
            </span>
            <span className="text-sm font-semibold">Reject</span>
          </button>

          <button data-testid="ring-accept" onClick={() => doAccept(current)} disabled={busy}
            className="flex flex-col items-center gap-2 disabled:opacity-60">
            <span className="h-20 w-20 rounded-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 transition flex items-center justify-center shadow-xl shadow-emerald-900/50 ring-4 ring-emerald-300/40 animate-bounce">
              {busy ? <span className="h-6 w-6 border-2 border-white/70 border-t-transparent rounded-full animate-spin" /> : <Phone className="h-8 w-8" />}
            </span>
            <span className="text-sm font-semibold">Accept</span>
          </button>
        </div>
        <p className="text-center text-white/50 text-xs mt-4">{silent ? "Silent alert (Do Not Disturb)" : "Ringing…"} · waiting for your response</p>
      </div>
    </div>
  );
}
