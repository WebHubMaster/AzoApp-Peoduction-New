import React, { useCallback, useEffect, useState } from "react";
import { BellRing, Eye, CheckCircle2, XCircle, Clock, Hourglass, Radio, MapPin, UserCheck, Flag, ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import { useRealtime } from "@/context/RealtimeContext";

const SRC = {
  auto_broadcast: "Wave 1", partner_online: "Came online", admin_redispatch: "Admin re-dispatch", admin_ring: "Admin rang again",
  admin_ring: "Admin rang again",
  auto_nearby_wave: "Nearby wave", auto_escalation_timeout: "Next wave (timeout)",
  auto_escalation_reject: "Next wave (reject)", auto_escalation_no_local: "Nearby (no local)",
  auto_escalation_pool_refresh: "Pool refresh",
};
const RESP = {
  accepted: { t: "Accepted", c: "text-emerald-700 bg-emerald-100", dot: "bg-emerald-500", I: CheckCircle2 },
  rejected: { t: "Rejected", c: "text-red-700 bg-red-100", dot: "bg-red-500", I: XCircle },
  timeout: { t: "No answer", c: "text-amber-700 bg-amber-100", dot: "bg-amber-500", I: Clock },
  pending: { t: "Ringing…", c: "text-primary-700 bg-primary-50", dot: "bg-primary-500 animate-pulse", I: Hourglass },
};
const fmtT = (iso) => (iso ? new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) : "");
const secs = (a, b) => (a && b ? `${Math.max(0, (new Date(b) - new Date(a)) / 1000).toFixed(0)}s` : "");

const Step = ({ done, active, label, time, Icon, tone = "emerald", testid }) => (
  <div className="flex flex-col items-center min-w-[72px]" data-testid={testid}>
    <div className={`h-8 w-8 rounded-full grid place-items-center border-2 transition-colors ${done ? `bg-${tone}-500 border-${tone}-500 text-white` : active ? "border-primary-400 text-primary-500 bg-white dark:bg-slate-900 animate-pulse" : "border-slate-200 dark:border-slate-700 text-slate-300 bg-white dark:bg-slate-900"}`}>
      <Icon className="h-4 w-4" />
    </div>
    <span className={`mt-1 text-[10px] font-semibold ${done ? "text-slate-700 dark:text-slate-200" : "text-slate-400"}`}>{label}</span>
    <span className="text-[10px] text-slate-400 tabular-nums h-3">{time}</span>
  </div>
);

const Bar = ({ done }) => <div className={`flex-1 h-0.5 mt-4 mx-1 rounded ${done ? "bg-emerald-400" : "bg-slate-200 dark:bg-slate-700"}`} />;

function Lane({ l }) {
  const r = RESP[l.response] || RESP.pending;
  const answered = l.response !== "pending";
  const tone = l.response === "accepted" ? "emerald" : l.response === "rejected" ? "red" : "amber";
  return (
    <div data-testid={`dtl-lane-${l.partner_id}`} className={`rounded-xl border p-3 ${l.response === "accepted" ? "border-emerald-200 bg-emerald-50/40 dark:bg-emerald-900/10" : "border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/40"}`}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="min-w-0">
          <p className="font-semibold text-slate-800 dark:text-slate-100 text-sm truncate flex items-center gap-1.5">
            {l.partner_name || "Partner"}
            {l.nearby && <span className="text-[10px] font-bold text-violet-700 bg-violet-100 rounded-full px-1.5">nearby</span>}
          </p>
          <p className="text-[11px] text-slate-500">
            {SRC[l.source] || l.source}
            {l.eta_min != null ? ` · ~${l.eta_min} min` : ""}{l.distance_km != null ? ` · ${l.distance_km} km` : ""}
            {" · push: "}<span className={l.push === "sent" ? "text-emerald-600" : "text-slate-400"}>{l.push === "sse_only" ? "in-app only" : l.push}</span>
          </p>
        </div>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${r.c}`}>{r.t}{l.response_ms != null ? ` · ${(l.response_ms / 1000).toFixed(1)}s` : ""}</span>
      </div>
      <div className="flex items-start mt-2">
        <Step done label="Rung" time={fmtT(l.rung_at)} Icon={BellRing} testid={`dtl-step-rung-${l.partner_id}`} />
        <Bar done={!!l.seen_at || answered} />
        <Step done={!!l.seen_at} active={!l.seen_at && !answered} label="Seen" time={l.seen_at ? `${fmtT(l.seen_at)} (+${secs(l.rung_at, l.seen_at)})` : (answered ? "not seen" : "waiting")} Icon={Eye} testid={`dtl-step-seen-${l.partner_id}`} />
        <Bar done={answered} />
        <Step done={answered} active={!answered && !!l.seen_at} label={answered ? r.t : "Decision"} time={fmtT(l.response_at)} Icon={r.I} tone={tone} testid={`dtl-step-resp-${l.partner_id}`} />
      </div>
    </div>
  );
}

const EV = {
  rung: { I: BellRing, c: "bg-primary-500", t: (e) => `Rung ${e.partner_name || "partner"} · ${SRC[e.source] || e.source || ""}` },
  seen: { I: Eye, c: "bg-sky-500", t: (e) => `${e.partner_name || "Partner"} saw the request` },
  accepted: { I: CheckCircle2, c: "bg-emerald-500", t: (e) => `${e.partner_name || "Partner"} ACCEPTED${e.response_ms != null ? ` in ${(e.response_ms / 1000).toFixed(1)}s` : ""}` },
  rejected: { I: XCircle, c: "bg-red-500", t: (e) => `${e.partner_name || "Partner"} rejected` },
  timeout: { I: Clock, c: "bg-amber-500", t: (e) => `${e.partner_name || "Partner"} did not answer (wave timed out)` },
  manual_assign: { I: UserCheck, c: "bg-violet-500", t: (e) => `Admin manually assigned ${e.partner_name || "partner"}` },
  status: { I: Flag, c: "bg-slate-400", t: (e) => `Booking → ${String(e.status || "").replace(/_/g, " ")}${e.partner_name ? ` (${e.partner_name})` : ""}` },
};

export default function DispatchTimeline({ bookingId }) {
  const { subscribe } = useRealtime();
  const [data, setData] = useState(null);
  const [view, setView] = useState("map");
  const [page, setPage] = useState(1);
  const [railPage, setRailPage] = useState(1);
  const PAGE = 5;
  const load = useCallback(() => {
    api.get(`/admin/bookings/${bookingId}/dispatch-timeline`).then((r) => setData(r.data)).catch(() => setData({ lanes: [], events: [], waiting: [], summary: {} }));
  }, [bookingId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const isMine = (r) => r && r.booking_id === bookingId;
    const offs = ["dispatch_new", "dispatch_seen", "dispatch_response", "job_update"].map((t) => subscribe(t, (r) => { if (isMine(r) || (r && r.id === bookingId)) load(); }));
    return () => offs.forEach((f) => f && f());
  }, [subscribe, bookingId, load]);

  if (!data) return <p className="text-sm text-slate-400">Loading dispatch map…</p>;
  const s = data.summary || {};
  // latest ring first; paginate so long dispatch histories don't stretch the page
  const lanes = [...(data.lanes || [])].reverse();
  const lanePages = Math.max(1, Math.ceil(lanes.length / PAGE));
  const curPage = Math.min(page, lanePages);
  const pagedLanes = lanes.slice((curPage - 1) * PAGE, curPage * PAGE);
  const events = [...(data.events || [])].reverse();
  const railPages = Math.max(1, Math.ceil(events.length / 8));
  const curRail = Math.min(railPage, railPages);
  const pagedEvents = events.slice((curRail - 1) * 8, curRail * 8);
  const Pager = ({ cur, total, onChange, count, label, testid }) => total <= 1 ? null : (
    <div className="flex items-center justify-between pt-2 text-[11px] text-slate-500" data-testid={testid}>
      <span>{label} {count} · page {cur}/{total}</span>
      <div className="inline-flex items-center gap-1">
        <button type="button" data-testid={`${testid}-prev`} disabled={cur <= 1} onClick={() => onChange(cur - 1)} className="h-7 w-7 rounded-lg border border-slate-200 dark:border-slate-700 grid place-items-center disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
        <button type="button" data-testid={`${testid}-next`} disabled={cur >= total} onClick={() => onChange(cur + 1)} className="h-7 w-7 rounded-lg border border-slate-200 dark:border-slate-700 grid place-items-center disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
  return (
    <div data-testid="dispatch-timeline">
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300" data-testid="dtl-sum-rung">Rung {s.rung || 0}/{s.eligible || 0}</span>
          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-sky-700" data-testid="dtl-sum-seen">Seen {s.seen || 0}</span>
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700" data-testid="dtl-sum-accepted">Accepted {s.accepted || 0}</span>
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-red-700">Rejected {s.rejected || 0}</span>
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">No answer {s.timeout || 0}</span>
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-slate-600 dark:text-slate-300">Waves {s.waves || 0}{s.nearby_expanded ? " · nearby" : ""}</span>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5 text-[11px]">
          {[["map", "Partner map"], ["rail", "Chronology"]].map(([k, l]) => (
            <button key={k} type="button" data-testid={`dtl-view-${k}`} onClick={() => setView(k)} className={`px-2.5 py-1 rounded-md font-semibold ${view === k ? "bg-primary-700 text-white" : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"}`}>{l}</button>
          ))}
        </div>
      </div>

      {view === "map" && (
        <div className="space-y-2.5">
          {lanes.length === 0 && (
            <p className="text-sm text-slate-400 flex items-center gap-1.5"><Radio className="h-4 w-4" /> Nobody has been rung yet{s.exhausted ? " — no free partner in the area (waiting for supply)." : "."}</p>
          )}
          {pagedLanes.map((l) => <Lane key={l.dispatch_id} l={l} />)}
          <Pager cur={curPage} total={lanePages} onChange={setPage} count={lanes.length} label="Rings" testid="dtl-pager" />
          {(data.waiting || []).length > 0 && (
            <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-3" data-testid="dtl-waiting">
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1"><MapPin className="h-3 w-3" /> Eligible, not rung yet (busy / offline / next wave)</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {data.waiting.map((w) => (
                  <span key={w.partner_id} className="text-[11px] rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-slate-600 dark:text-slate-300">
                    {w.partner_name || w.partner_id.slice(0, 6)}{w.eta_min != null ? ` · ~${w.eta_min}m` : ""}{w.nearby ? " · nearby" : ""}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {view === "rail" && (
        <ol className="relative border-l-2 border-slate-200 dark:border-slate-700 ml-3 space-y-3" data-testid="dtl-rail">
          {events.length === 0 && <li className="ml-4 text-sm text-slate-400">No events yet.</li>}
          {pagedEvents.map((e, i) => {
            const m = EV[e.type] || EV.status;
            return (
              <li key={i} className="ml-4 relative">
                <span className={`absolute -left-[23px] top-0.5 h-4 w-4 rounded-full ${m.c} ring-4 ring-white dark:ring-slate-900 grid place-items-center text-white`}><m.I className="h-2.5 w-2.5" /></span>
                <p className="text-sm text-slate-700 dark:text-slate-200">{m.t(e)}</p>
                <p className="text-[11px] text-slate-400 tabular-nums">{fmtT(e.at)}</p>
              </li>
            );
          })}
        </ol>
      )}
      {view === "rail" && <Pager cur={curRail} total={railPages} onChange={setRailPage} count={events.length} label="Events" testid="dtl-rail-pager" />}
    </div>
  );
}
