import { useEffect, useState } from "react";
import api from "@/lib/api";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BarChart3, Database, PenLine } from "lucide-react";

export const HOME_STAT_FIELDS = [
  ["rating", "Service rating", "e.g. 4.8", "Hero · Trust bar · Footer"],
  ["reviews", "Reviews count", "e.g. 12K+", "Hero (under rating)"],
  ["jobs_done", "Jobs completed", "e.g. 50K+", "Hero"],
  ["verified_partners", "Verified pros", "e.g. 2,500+", "Hero · Trust bar · Footer"],
  ["partners", "Total partners", "e.g. 3,000+", "Partner CTA · Registration pages"],
  ["merchants", "Merchants", "e.g. 800+", "Merchant CTA"],
  ["customers", "Happy customers", "e.g. 1L+", "Registration pages"],
];

/* Admin control for storefront trust numbers: ON = live DB values, OFF = manual values. */
export default function HomeStatsControl({ compact = false }) {
  const [hs, setHs] = useState(null);
  const [live, setLive] = useState(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get("/admin/settings").then((r) => { const v = r.data?.home_stats || { live: true }; setHs(v); }).catch(() => setHs({ live: true }));
    api.get("/site/config").then((r) => setLive(r.data?.stats || null)).catch(() => {});
  }, []);
  if (!hs) return null;
  const isLive = hs.live !== false;
  const toggle = async (v) => {
    setHs((p) => ({ ...p, live: v }));
    await api.put("/admin/settings", { home_stats: { ...hs, live: v } });
    toast.success(v ? "Homepage stats: LIVE — real database numbers" : "Homepage stats: MANUAL — your custom values are shown");
  };
  const save = async () => {
    setSaving(true);
    const payload = { live: false };
    HOME_STAT_FIELDS.forEach(([k]) => { payload[k] = hs[k] ?? ""; });
    try { await api.put("/admin/settings", { home_stats: payload }); toast.success("Custom homepage stats saved"); } finally { setSaving(false); }
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6" data-testid="home-stats-settings">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span className="h-10 w-10 rounded-xl bg-primary-50 dark:bg-primary-900/30 text-primary-700 flex items-center justify-center shrink-0"><BarChart3 className="h-5 w-5" /></span>
          <div>
            <p className="font-heading font-bold text-lg text-slate-900 dark:text-white">Homepage Trust Stats</p>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Numbers shown in the hero, trust bar, footer &amp; CTA cards. <b>ON</b> = real data from the database · <b>OFF</b> = the manual values you enter below.</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-bold ${isLive ? "text-emerald-600" : "text-slate-400"}`} data-testid="home-stats-mode">{isLive ? "LIVE" : "MANUAL"}</span>
          <Switch data-testid="home-stats-live-toggle" checked={isLive} onCheckedChange={toggle} />
        </div>
      </div>

      <div className={`mt-5 grid ${compact ? "grid-cols-2" : "grid-cols-2 md:grid-cols-4"} gap-3`}>
        {HOME_STAT_FIELDS.map(([k, label, ph, where]) => (
          <div key={k} className={`rounded-xl border p-3 ${isLive ? "border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40" : "border-primary-100 dark:border-primary-900/40"}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 truncate">{label}</p>
            {isLive ? (
              <p className="font-heading font-extrabold text-xl text-slate-900 dark:text-white mt-1 tabular-nums inline-flex items-center gap-1.5" data-testid={`home-stat-live-${k}`}><Database className="h-3.5 w-3.5 text-emerald-500" />{live ? (live[k] ?? "—") : "…"}</p>
            ) : (
              <div className="relative mt-1"><PenLine className="h-3.5 w-3.5 text-primary-500 absolute left-2.5 top-1/2 -translate-y-1/2" /><Input data-testid={`home-stat-${k}`} value={hs[k] ?? ""} placeholder={ph} onChange={(e) => setHs((p) => ({ ...p, [k]: e.target.value }))} className="pl-8 h-9 font-semibold" /></div>
            )}
            <p className="text-[10px] text-slate-400 mt-1 truncate">{where}</p>
          </div>
        ))}
      </div>
      {!isLive && (
        <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
          <p className="text-[11px] text-slate-400">Type display-ready values like <b>50K+</b> or <b>12,000+</b> — shown exactly as entered. Leave a field blank to hide that stat.</p>
          <Button data-testid="home-stats-save" onClick={save} disabled={saving} className="bg-primary-700 hover:bg-primary-800">{saving ? "Saving…" : "Save custom stats"}</Button>
        </div>
      )}
    </div>
  );
}
