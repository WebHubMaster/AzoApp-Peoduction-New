import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Unplug, Send, RefreshCw, SearchCheck, RotateCw } from "lucide-react";
import api from "@/lib/api";
import { Card, Btn, Pill, Sev, Select, Field, inputCls, SkelRows, Skel, Pager, CopyField, fmtDate, errMsg, useDebounced, TYPE_LABEL, copy } from "./seoUi";

const STATES = [["", "All pages"], ["published", "Published"], ["eligible", "Eligible for indexing"], ["not_eligible", "Published but not eligible"], ["submitted", "Submitted for discovery"], ["indexed", "Indexed"], ["issue", "Indexing issue"]];

export default function IndexingTab() {
  const [st, setSt] = useState(null);
  const [prop, setProp] = useState("");
  const [busy, setBusy] = useState("");
  const [perf, setPerf] = useState(null);
  const [smaps, setSmaps] = useState(null);
  const fileRef = useRef();
  const load = () => api.get("/admin/seo/gsc/status").then((r) => { setSt(r.data); setProp(r.data.property || ""); }).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); api.get("/admin/seo/gsc/performance").then((r) => setPerf(r.data?.totals ? r.data : null)).catch(() => {}); }, []);
  const run = async (name, fn, ok) => { setBusy(name); try { const r = await fn(); ok && toast.success(typeof ok === "function" ? ok(r.data) : ok); load(); return r; } catch (e) { toast.error(errMsg(e)); } finally { setBusy(""); } };
  const upload = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file);
    run("upload", () => api.post("/admin/seo/gsc/credentials", fd, { headers: { "Content-Type": "multipart/form-data" } }), "Credentials stored securely on the server");
    e.target.value = "";
  };
  const connected = st?.connected;

  return (
    <div className="space-y-5" data-testid="seo-indexing">
      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2" title="Google Search Console" subtitle="Service-account connection · credentials never leave the server" testId="gsc-card"
          right={st && (connected ? <Pill tone="green" testId="gsc-status">Connected</Pill> : <Pill tone={st.credentials_present ? "amber" : "slate"} testId="gsc-status">{st.status}</Pill>)}>
          {!st ? <Skel className="h-40" /> : (
            <div className="space-y-4">
              {!st.credentials_present && (
                <ol className="text-xs text-slate-600 list-decimal ml-4 space-y-1" data-testid="gsc-setup-steps">
                  <li>In Google Cloud Console enable the <b>Google Search Console API</b> and create a service account with a JSON key.</li>
                  <li>In Search Console → Settings → Users and permissions, add the service-account email (Full permission for sitemap submission).</li>
                  <li>Upload the JSON key below, then pick your property.</li>
                </ol>
              )}
              {st.error && <p className="text-xs text-rose-600" data-testid="gsc-error">{st.error}</p>}
              {st.last_error && <p className="text-xs text-rose-600">Last error ({fmtDate(st.last_error_at)}): {st.last_error}</p>}
              {st.service_account && <p className="text-xs text-slate-600">Service account: <code>{st.service_account}</code></p>}
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={upload} data-testid="gsc-file" />
                <Btn variant="outline" size="sm" loading={busy === "upload"} onClick={() => fileRef.current?.click()} data-testid="gsc-upload"><Upload className="h-3.5 w-3.5" />{st.credentials_present ? "Replace key" : "Upload service-account JSON"}</Btn>
                {st.credentials_present && <Btn variant="danger" size="sm" onClick={() => window.confirm("Disconnect Search Console and delete the stored key?") && run("dc", () => api.delete("/admin/seo/gsc/credentials"), "Disconnected")} data-testid="gsc-disconnect"><Unplug className="h-3.5 w-3.5" />Disconnect</Btn>}
              </div>
              {connected && (
                <div className="grid sm:grid-cols-[1fr_auto] gap-2 items-end">
                  <Field label="Property" hint="URL-prefix (https://example.com/) or sc-domain:example.com">
                    {st.sites?.length ? <Select testId="gsc-property" value={prop} onChange={setProp} options={[{ value: "", label: "Select property" }, ...st.sites.map((s) => ({ value: s, label: `${s} (${st.site_permissions?.[s] || ""})` }))]} />
                      : <input data-testid="gsc-property-input" className={inputCls} value={prop} onChange={(e) => setProp(e.target.value)} />}
                  </Field>
                  <Btn size="sm" disabled={!prop || prop === st.property} loading={busy === "prop"} onClick={() => run("prop", () => api.put("/admin/seo/gsc/property", { property: prop }), "Property saved")} data-testid="gsc-property-save">Save</Btn>
                </div>
              )}
              {connected && st.property && (
                <div className="flex flex-wrap gap-2">
                  <Btn size="sm" loading={busy === "submit"} onClick={() => run("submit", () => api.post("/admin/seo/gsc/submit-sitemap"), (d) => d.note)} data-testid="gsc-submit-sitemap"><Send className="h-3.5 w-3.5" />Submit sitemap</Btn>
                  <Btn size="sm" variant="outline" loading={busy === "sync"} onClick={async () => { const r = await run("sync", () => api.post("/admin/seo/gsc/sync", { days: 28 }), "Performance synced from Google"); if (r) setPerf(r.data); }} data-testid="gsc-sync"><RefreshCw className="h-3.5 w-3.5" />Sync performance</Btn>
                  <Btn size="sm" variant="outline" loading={busy === "list"} onClick={async () => { const r = await run("list", () => api.get("/admin/seo/gsc/sitemaps")); if (r) setSmaps(r.data); }} data-testid="gsc-list-sitemaps">Sitemaps in Google</Btn>
                </div>
              )}
              <div className="grid sm:grid-cols-3 gap-3 text-xs">
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">Connected</p><p className="font-semibold text-slate-800 mt-0.5">{fmtDate(st.connected_at)}</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">Last performance sync</p><p className="font-semibold text-slate-800 mt-0.5" data-testid="gsc-last-sync">{fmtDate(st.last_sync)}</p></div>
                <div className="rounded-lg bg-slate-50 p-3"><p className="text-slate-500">Last sitemap submission</p><p className="font-semibold text-slate-800 mt-0.5">{fmtDate(st.last_sitemap_submit)}</p></div>
              </div>
              {smaps && <div className="text-xs space-y-1" data-testid="gsc-sitemaps">{smaps.length === 0 ? <p className="text-slate-500">Google has no sitemaps for this property yet.</p> : smaps.map((s) => <p key={s.path}><code>{s.path}</code> · last downloaded {s.lastDownloaded || "—"} · {s.errors || 0} errors · {s.warnings || 0} warnings</p>)}</div>}
            </div>
          )}
        </Card>
        <Card title="Performance (Google data)" subtitle={perf ? `${perf.start} → ${perf.end} · synced ${fmtDate(perf.synced_at)}` : "Not synced"} testId="gsc-performance">
          {!perf ? <p className="text-sm text-slate-500">{connected ? "Run “Sync performance” to fetch clicks, impressions, CTR and position." : "Available after connecting Search Console. No data is estimated."}</p> : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2 text-center">{[["Clicks", perf.totals.clicks], ["Impressions", perf.totals.impressions], ["CTR", `${(perf.totals.ctr * 100).toFixed(2)}%`], ["Avg position", perf.totals.position.toFixed(1)]].map(([l, v]) => <div key={l} className="rounded-lg bg-slate-50 p-2"><p className="font-bold tabular-nums">{v}</p><p className="text-[11px] text-slate-500">{l}</p></div>)}</div>
              <p className="text-[11px] font-semibold text-slate-500 uppercase">Top queries</p>
              {(perf.queries || []).slice(0, 8).map((r) => <p key={r.keys[0]} className="text-xs flex justify-between gap-2"><span className="truncate">{r.keys[0]}</span><span className="tabular-nums text-slate-500">{r.clicks} · {r.impressions}</span></p>)}
              <p className="text-[11px] font-semibold text-slate-500 uppercase">Top landing pages</p>
              {(perf.pages || []).slice(0, 6).map((r) => <p key={r.keys[0]} className="text-xs flex justify-between gap-2"><span className="truncate">{r.keys[0].replace(/^https?:\/\/[^/]+/, "")}</span><span className="tabular-nums text-slate-500">{r.clicks}</span></p>)}
            </div>
          )}
        </Card>
      </div>
      <PipelineTable connected={connected} />
      <EventsCard />
    </div>
  );
}

function PipelineTable({ connected }) {
  const [d, setD] = useState(null);
  const [state, setState] = useState("");
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [page, setPage] = useState(1);
  const load = () => api.get("/admin/seo/indexing", { params: { state, q: dq, page } }).then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); }, [state, dq, page]); // eslint-disable-line react-hooks/exhaustive-deps
  const inspect = async (key) => { try { await api.post("/admin/seo/gsc/inspect", { key }); toast.success("Google inspection recorded"); load(); } catch (e) { toast.error(errMsg(e)); } };
  const S = ({ on, label, na }) => na ? <span className="text-[10px] text-slate-300">n/a</span> : on ? <Sev s="ok">{label}</Sev> : <span className="text-[10px] text-slate-400">—</span>;
  return (
    <Card pad={false} title="Publishing & discovery workflow" subtitle="Published → Eligible → Submitted for discovery → Indexed. Sitemap submission is not proof of indexing." testId="pipeline-card"
      right={<Btn size="sm" variant="outline" onClick={() => api.post("/admin/seo/reconcile").then(() => { toast.success("Re-validated all pages"); load(); }).catch((e) => toast.error(errMsg(e)))} data-testid="pipeline-reconcile"><RotateCw className="h-3.5 w-3.5" />Re-validate</Btn>}>
      {d && <div className="flex flex-wrap gap-2 px-4 pt-3">{STATES.map(([k, l]) => <button key={k} onClick={() => { setState(k); setPage(1); }} data-testid={`pipe-state-${k || "all"}`} className={`h-7 px-2.5 rounded-full text-xs font-semibold ring-1 ${state === k ? "bg-[#0D47A1] text-white ring-[#0D47A1]" : "bg-white text-slate-600 ring-slate-200"}`}>{l}{k && d.counts[k] !== undefined ? ` · ${d.counts[k]}` : ""}</button>)}</div>}
      <div className="px-4 py-3"><input data-testid="pipeline-search" className={`${inputCls} max-w-xs`} placeholder="Search pages…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} /></div>
      {!d ? <SkelRows /> : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm"><thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500"><tr><th className="text-left px-4 py-2">Page</th><th>Published</th><th>Eligible</th><th>Submitted</th><th>Indexed</th><th>Issue</th><th className="px-4" /></tr></thead>
              <tbody className="divide-y divide-slate-100">{d.rows.map((r) => (
                <tr key={r.key} data-testid={`pipe-row-${r.key}`}>
                  <td className="px-4 py-2 max-w-[320px]"><p className="font-medium text-slate-800 truncate">{r.name}</p><p className="text-[11px] text-slate-400">{TYPE_LABEL[r.type]} · <span className="font-mono">{r.path}</span></p></td>
                  <td className="text-center"><S on={r.states.published} label="yes" /></td>
                  <td className="text-center"><S on={r.states.eligible} label="yes" /></td>
                  <td className="text-center">{r.states.submitted ? <span title={fmtDate(r.submitted_at)}><Sev s="ok">sitemap</Sev></span> : r.pending ? <Sev s="low">queued</Sev> : <span className="text-[10px] text-slate-400">—</span>}</td>
                  <td className="text-center"><S on={r.states.indexed} label="indexed" na={!connected} /></td>
                  <td className="text-center">{r.states.issue ? <Sev s="high">{r.inspection.coverage_state || "issue"}</Sev> : <S on={false} na={!connected} />}</td>
                  <td className="px-4 text-right whitespace-nowrap">
                    {connected ? <Btn size="sm" variant="ghost" onClick={() => inspect(r.key)} data-testid={`pipe-inspect-${r.key}`}><SearchCheck className="h-3.5 w-3.5" />Inspect</Btn>
                      : <Btn size="sm" variant="ghost" onClick={() => copy(r.url)} data-testid={`pipe-copy-${r.key}`}>Copy URL</Btn>}
                  </td>
                </tr>
              ))}</tbody></table>
          </div>
          <Pager page={d.page} pages={d.pages} total={d.total} onPage={setPage} testId="pipeline-pager" />
        </>
      )}
      {!connected && <div className="px-4 pb-4"><p className="text-[11px] text-slate-500 mb-1">Manual inspection: copy a URL and paste it into Search Console's URL Inspection tool.</p><CopyField value="https://search.google.com/search-console" testId="gsc-manual-link" /></div>}
    </Card>
  );
}

function EventsCard() {
  const [d, setD] = useState(null);
  const load = () => api.get("/admin/seo/events").then((r) => setD(r.data)).catch(() => setD({ events: [], jobs: [] }));
  useEffect(() => { load(); }, []);
  const retry = async (id) => { try { await api.post(`/admin/seo/jobs/${id}/retry`); toast.success("Re-queued"); load(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <Card title="Activity log" subtitle="Every action with its real status" testId="events-card" right={<Btn size="sm" variant="ghost" onClick={load}><RefreshCw className="h-3.5 w-3.5" /></Btn>}>
        {!d ? <SkelRows n={4} /> : d.events.length === 0 ? <p className="text-sm text-slate-500">No activity yet.</p> : (
          <ul className="space-y-2 max-h-80 overflow-y-auto">{d.events.map((e) => <li key={e.id} className="text-xs flex gap-2"><Sev s={e.status === "error" ? "high" : e.status === "warn" ? "medium" : "ok"}>{e.kind.replace(/_/g, " ")}</Sev><span className="text-slate-700 flex-1">{e.message}</span><span className="text-slate-400 whitespace-nowrap">{fmtDate(e.created_at)}</span></li>)}</ul>
        )}
      </Card>
      <Card title="Job queue" subtitle="Retries use backoff (1m → 5m → 15m → 1h), max 4 attempts" testId="jobs-card">
        {!d ? <SkelRows n={3} /> : d.jobs.length === 0 ? <p className="text-sm text-slate-500">No pending or failed jobs.</p> : (
          <ul className="space-y-2">{d.jobs.map((j) => <li key={j.id} className="text-xs flex flex-wrap items-center gap-2"><Sev s={j.status === "failed" ? "high" : "low"}>{j.status}</Sev><span className="font-medium text-slate-700">{j.kind}</span><span className="text-slate-500">attempt {j.attempts}</span>{j.error && <span className="text-rose-600 truncate max-w-[220px]">{j.error}</span>}{j.status === "failed" && <Btn size="sm" variant="outline" className="ml-auto" onClick={() => retry(j.id)} data-testid={`job-retry-${j.id}`}>Retry</Btn>}</li>)}</ul>
        )}
      </Card>
    </div>
  );
}
