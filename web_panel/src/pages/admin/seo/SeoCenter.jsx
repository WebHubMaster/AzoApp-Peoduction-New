import { lazy, Suspense, useState } from "react";
import { LayoutDashboard, Globe, Wrench, Layers, MapPin, Settings2, FileCode2, Braces, SearchCheck, ClipboardCheck } from "lucide-react";
import { SkelGrid } from "./seoUi";

const OverviewTab = lazy(() => import("./OverviewTab"));
const GlobalTab = lazy(() => import("./GlobalTab"));
const EntityTab = lazy(() => import("./EntityTab"));
const CityTab = lazy(() => import("./CityTab"));
const TechnicalTab = lazy(() => import("./TechnicalTab"));
const SitemapTab = lazy(() => import("./SitemapTab"));
const SchemaTab = lazy(() => import("./SchemaTab"));
const IndexingTab = lazy(() => import("./IndexingTab"));
const AuditTab = lazy(() => import("./AuditTab"));

export const SEO_TABS = [
  { key: "overview", label: "SEO Overview", icon: LayoutDashboard },
  { key: "global", label: "Global Meta", icon: Globe },
  { key: "services", label: "Service SEO", icon: Wrench },
  { key: "categories", label: "Category & Subcategory", icon: Layers },
  { key: "cities", label: "City & Local", icon: MapPin },
  { key: "technical", label: "Technical SEO", icon: Settings2 },
  { key: "sitemap", label: "Sitemap & Robots", icon: FileCode2 },
  { key: "schema", label: "Schema Markup", icon: Braces },
  { key: "indexing", label: "Indexing & Search Console", icon: SearchCheck },
  { key: "audit", label: "Audit & Recommendations", icon: ClipboardCheck },
];

export default function SeoCenter({ initialTab = "overview" }) {
  const [tab, setTab] = useState(initialTab);
  const go = (t) => { setTab(t); window.scrollTo({ top: 0, behavior: "smooth" }); };
  return (
    <div className="-m-1 sm:m-0 min-h-[70vh] bg-[#F5F7FA] rounded-xl" data-testid="seo-center">
      <div className="px-4 sm:px-6 pt-5 pb-3">
        <h1 className="text-xl font-bold text-slate-900 tracking-tight">SEO Management</h1>
        <p className="text-xs text-slate-500 mt-0.5">Metadata, local pages, sitemaps, structured data and indexing for every public page. Scores are rule-based and are not Google rankings.</p>
      </div>
      <nav className="sticky top-0 z-20 bg-[#F5F7FA]/95 backdrop-blur px-4 sm:px-6 border-b border-slate-200" aria-label="SEO sections">
        <div className="flex gap-1 overflow-x-auto no-scrollbar -mb-px">
          {SEO_TABS.map((t) => {
            const on = tab === t.key;
            return (
              <button key={t.key} onClick={() => go(t.key)} data-testid={`seo-tab-${t.key}`}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-2.5 text-[13px] font-semibold border-b-2 transition-colors ${on ? "border-[#0D47A1] text-[#0D47A1]" : "border-transparent text-slate-500 hover:text-slate-800"}`}>
                <t.icon className="h-4 w-4" />{t.label}
              </button>
            );
          })}
        </div>
      </nav>
      <div className="p-4 sm:p-6">
        <Suspense fallback={<SkelGrid />}>
          {tab === "overview" && <OverviewTab go={go} />}
          {tab === "global" && <GlobalTab />}
          {tab === "services" && <EntityTab kind="services" />}
          {tab === "categories" && <EntityTab kind="categories" />}
          {tab === "cities" && <CityTab />}
          {tab === "technical" && <TechnicalTab />}
          {tab === "sitemap" && <SitemapTab />}
          {tab === "schema" && <SchemaTab />}
          {tab === "indexing" && <IndexingTab />}
          {tab === "audit" && <AuditTab />}
        </Suspense>
      </div>
    </div>
  );
}
