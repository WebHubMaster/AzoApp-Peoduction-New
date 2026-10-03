import { useEffect, useState, useCallback, useMemo } from "react";
import { History } from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import { PageHeader, StatCards, ConfigAlert } from "./commission/HeaderStats";
import CategoryTable from "./commission/CategoryTable";
import CommissionDrawer from "./commission/CommissionDrawer";
import PolicySection from "./commission/PolicySection";
import CancellationReasons, { buildReasons } from "./commission/CancellationReasons";
import { exportCsv, fmtDate, round2 } from "./commission/shared";

const SORTERS = {
  name: (a, b) => a.name.localeCompare(b.name),
  status: (a, b) => Number(a.configured) - Number(b.configured) || a.name.localeCompare(b.name),
  services: (a, b) => b.service_count - a.service_count,
  partner: (a, b) => (b.commission?.partner_pct ?? -1) - (a.commission?.partner_pct ?? -1),
};

export default function CategoryCommissions() {
  const [data, setData] = useState(null);
  const [settings, setSettings] = useState(null);
  const [reasons, setReasons] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("status");
  const [drawer, setDrawer] = useState(null);

  const load = useCallback(() => api.get("/admin/category-commissions").then((r) => setData(r.data)).catch(() => toast.error("Could not load categories")), []);
  const loadSettings = useCallback(() => api.get("/admin/settings").then((r) => { setSettings(r.data || {}); setReasons(buildReasons(r.data)); }).catch(() => setSettings({})), []);
  useEffect(() => { load(); loadSettings(); }, [load, loadSettings]);

  const cats = useMemo(() => data?.categories || [], [data]);
  const rows = useMemo(() => cats.filter((c) =>
    c.name?.toLowerCase().includes(q.trim().toLowerCase()) &&
    (filter === "all" || (filter === "pending" ? !c.configured : c.configured))).sort(SORTERS[sort]), [cats, q, filter, sort]);
  const configured = cats.filter((c) => c.configured);
  const pending = cats.length - configured.length;
  const activePartner = configured.length ? round2(configured.reduce((s, c) => s + Number(c.commission.partner_pct), 0) / configured.length) : null;
  const lastUpdated = configured.map((c) => c.commission_updated_at).filter(Boolean).sort().pop();
  const counts = { all: cats.length, done: configured.length, pending };

  const configureNow = () => {
    setFilter("pending");
    const first = [...cats].sort(SORTERS.name).find((c) => !c.configured);
    if (first) setDrawer({ mode: "single", cat: first });
  };
  const onSaved = () => { setDrawer(null); load(); loadSettings(); };

  return (
    <div className="space-y-5 text-[14px]" data-testid="category-commission-page">
      <PageHeader onExport={() => { exportCsv(cats); toast.success("Export downloaded"); }} onSettings={() => setDrawer({ mode: "default" })} />
      {data ? <StatCards data={{ total: cats.length, configured: configured.length }} pending={pending} activePartner={activePartner} /> : <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-[86px] rounded-xl bg-white border border-[#E5E7EB] animate-pulse" />)}</div>}
      {data && <ConfigAlert pending={pending} onConfigure={configureNow} />}
      <CategoryTable rows={rows} loading={!data} onEdit={(c) => setDrawer({ mode: "single", cat: c })}
        toolbar={{ q, setQ, filter, setFilter, sort, setSort, counts, onBulk: () => setDrawer({ mode: "bulk" }) }} />
      {settings && <PolicySection defaults={settings.commission} categories={cats} onEditDefault={() => setDrawer({ mode: "default" })} />}
      {settings && <CancellationReasons reasons={reasons} setReasons={setReasons} />}
      <p className="flex items-center gap-1.5 text-[12px] text-slate-400 pb-2" data-testid="cc-last-updated">
        <History className="h-3.5 w-3.5" /> Last commission update: {fmtDate(lastUpdated)} · {configured.length} of {cats.length} categories configured
      </p>
      {drawer && settings && <CommissionDrawer {...drawer} categories={cats} defaults={settings.commission} onClose={() => setDrawer(null)} onSaved={onSaved} />}
    </div>
  );
}
