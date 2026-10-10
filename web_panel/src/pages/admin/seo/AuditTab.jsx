import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Play, Loader2 } from "lucide-react";
import api from "@/lib/api";
import { Card, Btn, Stat, CheckRow, Sev, SkelGrid, fmtDate, errMsg } from "./seoUi";
import PagesTable from "./PagesTable";

export default function AuditTab() {
  const [d, setD] = useState(null);
  const [running, setRunning] = useState(false);
  const timer = useRef();
  const load = () => api.get("/admin/seo/audit/latest").then((r) => {
    setD(r.data);
    const isRunning = r.data.current?.status === "running";
    setRunning(isRunning);
    if (isRunning) timer.current = setTimeout(load, 2500);
  }).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); return () => clearTimeout(timer.current); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const run = async () => { try { await api.post("/admin/seo/audit/run"); setRunning(true); toast.success("Audit started in the background"); setTimeout(load, 1500); } catch (e) { toast.error(errMsg(e)); } };
  const last = d?.last_success;

  return (
    <div className="space-y-5" data-testid="seo-audit">
      <div className="flex flex-wrap items-center gap-3 bg-white rounded-xl border border-slate-200 px-4 py-3">
        <div className="flex-1 min-w-[220px]"><p className="text-sm font-semibold text-slate-900">Full site audit</p><p className="text-xs text-slate-500">Runs in the background: on-page rules, technical checks, live HTTP status of key URLs and image weight sampling. Scores follow transparent rules — not Google rankings.</p></div>
        {running ? <span className="text-sm text-[#0D47A1] inline-flex items-center gap-2" data-testid="audit-running"><Loader2 className="h-4 w-4 animate-spin" />Running…</span>
          : <Btn onClick={run} data-testid="audit-run"><Play className="h-4 w-4" />Run audit</Btn>}
      </div>
      {!d ? <SkelGrid /> : last ? (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Stat testId="audit-last" label="Last successful audit" value={fmtDate(last.finished_at).split(",")[0]} hint={fmtDate(last.finished_at)} source="audit" />
            <Stat testId="audit-score" label="Average on-page score" value={last.avg_score} hint={`${last.published} published pages`} tone="blue" source="audit" />
            <Stat testId="audit-critical" label="Critical + high" value={(last.by_severity?.critical || 0) + (last.by_severity?.high || 0)} tone={(last.by_severity?.critical || 0) + (last.by_severity?.high || 0) ? "red" : "green"} source="audit" />
            <Stat testId="audit-medium" label="Medium + low" value={(last.by_severity?.medium || 0) + (last.by_severity?.low || 0)} tone="amber" source="audit" />
          </div>
          <div className="grid lg:grid-cols-2 gap-5">
            <Card title="Technical checks (at audit time)" testId="audit-technical">{(last.technical || []).map((c) => <CheckRow key={c.code} ok={c.ok} sev={c.severity} title={c.title} detail={c.detail} fix={c.fix} />)}</Card>
            <div className="space-y-5">
              <Card title="HTTP response codes" subtitle="Live requests to public URLs" testId="audit-crawl">
                {(last.crawl || []).map((c) => <div key={c.url} className="flex items-center gap-2 py-1.5 text-xs"><Sev s={c.ok ? "ok" : "high"}>{c.status || "ERR"}</Sev><code className="truncate flex-1 text-slate-700">{c.url.replace(/^https?:\/\/[^/]+/, "")}</code><span className="text-slate-400">{c.content_type || c.error}</span></div>)}
              </Card>
              <Card title="Image optimization" subtitle="Sampled public images (HEAD requests)" testId="audit-images">
                {(last.images || []).length === 0 ? <p className="text-sm text-slate-500">No images sampled.</p> : (last.images || []).map((im) => (
                  <div key={im.url} className="flex items-center gap-2 py-1.5 text-xs"><Sev s={im.recommendation ? "medium" : im.status === 200 ? "ok" : "high"}>{im.bytes ? `${Math.round(im.bytes / 1024)} KB` : im.status || "ERR"}</Sev><span className="truncate flex-1 text-slate-700">{im.page}</span><span className="text-slate-500">{im.recommendation || im.type}</span></div>
                ))}
              </Card>
            </div>
          </div>
          {d.runs?.length > 1 && <Card title="Audit history" testId="audit-history"><div className="divide-y divide-slate-100">{d.runs.map((r) => <div key={r.id} className="flex items-center gap-3 py-2 text-xs"><Sev s={r.status === "done" ? "ok" : r.status === "failed" ? "high" : "low"}>{r.status}</Sev><span className="text-slate-600">{fmtDate(r.started_at)}</span><span className="ml-auto text-slate-500">score {r.avg_score ?? "—"} · {r.pages ?? "—"} pages</span></div>)}</div></Card>}
        </>
      ) : <Card><p className="text-sm text-slate-500" data-testid="audit-never">No audit has been run yet. Live page findings are shown below.</p></Card>}
      <PagesTable title="SEO audit table" subtitle="Live rule results · server-side pagination, filters & export" showCity testId="audit-table" />
    </div>
  );
}
