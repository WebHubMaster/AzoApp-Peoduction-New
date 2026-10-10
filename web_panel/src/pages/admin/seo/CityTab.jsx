import { useEffect, useState } from "react";
import { toast } from "sonner";
import { MapPin, Pencil, Plus, ChevronRight, Trash2 } from "lucide-react";
import api from "@/lib/api";
import { Card, Btn, Pill, SkelRows, Empty, Sev, errMsg } from "./seoUi";
import PageEditor from "./PageEditor";
import PagesTable from "./PagesTable";

export default function CityTab() {
  const [d, setD] = useState(null);
  const [edit, setEdit] = useState(null);
  const [openCity, setOpenCity] = useState(null);
  const load = () => api.get("/admin/seo/cities").then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-5" data-testid="seo-cities">
      <div className="rounded-xl bg-white border border-slate-200 px-4 py-3 text-xs text-slate-600 leading-relaxed">
        Cities come from your <b>active Service Areas</b>. A city page is indexable only when at least one published service is priced there (Price Manager).
        City-service pages are <b>opt-in</b>: they can be published only for services genuinely available in that city and with ≥ {d?.min_unique_cs || 300} characters of unique local content — no auto-generated doorway pages.
      </div>
      <Card pad={false} title="Served cities & local landing pages" subtitle={d ? `${d.rows.filter((r) => r.served).length} served · ${d.rows.filter((r) => r.indexable).length} indexable` : ""} testId="cities-card">
        {!d ? <SkelRows n={4} /> : d.rows.length === 0 ? <Empty testId="cities-empty" title="No served cities" text="Add active service areas to create city pages." /> : (
          <div className="divide-y divide-slate-100">
            {d.rows.map((c) => (
              <div key={c.key} data-testid={`city-row-${c.slug}`}>
                <div className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <button onClick={() => setOpenCity(openCity === c.slug ? null : c.slug)} className="flex items-center gap-2 min-w-0 flex-1 text-left" data-testid={`city-expand-${c.slug}`}>
                    <ChevronRight className={`h-4 w-4 text-slate-400 transition-transform ${openCity === c.slug ? "rotate-90" : ""}`} />
                    <MapPin className="h-4 w-4 text-[#0D47A1]" />
                    <div className="min-w-0"><p className="font-medium text-slate-900">{c.name}{c.state ? <span className="text-slate-400 font-normal">, {c.state}</span> : null}</p>
                      <p className="text-[11px] text-slate-500 truncate">{c.path} · {c.areas.join(", ") || "—"} · {c.pincodes} pincodes · {c.partners} partners</p></div>
                  </button>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {c.served ? <Pill tone="green">Served</Pill> : <Pill tone="red">Not served</Pill>}
                    <Pill tone="blue">{c.available_services} services</Pill>
                    {c.indexable ? <Pill tone="green" testId={`city-indexable-${c.slug}`}>Indexable</Pill> : <Pill testId={`city-indexable-${c.slug}`}>noindex</Pill>}
                    <Pill tone={c.content_len >= d.min_unique ? "green" : "amber"}>{c.content_len} chars local</Pill>
                    <Pill>{c.city_pages_indexable}/{c.city_pages} service pages</Pill>
                    <Btn size="sm" variant="outline" onClick={() => setEdit(c.key)} data-testid={`city-edit-${c.slug}`}><Pencil className="h-3.5 w-3.5" />Edit</Btn>
                  </div>
                </div>
                {c.eligibility_reasons.length > 0 && <p className="px-11 pb-2 text-[11px] text-amber-700">{c.eligibility_reasons.join("; ")}</p>}
                {openCity === c.slug && c.served && <CityServices slug={c.slug} onEdit={setEdit} onChange={load} />}
              </div>
            ))}
          </div>
        )}
      </Card>
      <PagesTable types="city,city_service" title="Local page audit" showCity bulk={false} testId="local-table" />
      {edit && <PageEditor pageKey={edit} onClose={() => setEdit(null)} onSaved={load} />}
    </div>
  );
}

function CityServices({ slug, onEdit, onChange }) {
  const [d, setD] = useState(null);
  const load = () => api.get(`/admin/seo/cities/${slug}/services`).then((r) => setD(r.data)).catch((e) => toast.error(errMsg(e)));
  useEffect(() => { load(); }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps
  const create = async (sid) => {
    try { const { data } = await api.post("/admin/seo/city-pages", { city_slug: slug, service_id: sid }); toast.success("Draft page created — add local content, then publish"); load(); onChange(); onEdit(data.key); }
    catch (e) { toast.error(errMsg(e)); }
  };
  const remove = async (id) => {
    if (!window.confirm("Delete this city-service page? Published pages get a 301 to the city page.")) return;
    try { await api.delete(`/admin/seo/city-pages/${id}`); toast.success("Deleted"); load(); onChange(); } catch (e) { toast.error(errMsg(e)); }
  };
  if (!d) return <div className="px-11 pb-4"><SkelRows n={2} /></div>;
  return (
    <div className="px-4 sm:px-11 pb-4" data-testid={`city-services-${slug}`}>
      {d.available.length === 0 ? <p className="text-xs text-slate-500">No published service is priced in {d.city}. Configure the Price Manager first.</p> : (
        <div className="rounded-lg ring-1 ring-slate-200 divide-y divide-slate-100 bg-slate-50/50">
          {d.available.map((s) => {
            const pg = d.pages.find((x) => x.service_id === s.service_id);
            return (
              <div key={s.service_id} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                <span className="flex-1 min-w-[160px] text-slate-800">{s.name} <span className="text-[11px] text-slate-400">{s.category_name}</span></span>
                {pg ? (<>
                  <Pill tone={pg.status === "published" ? "green" : "slate"}>{pg.status}</Pill>
                  {pg.indexable ? <Pill tone="green">Indexable</Pill> : <span className="text-[11px] text-amber-700 max-w-[260px] truncate" title={pg.eligibility_reasons.join("; ")}>{pg.eligibility_reasons[0]}</span>}
                  <Btn size="sm" variant="outline" onClick={() => onEdit(pg.key)} data-testid={`cs-edit-${s.service_id}`}><Pencil className="h-3.5 w-3.5" />Edit</Btn>
                  <Btn size="sm" variant="danger" onClick={() => remove(pg.key.split(":")[1])} data-testid={`cs-delete-${s.service_id}`}><Trash2 className="h-3.5 w-3.5" /></Btn>
                </>) : <Btn size="sm" variant="outline" onClick={() => create(s.service_id)} data-testid={`cs-create-${s.service_id}`}><Plus className="h-3.5 w-3.5" />Create local page</Btn>}
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-slate-400 mt-2"><Sev s="info">note</Sev> Customers choosing a location in the site header see city pricing everywhere; these pages only control what search engines index.</p>
    </div>
  );
}
