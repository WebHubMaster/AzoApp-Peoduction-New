import React, { useCallback, useEffect, useState } from "react";
import { Gift, Sparkles, Smartphone, BarChart3 } from "lucide-react";
import api from "@/lib/api";
import { cn } from "@/components/growth/admin/kit";
import ReferralTab from "@/components/growth/admin/ReferralTab";
import CashbackTab from "@/components/growth/admin/CashbackTab";
import PwaTab from "@/components/growth/admin/PwaTab";
import InsightsTab from "@/components/growth/admin/InsightsTab";

const TABS = [
  { k: "referral", label: "Referral", icon: Gift },
  { k: "cashback", label: "Cashback & Scratch", icon: Sparkles },
  { k: "pwa", label: "PWA / Install", icon: Smartphone },
  { k: "insights", label: "Insights", icon: BarChart3 },
];

export default function GrowthCenter() {
  const [tab, setTab] = useState("referral");
  const [cfg, setCfg] = useState(null);
  const load = useCallback(() => {
    api.get("/admin/growth/config").then((r) => setCfg(r.data)).catch(() => setCfg({}));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="growth-center" className="w-full">
      {/* header */}
      <div className="mb-5">
        <h1 className="font-heading font-black text-2xl sm:text-3xl text-slate-900 dark:text-white">Customer Growth &amp; Engagement</h1>
        <p className="text-sm text-slate-500 mt-1 max-w-3xl">Referral, cashback &amp; scratch cards, app installation and engagement analytics — all dynamic and admin-controlled.</p>
      </div>

      {/* tab nav */}
      <div className="flex gap-1 overflow-x-auto pb-px mb-6 border-b border-slate-200 dark:border-slate-800 -mx-1 px-1">
        {TABS.map((t) => {
          const active = tab === t.k;
          return (
            <button key={t.k} data-testid={`growth-tab-${t.k}`} onClick={() => setTab(t.k)}
              className={cn(
                "shrink-0 px-4 py-2.5 text-sm font-semibold inline-flex items-center gap-2 border-b-2 -mb-px rounded-t-lg transition-all",
                active
                  ? "border-primary-600 text-primary-700 dark:text-primary-300 bg-primary-50/60 dark:bg-primary-900/20"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/50"
              )}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {!cfg ? (
        <div className="p-16 text-center text-slate-400">Loading…</div>
      ) : (
        <>
          {tab === "referral" && <ReferralTab cfg={cfg.referral || {}} onSaved={load} />}
          {tab === "cashback" && <CashbackTab cfg={cfg.cashback || {}} onSaved={load} />}
          {tab === "pwa" && <PwaTab cfg={cfg.pwa || {}} onSaved={load} />}
          {tab === "insights" && <InsightsTab />}
        </>
      )}
    </div>
  );
}
