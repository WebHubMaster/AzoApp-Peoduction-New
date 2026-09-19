import React, { useEffect, useState, useCallback, useRef, useMemo } from "react";
import api from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import PremiumSelect from "@/components/ui/PremiumSelect";
import { toast } from "sonner";
import {
  Database, Zap, RefreshCcw, Trash2, Gauge, Activity, Plug, TimerReset,
  CheckCircle2, AlertTriangle, ServerCog, ListTree,
} from "lucide-react";

// ---- helpers ---------------------------------------------------------------
const ms = (v) => (v == null ? "—" : `${Number(v).toFixed(v < 10 ? 1 : 0)} ms`);

function latencyClass(v) {
  if (v == null) return "text-slate-400";
  if (v < 300) return "text-emerald-600";
  if (v < 700) return "text-amber-600";
  return "text-rose-600";
}
function latencyDot(v) {
  if (v == null) return "bg-slate-300";
  if (v < 300) return "bg-emerald-500";
  if (v < 700) return "bg-amber-500";
  return "bg-rose-500";
}

const METHOD_COLORS = {
  GET: "bg-sky-100 text-sky-700",
  POST: "bg-emerald-100 text-emerald-700",
  PUT: "bg-amber-100 text-amber-700",
  PATCH: "bg-violet-100 text-violet-700",
  DELETE: "bg-rose-100 text-rose-700",
};

const TONES = {
  slate: "bg-slate-100 text-slate-600",
  amber: "bg-amber-100 text-amber-600",
  sky: "bg-sky-100 text-sky-600",
  rose: "bg-rose-100 text-rose-600",
  violet: "bg-violet-100 text-violet-600",
};

function StatCard({ icon: Icon, label, value, tone = "slate" }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`h-10 w-10 rounded-xl grid place-items-center shrink-0 ${TONES[tone] || TONES.slate}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-slate-400 font-medium">{label}</div>
          <div className="text-xl font-bold text-slate-800 truncate">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Cache / Redis config card --------------------------------------------
function CacheRedisCard({ cfg, onSaved }) {
  const [provider, setProvider] = useState("upstash");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (!cfg) return;
    setProvider(cfg.provider || "upstash");
    setUrl(cfg.url || "");
    setToken(""); // never prefill secret
    setEnabled(!!cfg.enabled);
  }, [cfg]);

  const providers = cfg?.providers || [];
  const meta = useMemo(
    () => providers.find((p) => p.value === provider) || { conn: cfg?.connection_type || "—", mode: "rest" },
    [providers, provider, cfg]
  );
  const isUpstash = meta.mode === "rest";

  const test = useCallback(async () => {
    setTesting(true);
    try {
      const { data } = await api.post("/superadmin/redis/test", { provider, url, token });
      if (data.ok) toast.success(`Connected · ${data.backend} · ${ms(data.latency_ms)}`);
      else toast.error(`Connection failed: ${data.error || "unreachable"}`);
    } catch (e) {
      toast.error("Test failed");
    } finally {
      setTesting(false);
    }
  }, [provider, url, token]);

  const save = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/superadmin/redis", { provider, url, token, enabled });
      toast.success(enabled ? "Saved & enabled" : "Saved (Redis disabled)");
      setToken("");
      onSaved?.(data.config);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Save failed");
    } finally {
      setBusy(false);
    }
  }, [provider, url, token, enabled, onSaved]);

  const live = !!cfg?.live;

  return (
    <Card className="border-slate-200 overflow-hidden" data-testid="cache-redis-card">
      <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl grid place-items-center bg-rose-100 text-rose-600 shrink-0">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-800">Cache / Redis</div>
            <div className="text-sm text-slate-500">Enable a shared Redis cache to cut production latency across instances.</div>
          </div>
        </div>
        <Badge
          data-testid="redis-status-badge"
          className={live ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-slate-800 text-white hover:bg-slate-800"}
        >
          {cfg?.status || (live ? "Live" : "In-memory fallback")}
        </Badge>
      </div>

      <CardContent className="p-5 space-y-5">
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="text-xs font-medium text-slate-500">Provider</label>
            <PremiumSelect
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              options={providers.map((p) => ({ value: p.value, label: p.label }))}
              className="mt-1"
              data-testid="redis-provider"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">Connection type</label>
            <div className="mt-1 h-10 flex items-center px-3 rounded-lg bg-slate-50 border border-slate-200 text-sm font-mono text-slate-600">
              {meta.conn}
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <label className="text-xs font-medium text-slate-500">
              {isUpstash ? "UPSTASH_REDIS_REST_URL" : "Connection URL"}
            </label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder={isUpstash ? "https://xxxx.upstash.io" : "rediss://user:pass@host:6379/0"}
              className="mt-1 font-mono text-sm"
              data-testid="redis-url"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-500">
              {isUpstash ? "UPSTASH_REDIS_REST_TOKEN" : "Password / Token"}
              {cfg?.token_set && (
                <span className="text-slate-400 font-normal"> (saved: ••••{cfg.token_hint} — leave blank to keep)</span>
              )}
            </label>
            <Input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={cfg?.token_set ? "•••••• (unchanged)" : (isUpstash ? "REST token" : "usually embedded in URL")}
              className="mt-1 font-mono text-sm"
              data-testid="redis-token"
            />
          </div>
        </div>

        {cfg?.stats && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-1" data-testid="cache-stats">
            {[
              ["Hits", cfg.stats.hits, "text-emerald-600"],
              ["Misses", cfg.stats.misses, "text-amber-600"],
              ["Hit rate", `${cfg.stats.hit_rate}%`, "text-primary-600"],
              ["Reads", cfg.stats.reads, "text-slate-700"],
              ["Keys", cfg.stats.local_keys, "text-slate-700"],
            ].map(([label, value, tone]) => (
              <div key={label} className="rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2">
                <div className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{label}</div>
                <div className={`text-lg font-bold ${tone}`}>{value ?? 0}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2">
            <Switch checked={enabled} onCheckedChange={setEnabled} data-testid="redis-enabled" />
            <span className="text-sm font-medium text-slate-700">Redis enabled</span>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={test} disabled={testing} data-testid="redis-test">
              <Plug className="h-4 w-4 mr-1.5" />
              {testing ? "Testing…" : "Test connection"}
            </Button>
            <Button onClick={save} disabled={busy} data-testid="redis-save">
              {busy ? "Saving…" : "Save & enable"}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ---- Connection latency diagnostics ---------------------------------------
function DiagItem({ icon: Icon, label, res, hint }) {
  return (
    <Card className="border-slate-200">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Icon className="h-4 w-4" /> {label}
        </div>
        <div className={`text-3xl font-extrabold mt-1 ${latencyClass(res?.latency_ms)}`}>
          {res?.latency_ms == null ? "—" : Number(res.latency_ms).toFixed(res.latency_ms < 10 ? 1 : 0)}
          <span className="text-base font-semibold ml-1 text-slate-400">ms</span>
        </div>
        <div className="text-xs mt-1 flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${res?.ok ? "bg-emerald-500" : "bg-slate-300"}`} />
          <span className="text-slate-500">
            {res?.ok ? "Reachable" : res ? (res.error || "Not connected") : hint}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function DiagnosticsCard() {
  const [diag, setDiag] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/superadmin/perf/diagnostics");
      setDiag(data);
    } catch (e) {
      toast.error("Diagnostics failed");
    } finally {
      setBusy(false);
    }
  }, []);

  return (
    <Card className="border-slate-200 overflow-hidden">
      <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl grid place-items-center bg-indigo-100 text-indigo-600 shrink-0">
            <Gauge className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold text-slate-800">Connection Latency</div>
            <div className="text-sm text-slate-500">
              Measures the real backend→MongoDB / backend→Redis round-trip. Tells you if slowness is the network, not the code.
            </div>
          </div>
        </div>
        <Button onClick={run} disabled={busy} data-testid="run-diagnostics">
          <TimerReset className="h-4 w-4 mr-1.5" />
          {busy ? "Running…" : "Run diagnostics"}
        </Button>
      </div>
      <CardContent className="p-5">
        {!diag ? (
          <div className="text-sm text-slate-500">Click <b>Run diagnostics</b> to measure your production connection latency.</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            <DiagItem icon={Database} label="MongoDB" res={diag.mongo} />
            <DiagItem icon={Zap} label="Redis" res={diag.redis} hint="Not configured" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---- main -----------------------------------------------------------------
export default function PerformanceCenter() {
  const [perf, setPerf] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState(true);
  const timer = useRef(null);

  const loadPerf = useCallback(async () => {
    try {
      const { data } = await api.get("/superadmin/perf");
      setPerf(data);
    } catch (e) { /* handled by interceptor */ }
    finally { setLoading(false); }
  }, []);

  const loadCfg = useCallback(async () => {
    try {
      const { data } = await api.get("/superadmin/redis");
      setCfg(data);
    } catch (e) { /* ignore */ }
  }, []);

  useEffect(() => { loadPerf(); loadCfg(); }, [loadPerf, loadCfg]);

  useEffect(() => {
    if (auto) {
      timer.current = setInterval(() => { loadPerf(); loadCfg(); }, 5000);
      return () => clearInterval(timer.current);
    }
  }, [auto, loadPerf, loadCfg]);

  const reset = useCallback(async () => {
    try {
      await api.post("/superadmin/perf/reset");
      toast.success("Performance stats cleared");
      loadPerf();
    } catch (e) { toast.error("Reset failed"); }
  }, [loadPerf]);

  const routes = perf?.routes || [];

  return (
    <div className="space-y-6 max-w-[1200px]">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Activity className="h-6 w-6 text-rose-500" /> Performance
          </h1>
          <p className="text-slate-500 mt-1 max-w-2xl">
            Live request latency across the platform. Slow endpoints float to the top so you can catch regressions instantly.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <Switch checked={auto} onCheckedChange={setAuto} data-testid="auto-refresh" />
            Auto-refresh
          </label>
          <Button variant="outline" onClick={loadPerf} data-testid="perf-refresh">
            <RefreshCcw className="h-4 w-4 mr-1.5" /> Refresh
          </Button>
          <Button variant="outline" className="text-rose-600 border-rose-200 hover:bg-rose-50" onClick={reset} data-testid="perf-reset">
            <Trash2 className="h-4 w-4 mr-1.5" /> Reset
          </Button>
        </div>
      </div>

      <CacheRedisCard cfg={cfg} onSaved={(c) => { if (c) setCfg(c); else loadCfg(); }} />
      <DiagnosticsCard />

      {/* Summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={AlertTriangle} tone="amber" label="Slow threshold" value={ms(perf?.slow_threshold_ms)} />
        <StatCard icon={ListTree} tone="sky" label="Routes tracked" value={perf?.routes_tracked ?? 0} />
        <StatCard icon={Zap} tone="rose" label="Slow requests" value={perf?.slow_requests ?? 0} />
        <StatCard icon={Gauge} tone="violet" label="Slowest avg" value={ms(perf?.slowest_avg_ms)} />
      </div>

      {/* Table */}
      <Card className="border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center gap-2">
          <ServerCog className="h-5 w-5 text-slate-500" />
          <span className="font-semibold text-slate-800">API Endpoints</span>
          <span className="text-sm text-slate-400">· sorted slowest first</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="perf-table">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-100">
                <th className="px-4 py-2.5 font-medium">Method</th>
                <th className="px-4 py-2.5 font-medium">Endpoint</th>
                <th className="px-4 py-2.5 font-medium text-right">Calls</th>
                <th className="px-4 py-2.5 font-medium text-right">Avg</th>
                <th className="px-4 py-2.5 font-medium text-right">p95</th>
                <th className="px-4 py-2.5 font-medium text-right">Max</th>
                <th className="px-4 py-2.5 font-medium text-right">Slow</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Loading…</td></tr>
              ) : routes.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">No requests recorded yet. Use the app and hit Refresh.</td></tr>
              ) : routes.map((r, i) => (
                <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/60">
                  <td className="px-4 py-2.5">
                    <span className={`text-[11px] font-bold px-2 py-0.5 rounded ${METHOD_COLORS[r.method] || "bg-slate-100 text-slate-600"}`}>
                      {r.method}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-slate-700 max-w-[420px] truncate">{r.path}</td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{r.count}</td>
                  <td className={`px-4 py-2.5 text-right font-semibold ${latencyClass(r.avg_ms)}`}>
                    <span className={`inline-block h-2 w-2 rounded-full mr-1.5 align-middle ${latencyDot(r.avg_ms)}`} />
                    {r.avg_ms} ms
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500">{r.p95_ms} ms</td>
                  <td className={`px-4 py-2.5 text-right ${latencyClass(r.max_ms)}`}>{r.max_ms} ms</td>
                  <td className="px-4 py-2.5 text-right">
                    {r.slow > 0 ? <span className="text-rose-600 font-semibold">{r.slow}</span> : <span className="text-slate-300">0</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
