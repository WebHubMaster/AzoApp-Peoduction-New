import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Save, RefreshCw } from "lucide-react";
import api from "@/lib/api";
import { Card, Btn, Field, inputCls, areaCls, Toggle, CheckRow, Skel, SkelRows, Pager, Sev, Select, errMsg, useDebounced, Empty } from "./seoUi";

export default function TechnicalTab() {
  const [t, setT] = useState(null);
  const [init, setInit] = useState("");
  const [checks, setChecks] = useState(null);
  const [saving, setSaving] = useState(false);
  const load = () => api.get("/admin/seo/technical").then((r) => { setT(r.data); setInit(JSON.stringify(r.data)); }).catch((e) => toast.error(errMsg(e)));
  const loadChecks = () => { setChecks(null); api.get("/admin/seo/technical/checks").then((r) => setChecks(r.data)).catch(() => setChecks([])); };
  useEffect(() => { load(); loadChecks(); }, []);
  const save = async () => {
    setSaving(true);
    try { const { data } = await api.put("/admin/seo/technical", t); setT(data); setInit(JSON.stringify(data)); toast.success("Technical SEO saved"); loadChecks(); }
    catch (e) { toast.error(errMsg(e, "Save failed")); } finally { setSaving(false); }
  };
  const set = (k) => (v) => setT((x) => ({ ...x, [k]: v?.target ? v.target.value : v }));
  const dirty = t && JSON.stringify(t) !== init;

  return (
    <div className="space-y-5" data-testid="seo-technical">
      <div className="grid lg:grid-cols-2 gap-5">
        <Card title="Technical checks" subtitle="Rule-based configuration checks" right={<Btn size="sm" variant="outline" onClick={loadChecks} data-testid="tech-recheck"><RefreshCw className="h-3.5 w-3.5" />Re-check</Btn>} testId="tech-checks">
          {!checks ? <SkelRows n={6} /> : checks.map((c) => <CheckRow key={c.code} testId={`check-${c.code}`} ok={c.ok} sev={c.severity} title={c.title} detail={c.detail} fix={c.fix} />)}
        </Card>
        <Card title="Crawling & indexing rules" testId="tech-settings" right={<Btn size="sm" disabled={!dirty} loading={saving} onClick={save} data-testid="tech-save"><Save className="h-3.5 w-3.5" />Save</Btn>}>
          {!t ? <Skel className="h-80" /> : (
            <div className="space-y-4">
              <Field label="Private paths (Disallow + noindex)" hint="One per line. Essential public paths (/, /service, /category, /city, assets) are refused automatically.">
                <textarea data-testid="tech-private-paths" className={`${areaCls} font-mono text-xs min-h-[150px]`} value={(t.private_paths || []).join("\n")} onChange={(e) => setT((x) => ({ ...x, private_paths: e.target.value.split("\n") }))} /></Field>
              <Field label="Custom robots.txt rules" hint="Validated: User-agent / Allow / Disallow / Crawl-delay / Sitemap lines only. Use noindex (not robots.txt) to keep pages out of results.">
                <textarea data-testid="tech-robots-custom" className={`${areaCls} font-mono text-xs`} value={t.robots_custom || ""} onChange={set("robots_custom")} placeholder={"User-agent: GPTBot\nDisallow: /blog/drafts"} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="URLs per sitemap file"><input type="number" data-testid="tech-chunk" className={inputCls} value={t.sitemap_chunk_size} onChange={set("sitemap_chunk_size")} /></Field>
                <Field label="Min. local chars (city)"><input type="number" data-testid="tech-city-min" className={inputCls} value={t.city_min_unique_chars} onChange={set("city_min_unique_chars")} /></Field>
                <Field label="Min. local chars (city-service)"><input type="number" data-testid="tech-cs-min" className={inputCls} value={t.city_service_min_unique_chars} onChange={set("city_service_min_unique_chars")} /></Field>
              </div>
              <div className="flex flex-col gap-2.5">
                <Toggle testId="tech-auto-redirects" checked={t.auto_slug_redirects} onChange={set("auto_slug_redirects")} label="Create 301 redirects automatically when a published slug changes" />
                <Toggle testId="tech-include-blog" checked={t.include_blog} onChange={set("include_blog")} label="Include blog posts in sitemaps" />
                <Toggle testId="tech-include-static" checked={t.include_static} onChange={set("include_static")} label="Include static pages (home, about, policies)" />
              </div>
            </div>
          )}
        </Card>
      </div>
      <RedirectsCard />
    </div>
  );
}

function RedirectsCard() {
  const [d, setD] = useState(null);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [problem, setProblem] = useState("");
  const [page, setPage] = useState(1);
  const [n, setN] = useState({ from_path: "", to_path: "", type: "301" });
  const [busy, setBusy] = useState(false);
  const load = () => api.get("/admin/seo/redirects", { params: { q: dq, problem, page } }).then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); }, [dq, problem, page]); // eslint-disable-line react-hooks/exhaustive-deps
  const add = async () => {
    setBusy(true);
    try { await api.post("/admin/seo/redirects", n); toast.success("Redirect saved (chains collapsed automatically)"); setN({ from_path: "", to_path: "", type: "301" }); load(); }
    catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };
  const del = async (id) => { if (!window.confirm("Delete this redirect?")) return; try { await api.delete(`/admin/seo/redirects/${id}`); load(); } catch (e) { toast.error(errMsg(e)); } };
  return (
    <Card pad={false} title="Redirect management" subtitle="Same-domain only · loops rejected · chains collapsed · old slugs redirect automatically" testId="redirects-card">
      <div className="grid sm:grid-cols-[1fr_1fr_110px_auto] gap-2 px-4 py-3 border-b border-slate-100">
        <input data-testid="redirect-from" className={inputCls} placeholder="/old-path" value={n.from_path} onChange={(e) => setN({ ...n, from_path: e.target.value })} />
        <input data-testid="redirect-to" className={inputCls} placeholder="/new-path" value={n.to_path} onChange={(e) => setN({ ...n, to_path: e.target.value })} />
        <Select testId="redirect-type" value={n.type} onChange={(v) => setN({ ...n, type: v })} options={[{ value: "301", label: "301" }, { value: "302", label: "302" }, { value: "308", label: "308" }]} />
        <Btn loading={busy} disabled={!n.from_path || !n.to_path} onClick={add} data-testid="redirect-add"><Plus className="h-4 w-4" />Add</Btn>
      </div>
      <div className="flex gap-2 px-4 py-2 border-b border-slate-100">
        <input data-testid="redirect-search" className={`${inputCls} max-w-xs`} placeholder="Search paths…" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        <Select testId="redirect-problem" value={problem} onChange={(v) => { setProblem(v); setPage(1); }} className="w-44" options={[{ value: "", label: "All redirects" }, { value: "any", label: "With problems" }]} />
      </div>
      {!d ? <SkelRows n={3} /> : d.rows.length === 0 ? <Empty title="No redirects" testId="redirects-empty" /> : (
        <>
          <div className="divide-y divide-slate-100">
            {d.rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm" data-testid={`redirect-row-${r.id}`}>
                <code className="text-xs text-slate-700">{r.from_path}</code><span className="text-slate-400">→</span><code className="text-xs text-[#0D47A1]">{r.to_path}</code>
                <Sev s="info">{r.type || "301"}</Sev>
                {r.source && r.source !== "manual" && <span className="text-[11px] text-slate-400">{r.source.replace(/_/g, " ")}</span>}
                <span className="text-[11px] text-slate-400">{r.hits || 0} hits</span>
                {r.problems.map((p) => <Sev key={p.code} s={p.severity}>{p.message}</Sev>)}
                <button onClick={() => del(r.id)} className="ml-auto text-rose-500 hover:bg-rose-50 h-7 w-7 rounded-md flex items-center justify-center" data-testid={`redirect-delete-${r.id}`}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
          <Pager page={d.page} pages={d.pages} total={d.total} onPage={setPage} testId="redirects-pager" />
        </>
      )}
    </Card>
  );
}
