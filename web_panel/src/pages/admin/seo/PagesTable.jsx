import { useCallback, useEffect, useState } from "react";
import { Search, Pencil, Download, ExternalLink, Layers } from "lucide-react";
import { toast } from "sonner";
import api, { API } from "@/lib/api";
import { Card, Select, Btn, Pager, SkelRows, Empty, Sev, Pill, inputCls, useDebounced, fmtDate, TYPE_LABEL, errMsg, copy } from "./seoUi";
import PageEditor from "./PageEditor";
import BulkDialog from "./BulkDialog";

const META = [{ value: "", label: "Any metadata" }, { value: "custom", label: "Custom" }, { value: "auto", label: "Auto-generated" }, { value: "missing", label: "Missing" }, { value: "duplicate", label: "Duplicate" }];
const IDX = [{ value: "", label: "Any indexability" }, { value: "yes", label: "Indexable" }, { value: "no", label: "Not indexable" }];

const worst = (issues) => {
  for (const s of ["critical", "high", "medium", "low"]) if (issues.some((i) => i.severity === s)) return s;
  return null;
};

export default function PagesTable({ types, title, subtitle, bulk = true, showCity = false, testId = "pages-table", extraFilters, initial = {} }) {
  const [rows, setRows] = useState(null);
  const [meta, setMeta] = useState({ total: 0, pages: 1, issue_codes: {} });
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [f, setF] = useState({ type: "", category_id: "", meta: "", issue: "", indexable: "", city: "", ...initial });
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [sort, setSort] = useState("score");
  const [sel, setSel] = useState(new Set());
  const [open, setOpen] = useState(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [cats, setCats] = useState([]);

  useEffect(() => { api.get("/admin/seo/overview").then((r) => setCats(r.data.facets)).catch(() => {}); }, []);
  const params = { ...f, type: f.type || types, q: dq, page, page_size: size, sort };
  const load = useCallback(() => {
    setRows(null);
    api.get("/admin/seo/pages", { params }).then((r) => { setRows(r.data.rows); setMeta(r.data); })
      .catch((e) => { setRows([]); toast.error(errMsg(e, "Could not load pages")); });
  }, [JSON.stringify(params)]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(load, [load]);
  useEffect(() => { setPage(1); }, [dq, JSON.stringify(f), size]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (v) => setF((x) => ({ ...x, [k]: v }));
  const toggle = (k) => setSel((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const allOn = rows && rows.length > 0 && rows.every((r) => sel.has(r.key));
  const toggleAll = () => setSel((s) => { const n = new Set(s); rows.forEach((r) => (allOn ? n.delete(r.key) : n.add(r.key))); return n; });
  const exportCsv = async () => {
    try {
      const r = await api.get("/admin/seo/pages/export", { params: { ...f, type: f.type || types, q: dq }, responseType: "blob" });
      const url = URL.createObjectURL(r.data); const a = document.createElement("a"); a.href = url; a.download = "seo-report.csv"; a.click(); URL.revokeObjectURL(url);
    } catch (e) { toast.error(errMsg(e, "Export failed")); }
  };
  const typeOpts = (types || "").split(",").filter(Boolean);
  const issueOpts = [{ value: "", label: "Any issue" }, ...Object.entries(meta.issue_codes || {}).map(([value, label]) => ({ value, label }))];
  const origin = API.replace(/\/api$/, "");

  return (
    <Card pad={false} title={title} subtitle={subtitle} testId={testId}
      right={<>
        {bulk && sel.size > 0 && <Btn size="sm" onClick={() => setBulkOpen(true)} data-testid={`${testId}-bulk`}><Layers className="h-3.5 w-3.5" />Bulk edit ({sel.size})</Btn>}
        <Btn size="sm" variant="outline" onClick={exportCsv} data-testid={`${testId}-export`}><Download className="h-3.5 w-3.5" />Export</Btn>
      </>}>
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-slate-100">
        <div className="relative w-full sm:w-64"><Search className="h-4 w-4 text-slate-400 absolute left-2.5 top-2.5" /><input data-testid={`${testId}-search`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, URL or title…" className={`${inputCls} pl-8`} /></div>
        {typeOpts.length !== 1 && <Select testId={`${testId}-type`} value={f.type} onChange={set("type")} className="w-40" options={[{ value: "", label: "All types" }, ...(typeOpts.length ? typeOpts : Object.keys(TYPE_LABEL)).map((t) => ({ value: t, label: TYPE_LABEL[t] }))]} />}
        <Select testId={`${testId}-category`} value={f.category_id} onChange={set("category_id")} className="w-44" options={[{ value: "", label: "All categories" }, ...(cats.categories || []).map((c) => ({ value: c.id, label: c.name }))]} />
        {showCity && <Select testId={`${testId}-city`} value={f.city} onChange={set("city")} className="w-36" options={[{ value: "", label: "All cities" }, ...(cats.cities || []).map((c) => ({ value: c, label: c }))]} />}
        <Select testId={`${testId}-meta`} value={f.meta} onChange={set("meta")} className="w-40" options={META} />
        <Select testId={`${testId}-issue`} value={f.issue} onChange={set("issue")} className="w-48" options={issueOpts} />
        <Select testId={`${testId}-indexable`} value={f.indexable} onChange={set("indexable")} className="w-40" options={IDX} />
        {extraFilters}
        <Select testId={`${testId}-sort`} value={sort} onChange={setSort} className="w-40 ml-auto" options={[{ value: "score", label: "Lowest score first" }, { value: "-score", label: "Highest score first" }, { value: "name", label: "Name A–Z" }, { value: "-updated", label: "Recently updated" }]} />
      </div>
      {rows === null ? <SkelRows /> : rows.length === 0 ? <Empty testId={`${testId}-empty`} title="No pages match these filters" text="Clear a filter or search term to see more pages." /> : (
        <>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500"><tr>
                {bulk && <th className="w-10 px-4 py-2.5"><input type="checkbox" checked={allOn} onChange={toggleAll} data-testid={`${testId}-select-all`} /></th>}
                <th className="text-left px-3 py-2.5">Page</th><th className="text-left px-3">Type</th>{showCity && <th className="text-left px-3">City</th>}
                <th className="text-left px-3">Metadata</th><th className="text-left px-3">Indexable</th><th className="text-right px-3">Score</th>
                <th className="text-left px-3">Issues</th><th className="text-left px-3">Updated</th><th className="px-3" />
              </tr></thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const w = worst(r.issues);
                  const n = r.issues.filter((i) => i.severity !== "info").length;
                  return (
                    <tr key={r.key} className="hover:bg-slate-50/60 transition-colors" data-testid={`row-${r.key}`}>
                      {bulk && <td className="px-4"><input type="checkbox" checked={sel.has(r.key)} onChange={() => toggle(r.key)} data-testid={`select-${r.key}`} /></td>}
                      <td className="px-3 py-2.5 max-w-[340px]">
                        <button onClick={() => setOpen(r.key)} className="text-left w-full"><p className="font-medium text-slate-900 truncate hover:text-[#0D47A1]">{r.name}</p>
                          <p className="text-[11px] text-slate-500 truncate">{r.title}</p><p className="text-[11px] text-slate-400 font-mono truncate">{r.path}</p></button>
                      </td>
                      <td className="px-3"><span className="text-xs text-slate-600">{TYPE_LABEL[r.type]}</span>{r.category_name && r.type !== "category" && <p className="text-[11px] text-slate-400 truncate max-w-[140px]">{r.category_name}</p>}</td>
                      {showCity && <td className="px-3 text-xs text-slate-600">{r.city || "—"}</td>}
                      <td className="px-3"><Pill tone={r.meta_status === "custom" ? "blue" : r.meta_status === "missing" ? "red" : "slate"}>{r.meta_status === "auto" ? "Auto" : r.meta_status === "custom" ? "Custom" : "Missing"}</Pill>{r.duplicate && <Pill tone="amber">Duplicate</Pill>}</td>
                      <td className="px-3">{r.indexable ? <Pill tone="green">Yes</Pill> : <Pill tone="slate">{r.published ? (r.robots.includes("noindex") ? "noindex" : "No") : "Unpublished"}</Pill>}</td>
                      <td className="px-3 text-right"><span className={`font-semibold tabular-nums ${r.score >= 85 ? "text-emerald-600" : r.score >= 65 ? "text-amber-600" : "text-rose-600"}`}>{r.score}</span></td>
                      <td className="px-3">{n ? <span className="inline-flex items-center gap-1.5"><Sev s={w} /><span className="text-xs text-slate-500">{n}</span></span> : <span className="text-xs text-emerald-600">None</span>}</td>
                      <td className="px-3 text-[11px] text-slate-500 whitespace-nowrap">{r.updated_at ? fmtDate(r.updated_at).split(",")[0] : "—"}</td>
                      <td className="px-3 whitespace-nowrap text-right">
                        <button onClick={() => setOpen(r.key)} data-testid={`edit-${r.key}`} className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500 hover:text-[#0D47A1]" title="Edit SEO"><Pencil className="h-4 w-4" /></button>
                        <a href={origin + r.path} target="_blank" rel="noreferrer" className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-slate-100 text-slate-500" title="Open page"><ExternalLink className="h-4 w-4" /></a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="md:hidden divide-y divide-slate-100">
            {rows.map((r) => (
              <div key={r.key} className="p-4 flex gap-3" data-testid={`card-${r.key}`}>
                {bulk && <input type="checkbox" className="mt-1" checked={sel.has(r.key)} onChange={() => toggle(r.key)} />}
                <button className="flex-1 text-left min-w-0" onClick={() => setOpen(r.key)}>
                  <div className="flex items-center justify-between gap-2"><p className="font-medium text-slate-900 truncate">{r.name}</p><span className="text-sm font-bold tabular-nums">{r.score}</span></div>
                  <p className="text-[11px] text-slate-500 font-mono truncate">{r.path}</p>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap"><Pill>{TYPE_LABEL[r.type]}</Pill>{r.indexable ? <Pill tone="green">Indexable</Pill> : <Pill>Not indexable</Pill>}{worst(r.issues) && <Sev s={worst(r.issues)} />}</div>
                </button>
              </div>
            ))}
          </div>
          <Pager page={page} pages={meta.pages} total={meta.total} onPage={setPage} pageSize={size} onSize={setSize} testId={`${testId}-pager`} />
        </>
      )}
      {open && <PageEditor pageKey={open} onClose={() => setOpen(null)} onSaved={load} onCopy={(u) => copy(u)} />}
      {bulkOpen && <BulkDialog keys={[...sel]} onClose={() => setBulkOpen(false)} onDone={() => { setSel(new Set()); setBulkOpen(false); load(); }} />}
    </Card>
  );
}
