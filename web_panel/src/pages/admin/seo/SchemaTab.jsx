import { useEffect, useState } from "react";
import { toast } from "sonner";
import api from "@/lib/api";
import { Card, Stat, SkelGrid, Sev, Btn, Skel, errMsg, TYPE_LABEL, useDebounced, inputCls } from "./seoUi";

export default function SchemaTab() {
  const [s, setS] = useState(null);
  const [pages, setPages] = useState([]);
  const [q, setQ] = useState("");
  const dq = useDebounced(q);
  const [key, setKey] = useState("static:home");
  const [pv, setPv] = useState(null);
  useEffect(() => { api.get("/admin/seo/schema/summary").then((r) => setS(r.data)).catch((e) => toast.error(errMsg(e))); }, []);
  useEffect(() => { api.get("/admin/seo/pages", { params: { q: dq, page_size: 50, sort: "name", status: "published" } }).then((r) => setPages(r.data.rows)).catch(() => {}); }, [dq]);
  useEffect(() => { setPv(null); api.get("/admin/seo/schema", { params: { key } }).then((r) => setPv(r.data)).catch((e) => toast.error(errMsg(e))); }, [key]);
  if (!s) return <SkelGrid />;
  return (
    <div className="space-y-5" data-testid="seo-schema">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat testId="schema-types" label="Schema types in use" value={Object.keys(s.types).length} hint={Object.entries(s.types).map(([k, v]) => `${k} ${v}`).join(" · ")} source="db" />
        <Stat testId="schema-errors" label="Validation errors" value={s.errors} tone={s.errors ? "red" : "green"} source="audit" />
        <Stat testId="schema-warnings" label="Warnings" value={s.warnings} tone={s.warnings ? "amber" : "green"} hint="Missing recommended properties" source="audit" />
        <Stat testId="schema-locations" label="LocalBusiness locations" value={s.organization.business_locations.length} hint="Only verified physical offices" source="db" />
      </div>
      <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 text-xs text-slate-600">
        JSON-LD is generated server-side from real records — one block per type per page, so modules cannot emit duplicate or conflicting markup. Ratings appear only when verified booking reviews exist; prices only on city pages where they are set. Rich results are never guaranteed.
      </div>
      <div className="grid lg:grid-cols-5 gap-5">
        <Card className="lg:col-span-2" title="Preview a page" testId="schema-picker">
          <input data-testid="schema-search" className={inputCls} placeholder="Search published pages…" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="mt-3 max-h-[420px] overflow-y-auto divide-y divide-slate-100 rounded-lg ring-1 ring-slate-200">
            {pages.map((p) => (
              <button key={p.key} onClick={() => setKey(p.key)} data-testid={`schema-pick-${p.key}`} className={`w-full text-left px-3 py-2 text-sm hover:bg-slate-50 ${key === p.key ? "bg-blue-50/60" : ""}`}>
                <span className="text-slate-800">{p.name}</span> <span className="text-[11px] text-slate-400">{TYPE_LABEL[p.type]}</span>
              </button>
            ))}
          </div>
        </Card>
        <Card className="lg:col-span-3" title={pv ? pv.name : "Schema preview"} subtitle={pv?.path} testId="schema-preview">
          {!pv ? <Skel className="h-72" /> : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">{pv.validation.map((v, i) => <span key={i} className="inline-flex items-center gap-1.5 text-sm"><b className="text-slate-800">{v.type}</b>{v.errors.length ? <Sev s="high">{v.errors.length} error</Sev> : <Sev s="ok">valid</Sev>}{v.warnings.length > 0 && <Sev s="low">{v.warnings.length} warn</Sev>}</span>)}</div>
              {pv.validation.flatMap((v) => [...v.errors, ...v.warnings].map((m) => `${v.type}: ${m}`)).map((m) => <p key={m} className="text-xs text-slate-500">• {m}</p>)}
              <pre className="text-[11px] bg-slate-900 text-slate-100 rounded-lg p-3 overflow-auto max-h-[440px]" data-testid="schema-json">{JSON.stringify(pv.blocks, null, 2)}</pre>
              <a href={`https://validator.schema.org/`} target="_blank" rel="noreferrer"><Btn size="sm" variant="outline">Open Schema.org validator</Btn></a>
            </div>
          )}
        </Card>
      </div>
      {s.rows.length > 0 && (
        <Card pad={false} title="Pages with schema warnings" testId="schema-issues">
          <div className="divide-y divide-slate-100">{s.rows.slice(0, 50).map((r) => (
            <button key={r.key} onClick={() => { setKey(r.key); window.scrollTo({ top: 0, behavior: "smooth" }); }} className="w-full text-left flex flex-wrap items-center gap-2 px-4 py-2 text-sm hover:bg-slate-50">
              <span className="text-slate-800">{r.name}</span>{r.errors > 0 && <Sev s="high">{r.errors} errors</Sev>}{r.warnings > 0 && <Sev s="low">{r.warnings} warnings</Sev>}<span className="text-xs text-slate-500 truncate">{r.messages.join(" · ")}</span>
            </button>
          ))}</div>
        </Card>
      )}
    </div>
  );
}
