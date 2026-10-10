import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, ExternalLink } from "lucide-react";
import api from "@/lib/api";
import { Card, Btn, CopyField, Stat, SkelGrid, Skel, Sev, fmtDate, errMsg, TYPE_LABEL } from "./seoUi";

export default function SitemapTab() {
  const [d, setD] = useState(null);
  const [robots, setRobots] = useState("");
  const [busy, setBusy] = useState(false);
  const load = () => {
    api.get("/admin/seo/sitemap").then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e)));
    api.get("/admin/seo/technical").then((r) => setRobots(r.data.robots_preview)).catch(() => {});
  };
  useEffect(() => { load(); }, []);
  const regen = async () => { setBusy(true); try { const { data } = await api.post("/admin/seo/sitemap/regenerate"); setD(data); toast.success("Sitemap regenerated"); } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); } };
  if (!d) return <div className="space-y-4"><SkelGrid /><Skel className="h-64" /></div>;
  return (
    <div className="space-y-5" data-testid="seo-sitemap">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat testId="sm-total" label="URLs in sitemap" value={d.total} hint="Canonical, indexable only" tone="blue" source="db" />
        <Stat testId="sm-files" label="Sitemap files" value={d.files.length} hint={`Up to ${d.chunk_size} URLs each`} source="db" />
        <Stat testId="sm-excluded" label="Excluded URLs" value={d.excluded_total} hint="noindex, redirects, drafts…" source="db" />
        <Stat testId="sm-generated" label="Last generated" value={d.generated_at ? fmtDate(d.generated_at).split(",")[0] : "—"} hint={d.stale ? "Changes pending regeneration" : fmtDate(d.generated_at)} tone={d.stale ? "amber" : "green"} source="db" />
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Sitemap index" subtitle="Updates automatically when pages are created, published, edited or removed" right={<Btn size="sm" variant="outline" loading={busy} onClick={regen} data-testid="sm-regenerate"><RefreshCw className="h-3.5 w-3.5" />Regenerate</Btn>} testId="sm-index">
          <div className="space-y-3">
            <CopyField value={d.index_url} testId="sm-url" />
            <p className="text-[11px] text-slate-500">Also available at <code>{d.api_url}</code>. Submit the root URL in Search Console.</p>
            <div className="divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
              {d.files.map((f) => <a key={f.url} href={f.url} target="_blank" rel="noreferrer" className="flex items-center justify-between px-3 py-2 text-sm hover:bg-slate-50"><span className="font-mono text-xs text-slate-700 truncate">{f.url.split("/").pop()}</span><span className="flex items-center gap-2 text-xs text-slate-500">{f.count} URLs<ExternalLink className="h-3.5 w-3.5" /></span></a>)}
            </div>
            <div data-testid="sm-validation">{d.errors.length === 0 ? <p className="text-xs text-emerald-600">Validation passed: all URLs absolute, unique and on the preferred host.</p>
              : <div className="text-xs text-amber-700 space-y-0.5"><p className="font-semibold">{d.errors.length} validation warning(s)</p>{d.errors.slice(0, 5).map((e) => <p key={e}>• {e}</p>)}</div>}</div>
          </div>
        </Card>
        <Card title="robots.txt (generated)" subtitle="Edit rules in Technical SEO" testId="sm-robots">
          <CopyField value={d.robots_url} testId="robots-url" />
          <pre className="mt-3 text-[11.5px] bg-slate-900 text-slate-100 rounded-lg p-3 overflow-x-auto max-h-72" data-testid="robots-preview">{robots}</pre>
        </Card>
      </div>
      <Card pad={false} title="Excluded from sitemap" subtitle="Why each URL is not listed" testId="sm-excluded-list">
        {d.excluded.length === 0 ? <p className="p-5 text-sm text-slate-500">Nothing excluded.</p> : (
          <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
            {d.excluded.map((e) => <div key={e.path} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm"><Sev s="info">{TYPE_LABEL[e.type]}</Sev><span className="text-slate-800">{e.name}</span><code className="text-[11px] text-slate-400">{e.path}</code><span className="ml-auto text-xs text-slate-500">{e.reason}</span></div>)}
          </div>
        )}
      </Card>
    </div>
  );
}
