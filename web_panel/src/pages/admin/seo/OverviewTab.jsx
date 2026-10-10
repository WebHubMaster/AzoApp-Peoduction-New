import { useEffect, useState, useCallback } from "react";
import { FileText, CheckCircle2, AlertTriangle, Copy as CopyIcon, Map, ShieldAlert, Clock, Search, MousePointerClick, Eye, Percent, TrendingUp } from "lucide-react";
import api from "@/lib/api";
import { Card, Stat, SkelGrid, Select, Btn, fmtDate, Sev, TYPE_LABEL, errMsg } from "./seoUi";

export default function OverviewTab({ go }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");
  const [f, setF] = useState({ type: "", category_id: "", city: "", status: "", date_from: "" });
  const load = useCallback(() => {
    setErr("");
    api.get("/admin/seo/overview", { params: f }).then((r) => setD(r.data)).catch((e) => setErr(errMsg(e, "Could not load overview")));
  }, [f]);
  useEffect(load, [load]);
  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const since = (days) => (days ? new Date(Date.now() - days * 864e5).toISOString().slice(0, 10) : "");

  if (err) return <Card><p className="text-sm text-rose-600" data-testid="seo-overview-error">{err}</p><Btn className="mt-3" onClick={load}>Retry</Btn></Card>;
  if (!d) return <div className="space-y-4"><SkelGrid n={8} /><SkelGrid n={4} /></div>;
  const t = d.totals, ix = d.indexing, g = d.gsc;

  return (
    <div className="space-y-5" data-testid="seo-overview">
      <div className="flex flex-wrap items-center gap-2" data-testid="seo-overview-filters">
        <Select testId="ov-filter-type" value={f.type} onChange={set("type")} placeholder="All page types"
          options={[{ value: "", label: "All page types" }, ...Object.entries(TYPE_LABEL).map(([value, label]) => ({ value, label }))]} className="w-44" />
        <Select testId="ov-filter-category" value={f.category_id} onChange={set("category_id")} placeholder="All categories"
          options={[{ value: "", label: "All categories" }, ...d.facets.categories.map((c) => ({ value: c.id, label: c.name }))]} className="w-48" />
        <Select testId="ov-filter-city" value={f.city} onChange={set("city")} placeholder="All cities"
          options={[{ value: "", label: "All cities" }, ...d.facets.cities.map((c) => ({ value: c, label: c }))]} className="w-40" />
        <Select testId="ov-filter-status" value={f.status} onChange={set("status")} placeholder="Any status"
          options={[{ value: "", label: "Any status" }, { value: "published", label: "Published" }, { value: "unpublished", label: "Unpublished" }]} className="w-36" />
        <Select testId="ov-filter-date" value={f.date_from} onChange={set("date_from")} placeholder="Any time"
          options={[{ value: "", label: "Updated: any time" }, { value: since(7), label: "Last 7 days" }, { value: since(30), label: "Last 30 days" }, { value: since(90), label: "Last 90 days" }]} className="w-44" />
        <span className="ml-auto text-[11px] text-slate-400">Index built {fmtDate(d.built_at)}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat testId="ov-eligible" icon={CheckCircle2} label="Eligible SEO pages" value={t.eligible} hint={`${t.published} published of ${t.pages}`} tone="blue" source="db" />
        <Stat testId="ov-custom" icon={FileText} label="Custom metadata" value={t.custom} hint="Admin-written title/description" source="db" />
        <Stat testId="ov-missing" icon={AlertTriangle} label="Missing metadata" value={t.missing} tone={t.missing ? "red" : "green"} hint="No title or description" source="audit" />
        <Stat testId="ov-duplicates" icon={CopyIcon} label="Duplicate title/description" value={t.duplicates} tone={t.duplicates ? "amber" : "green"} hint="Among published pages" source="audit" />
        <Stat testId="ov-sitemap" icon={Map} label="Sitemap URLs" value={d.sitemap.url_count} hint={d.sitemap.generated_at ? `Generated ${fmtDate(d.sitemap.generated_at)}` : "Not generated yet"} source="db" />
        <Stat testId="ov-technical" icon={ShieldAlert} label="Technical issues" value={d.technical.failing} tone={d.technical.critical ? "red" : d.technical.failing ? "amber" : "green"} hint={`${d.technical.total} checks · ${d.technical.critical} critical`} source="audit" />
        <Stat testId="ov-score" icon={TrendingUp} label="On-page score (avg)" value={t.avg_score} hint="Transparent rules, not a Google score" source="audit" />
        <Stat testId="ov-audit" icon={Clock} label="Last successful audit" value={d.audit.last_success ? fmtDate(d.audit.last_success).split(",")[0] : "Never"} hint={d.audit.last_success ? fmtDate(d.audit.last_success) : "Run one from the Audit tab"} source="audit" />
      </div>

      <div className="grid lg:grid-cols-3 gap-5">
        <Card className="lg:col-span-2" title="Indexing pipeline" subtitle="Each state only appears when the underlying data supports it." testId="ov-indexing">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[["Published", ix.published, "db"], ["Eligible for indexing", ix.eligible, "db"], ["Submitted for discovery", ix.submitted, "google"],
              ["Indexed (inspected)", g.connected ? ix.indexed : "—", "google"], ["Indexing issue", g.connected ? ix.issue : "—", "google"]].map(([l, v, s]) => (
              <div key={l} className="rounded-lg bg-slate-50 ring-1 ring-slate-200/70 p-3"><p className="text-[11px] text-slate-500">{l}</p><p className="text-xl font-bold text-slate-900 tabular-nums mt-1">{v}</p><div className="mt-1"><Sev s={s === "google" ? "ok" : "info"}>{s === "google" ? "Google" : "Stored"}</Sev></div></div>
            ))}
          </div>
          {!g.connected && <p className="text-xs text-amber-700 bg-amber-50 ring-1 ring-amber-200 rounded-lg px-3 py-2 mt-4" data-testid="ov-gsc-not-connected">Search Console is <b>not connected</b>. Indexed / non-indexed counts are unavailable until you connect it — sitemap submission is not proof of indexing.
            <button onClick={() => go("indexing")} className="ml-2 font-semibold underline">Connect</button></p>}
          {ix.inspected > 0 && <p className="text-xs text-slate-500 mt-3">{ix.inspected} URL(s) inspected via the URL Inspection API.</p>}
        </Card>
        <Card title="Search performance" subtitle={g.totals ? `Google data · ${g.range?.[0]} → ${g.range?.[1]}` : "From Google Search Console"} testId="ov-performance">
          {g.totals ? (
            <div className="grid grid-cols-2 gap-3">
              {[[MousePointerClick, "Clicks", g.totals.clicks], [Eye, "Impressions", g.totals.impressions], [Percent, "CTR", `${(g.totals.ctr * 100).toFixed(2)}%`], [Search, "Avg position", g.totals.position.toFixed(1)]].map(([I, l, v]) => (
                <div key={l} className="rounded-lg bg-slate-50 p-3"><I className="h-4 w-4 text-[#0D47A1]" /><p className="text-lg font-bold mt-1 tabular-nums">{v}</p><p className="text-[11px] text-slate-500">{l}</p></div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">No Google data synced. {g.connected ? "Sync it from Indexing & Search Console." : "Connect Search Console to see clicks, impressions, CTR and position."}</p>}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Top issues" subtitle="Rule-based audit findings across the filtered pages" right={<Btn size="sm" variant="outline" onClick={() => go("audit")} data-testid="ov-open-audit">Open audit</Btn>} testId="ov-top-issues">
          {d.top_issues.length === 0 ? <p className="text-sm text-emerald-600">No open issues for this filter.</p> : (
            <ul className="divide-y divide-slate-100">{d.top_issues.map((i) => (
              <li key={i.code} className="flex items-center justify-between py-2 text-sm"><span className="text-slate-700">{i.label}</span><span className="font-semibold tabular-nums text-slate-900">{i.count}</span></li>
            ))}</ul>
          )}
        </Card>
        <Card title="Coverage by page type" testId="ov-by-type">
          <div className="overflow-x-auto">
            <table className="w-full text-sm"><thead><tr className="text-[11px] uppercase tracking-wider text-slate-500 text-left"><th className="py-2">Type</th><th className="text-right">Pages</th><th className="text-right">Indexable</th><th className="text-right">Custom</th><th className="text-right">Missing</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{Object.entries(d.by_type).map(([k, v]) => (
                <tr key={k}><td className="py-2 font-medium text-slate-800">{TYPE_LABEL[k] || k}</td><td className="text-right tabular-nums">{v.total}</td><td className="text-right tabular-nums">{v.indexable}</td><td className="text-right tabular-nums">{v.custom}</td><td className={`text-right tabular-nums ${v.missing ? "text-rose-600 font-semibold" : ""}`}>{v.missing}</td></tr>
              ))}</tbody></table>
          </div>
        </Card>
      </div>
    </div>
  );
}
