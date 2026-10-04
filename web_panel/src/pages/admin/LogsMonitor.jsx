import React, { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Server, Cpu, MemoryStick, HardDrive, Play, Pause, Trash2, ArrowDownToLine, Search, X, RefreshCw, AlertTriangle, Radio, Download } from "lucide-react";
import api, { API } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const LEVEL_STYLE = {
  DEBUG: { dot: "#94a3b8", text: "text-slate-500", bg: "bg-slate-100 dark:bg-slate-800" },
  INFO: { dot: "#22c55e", text: "text-emerald-600", bg: "bg-emerald-50 dark:bg-emerald-950/40" },
  WARNING: { dot: "#f59e0b", text: "text-amber-600", bg: "bg-amber-50 dark:bg-amber-950/40" },
  ERROR: { dot: "#ef4444", text: "text-red-600", bg: "bg-red-50 dark:bg-red-950/40" },
  CRITICAL: { dot: "#b91c1c", text: "text-red-700", bg: "bg-red-100 dark:bg-red-950/60" },
};
const APPS = [["all", "All"], ["customer", "Customer"], ["partner", "Partner"], ["backend", "Backend"]];
const LEVELS = [["all", "All"], ["INFO", "Info"], ["WARNING", "Warning"], ["ERROR", "Error"], ["CRITICAL", "Critical"]];
const RANGES = [["live", "● Live"], ["5m", "5 min"], ["15m", "15 min"], ["1h", "1 hour"], ["24h", "24 hours"]];
const STATUSES = [["all", "All"], ["success", "Success"], ["error", "Error"], ["slow", "Slow"]];
const MAX_ROWS = 400;

function Chip({ active, onClick, children, testId }) {
  return (
    <button data-testid={testId} onClick={onClick}
      className={`px-3 py-1.5 rounded-md text-[12.5px] font-semibold whitespace-nowrap ${active ? "bg-primary-700 text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"}`}>
      {children}
    </button>
  );
}

function timeStr(ts) { try { return new Date(ts).toLocaleTimeString("en-GB"); } catch { return ts; } }

function Bar({ icon: Ic, label, pct }) {
  const p = Number(pct || 0);
  const color = p > 85 ? "#ef4444" : p > 65 ? "#f59e0b" : "#22c55e";
  return (
    <div className="flex-1 min-w-[110px]">
      <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mb-1"><Ic className="h-3.5 w-3.5" />{label} <span className="ml-auto font-bold" style={{ color }}>{p}%</span></div>
      <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${p}%`, background: color }} /></div>
    </div>
  );
}

export default function LogsMonitor() {
  const [app, setApp] = useState("all");
  const [level, setLevel] = useState("all");
  const [status, setStatus] = useState("all");
  const [rng, setRng] = useState("live");
  const [q, setQ] = useState("");
  const [logs, setLogs] = useState([]);
  const [live, setLive] = useState(true);
  const [autoScroll, setAutoScroll] = useState(true);
  const [summary, setSummary] = useState(null);
  const [health, setHealth] = useState(null);
  const [selected, setSelected] = useState(null);
  const esRef = useRef(null);
  const scrollRef = useRef(null);
  const filterRef = useRef({ app, level, q, status });
  filterRef.current = { app, level, q, status };

  const matches = useCallback((l) => {
    const f = filterRef.current;
    if (f.app !== "all" && l.app !== f.app) return false;
    if (f.level !== "all" && l.level !== f.level) return false;
    if (f.status === "error" && !["ERROR", "CRITICAL"].includes(l.level)) return false;
    if (f.status === "success" && !(l.status < 400)) return false;
    if (f.status === "slow" && !(l.duration_ms >= 2000)) return false;
    if (f.q) { const s = `${l.message} ${l.endpoint} ${l.file} ${l.request_id} ${l.service}`.toLowerCase(); if (!s.includes(f.q.toLowerCase())) return false; }
    return true;
  }, []);

  // static fetch when a time range (not live) is picked
  const fetchStatic = useCallback(async () => {
    const { data } = await api.get("/admin/logs", { params: { app, level, status, q, rng, limit: MAX_ROWS } });
    setLogs(data.logs || []);
  }, [app, level, status, q, rng]);

  const loadMeta = useCallback(async () => {
    try { const [s, h] = await Promise.all([api.get("/admin/logs/summary", { params: { rng: "24h" } }), api.get("/admin/logs/health")]); setSummary(s.data); setHealth(h.data); } catch { /* noop */ }
  }, []);
  useEffect(() => { loadMeta(); const t = setInterval(loadMeta, 10000); return () => clearInterval(t); }, [loadMeta]);

  // SSE live stream
  useEffect(() => {
    if (rng !== "live" || !live) { if (esRef.current) { esRef.current.close(); esRef.current = null; } if (rng !== "live") fetchStatic(); return; }
    const token = localStorage.getItem("azo_token");
    const url = `${API}/admin/logs/stream?token=${encodeURIComponent(token)}&app=${app}&level=${level}`;
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (!d || !d.level) return;
        if (!matches(d)) return;
        setLogs((prev) => [d, ...prev].slice(0, MAX_ROWS));
      } catch { /* keepalive */ }
    };
    es.onerror = () => { /* browser auto-reconnects */ };
    return () => { es.close(); esRef.current = null; };
  }, [rng, live, app, level, fetchStatic, matches]);

  // refetch static list when filters change in non-live mode
  useEffect(() => { if (rng !== "live") fetchStatic(); }, [rng, app, level, status, q, fetchStatic]);

  useEffect(() => { if (autoScroll && scrollRef.current) scrollRef.current.scrollTop = 0; }, [logs, autoScroll]);

  const doExport = async (fmt) => {
    try {
      const res = await api.get("/admin/logs/export", { params: { fmt, app, level, status, q, rng: rng === "live" ? "1h" : rng }, responseType: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(res.data);
      a.download = `logs.${fmt}`; a.click();
      toast.success(`Exported ${fmt.toUpperCase()}`);
    } catch { toast.error("Export failed"); }
  };
  const clearStored = async () => {
    if (!window.confirm("Delete ALL stored logs from the server? This cannot be undone.")) return;
    try { const { data } = await api.delete("/admin/logs"); toast.success(`Deleted ${data.deleted} logs`); setLogs([]); loadMeta(); } catch { toast.error("Delete failed"); }
  };

  const sv = summary?.levels || {};
  return (
    <div className="space-y-4" data-testid="logs-monitor">
      {/* header */}
      <div className="flex items-center gap-2 flex-wrap">
        <Activity className="h-6 w-6 text-primary-600" />
        <div className="mr-auto">
          <h2 className="font-heading font-bold text-lg text-slate-900 dark:text-white">Live Logs & Monitoring</h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">Real-time application, API, mobile & server monitoring.</p>
        </div>
        {rng === "live" ? (
          <span className="flex items-center gap-1.5 text-[12px] font-bold text-red-500" data-testid="live-indicator"><Radio className="h-4 w-4 animate-pulse" /> LIVE</span>
        ) : null}
      </div>

      {/* summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5">
        {[["Total", summary?.total ?? "—", "text-slate-900 dark:text-white"], ["Info", sv.INFO ?? 0, "text-emerald-600"], ["Warning", sv.WARNING ?? 0, "text-amber-600"], ["Error", sv.ERROR ?? 0, "text-red-600"], ["Critical", sv.CRITICAL ?? 0, "text-red-700"]].map(([l, v, c]) => (
          <div key={l} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3" data-testid={`summary-${l.toLowerCase()}`}>
            <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">{l}</p>
            <p className={`text-xl font-black ${c}`}>{v}</p>
          </div>
        ))}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold">App Errors</p>
          <p className="text-[12px] text-slate-600 dark:text-slate-300 font-semibold mt-0.5">C: {summary?.errors_by_app?.customer || 0} · P: {summary?.errors_by_app?.partner || 0}</p>
        </div>
      </div>

      {/* server health + processes */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4" data-testid="server-health">
        <div className="flex items-center gap-2 mb-3"><Server className="h-4.5 w-4.5 text-primary-600" /><h3 className="font-bold text-sm text-slate-900 dark:text-white">Server Health</h3>
          <div className="ml-auto flex gap-2 text-[11px]">
            {health?.services && Object.entries(health.services).map(([k, v]) => (
              <span key={k} className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: v ? "#22c55e" : "#ef4444" }} />{k}</span>
            ))}
          </div>
        </div>
        <div className="flex gap-4 flex-wrap mb-3">
          <Bar icon={Cpu} label="CPU" pct={health?.cpu} /><Bar icon={MemoryStick} label="RAM" pct={health?.ram} /><Bar icon={HardDrive} label="Disk" pct={health?.disk} />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead><tr className="text-slate-400 text-left"><th className="py-1 pr-4 font-semibold">Process</th><th className="pr-4 font-semibold">Status</th><th className="pr-4 font-semibold">PID</th><th className="pr-4 font-semibold">Uptime</th><th className="pr-4 font-semibold">Memory</th></tr></thead>
            <tbody>
              {(health?.processes || []).map((p) => (
                <tr key={p.name} className="border-t border-slate-100 dark:border-slate-800" data-testid={`proc-${p.name}`}>
                  <td className="py-1.5 pr-4 font-semibold text-slate-800 dark:text-slate-200">{p.name}</td>
                  <td className="pr-4"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: p.status === "RUNNING" ? "#22c55e" : "#94a3b8" }} />{p.status}</span></td>
                  <td className="pr-4 text-slate-500">{p.pid || "—"}</td>
                  <td className="pr-4 text-slate-500">{p.uptime || "—"}</td>
                  <td className="pr-4 text-slate-500">{p.memory ? `${p.memory} MB` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* filters */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3 space-y-2.5" data-testid="log-filters">
        <div className="flex gap-1.5 flex-wrap">{APPS.map(([k, l]) => <Chip key={k} testId={`filter-app-${k}`} active={app === k} onClick={() => setApp(k)}>{l}</Chip>)}</div>
        <div className="flex gap-1.5 flex-wrap items-center">
          {LEVELS.map(([k, l]) => <Chip key={k} testId={`filter-level-${k}`} active={level === k} onClick={() => setLevel(k)}>{l}</Chip>)}
          <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />
          {STATUSES.map(([k, l]) => <Chip key={k} testId={`filter-status-${k}`} active={status === k} onClick={() => setStatus(k)}>{l}</Chip>)}
        </div>
        <div className="flex gap-1.5 flex-wrap items-center">
          {RANGES.map(([k, l]) => <Chip key={k} testId={`filter-range-${k}`} active={rng === k} onClick={() => setRng(k)}>{l}</Chip>)}
          <div className="relative ml-auto flex-1 min-w-[180px]">
            <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input data-testid="log-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search message, endpoint, file, request-id…" className="pl-8 h-9" />
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap items-center pt-1 border-t border-slate-100 dark:border-slate-800">
          {rng === "live" ? (
            <Button data-testid="toggle-live" size="sm" variant="outline" onClick={() => setLive((v) => !v)} className="h-8">
              {live ? <><Pause className="h-3.5 w-3.5 mr-1" /> Pause</> : <><Play className="h-3.5 w-3.5 mr-1" /> Resume</>}
            </Button>
          ) : (
            <Button data-testid="refresh-static" size="sm" variant="outline" onClick={fetchStatic} className="h-8"><RefreshCw className="h-3.5 w-3.5 mr-1" /> Refresh</Button>
          )}
          <Button data-testid="toggle-autoscroll" size="sm" variant="outline" onClick={() => setAutoScroll((v) => !v)} className="h-8"><ArrowDownToLine className="h-3.5 w-3.5 mr-1" /> Auto-scroll {autoScroll ? "ON" : "OFF"}</Button>
          <Button data-testid="clear-screen" size="sm" variant="outline" onClick={() => setLogs([])} className="h-8">Clear Screen</Button>
          <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" />
          {["txt", "csv", "json"].map((ft) => <Button key={ft} data-testid={`export-${ft}`} size="sm" variant="outline" onClick={() => doExport(ft)} className="h-8"><Download className="h-3.5 w-3.5 mr-1" />{ft.toUpperCase()}</Button>)}
          <Button data-testid="delete-stored" size="sm" variant="destructive" onClick={clearStored} className="h-8 ml-auto"><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Stored</Button>
        </div>
      </div>

      {/* live stream */}
      <div ref={scrollRef} className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-950 p-2 h-[420px] overflow-y-auto font-mono text-[12px]" data-testid="log-stream">
        {logs.length === 0 ? <p className="text-slate-500 p-6 text-center">No logs yet. Live activity will appear here…</p> :
          logs.map((l) => {
            const st = LEVEL_STYLE[l.level] || LEVEL_STYLE.INFO;
            return (
              <button key={l.id + l.ts} data-testid={`log-row-${l.level}`} onClick={() => setSelected(l)}
                className={`w-full text-left flex items-start gap-2 px-2.5 py-1.5 rounded hover:bg-white/5 border-l-2`} style={{ borderColor: st.dot }}>
                <span className="text-slate-500 shrink-0">{timeStr(l.ts)}</span>
                <span className="shrink-0 font-bold" style={{ color: st.dot }}>{l.level}</span>
                <span className="text-slate-400 shrink-0">{l.app}</span>
                <span className="text-slate-300 truncate">{l.method} {l.endpoint} {l.status ? `→ ${l.status}` : ""} {l.message && !l.endpoint ? l.message : ""}{l.duration_ms ? ` · ${l.duration_ms}ms` : ""}</span>
              </button>
            );
          })}
      </div>

      {/* detail drawer */}
      {selected ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/50" onClick={() => setSelected(null)} data-testid="log-detail">
          <div className="w-full max-w-md h-full bg-white dark:bg-slate-900 p-5 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: (LEVEL_STYLE[selected.level] || {}).dot }} /> {selected.level} Details</h3>
              <button onClick={() => setSelected(null)} data-testid="close-detail"><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            {[["Application", selected.app], ["Service", selected.service], ["Environment", selected.environment], ["Time", new Date(selected.ts).toLocaleString()], ["Endpoint", selected.endpoint], ["Method", selected.method], ["HTTP Status", selected.status], ["Duration", selected.duration_ms ? `${selected.duration_ms}ms` : ""], ["Request ID", selected.request_id], ["User ID", selected.user_id], ["File", selected.file], ["Line", selected.line], ["Process", selected.process]].filter(([, v]) => v !== "" && v != null).map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-slate-800 text-[13px]">
                <span className="text-slate-500">{k}</span><span className="font-semibold text-slate-900 dark:text-white text-right break-all">{String(v)}</span>
              </div>
            ))}
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">Message</p>
              <p className="text-[13px] text-slate-800 dark:text-slate-200 break-words">{selected.message}</p>
            </div>
            {selected.stack ? (
              <div className="mt-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Stack Trace</p>
                <pre className="text-[11px] bg-slate-950 text-slate-300 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">{selected.stack}</pre>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
