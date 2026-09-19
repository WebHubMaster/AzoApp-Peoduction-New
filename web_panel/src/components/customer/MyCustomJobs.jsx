import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Sparkles, Plus, ClipboardList, Loader2, MapPin, IndianRupee, ExternalLink, RefreshCcw } from "lucide-react";
import api from "@/lib/api";
import CustomJobWizard from "@/components/customer/CustomJobWizard";

const STATUS_STYLE = {
  pending: { label: "Pending", cls: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300" },
  under_review: { label: "Under Review", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
  converted_to_service: { label: "Converted to Service", cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300" },
  service_active: { label: "Service Created", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300" },
  rejected: { label: "Rejected", cls: "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300" },
  closed: { label: "Closed", cls: "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300" },
};

const rupee = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const fmtDate = (d) => { try { return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; } };

export default function MyCustomJobs() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wizardOpen, setWizardOpen] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.get("/custom-jobs/mine").then((r) => setRows(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div data-testid="my-custom-jobs">
      <div className="flex items-end justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h1 className="font-heading font-black text-2xl lg:text-3xl text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary-600" /> My Custom Job Requests
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">Track services you asked us to build for you.</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={load} className="h-10 w-10 rounded-xl border border-slate-200 dark:border-slate-700 grid place-items-center text-slate-500 hover:text-primary-700">
            <RefreshCcw className="h-4 w-4" />
          </button>
          <button onClick={() => setWizardOpen(true)} data-testid="mcj-new"
            className="h-10 px-4 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-semibold flex items-center gap-1 shadow-primarybtn">
            <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Request </span>Service
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-20 grid place-items-center text-slate-400"><Loader2 className="h-7 w-7 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center" data-testid="mcj-empty">
          <div className="h-16 w-16 rounded-2xl bg-primary-50 dark:bg-primary-900/25 grid place-items-center mx-auto mb-4">
            <ClipboardList className="h-8 w-8 text-primary-500" />
          </div>
          <h3 className="font-heading font-bold text-lg text-slate-800 dark:text-slate-100">No custom requests yet</h3>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-1 max-w-sm mx-auto">
            Can&apos;t find the service you need? Request a custom service and our team will build it for you.
          </p>
          <button onClick={() => setWizardOpen(true)}
            className="mt-5 h-11 px-6 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-semibold inline-flex items-center gap-2">
            <Plus className="h-4 w-4" /> Request a Custom Service
          </button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {rows.map((r) => {
            const st = STATUS_STYLE[r.display_status] || STATUS_STYLE[r.status] || STATUS_STYLE.pending;
            const liveService = r.display_status === "service_active" && r.service?.id;
            return (
              <div key={r.id} data-testid={`mcj-card-${r.request_id}`}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-heading font-bold text-slate-900 dark:text-white truncate">{r.work_name}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{r.request_id} · {r.category_name}</p>
                  </div>
                  <span className={`shrink-0 text-[11px] font-bold px-2.5 py-1 rounded-full ${st.cls}`}>{st.label}</span>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1"><IndianRupee className="h-3.5 w-3.5" /> {rupee(r.expected_budget)}</span>
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {r.pincode}</span>
                  <span>{fmtDate(r.created_at)}</span>
                </div>
                {liveService && (
                  <button onClick={() => navigate(`/service/${r.service.id}`)}
                    className="mt-3 w-full h-9 rounded-lg bg-emerald-50 dark:bg-emerald-900/25 text-emerald-700 dark:text-emerald-300 font-semibold text-sm flex items-center justify-center gap-1.5 hover:bg-emerald-100">
                    <ExternalLink className="h-3.5 w-3.5" /> View Service
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <CustomJobWizard open={wizardOpen} onClose={() => setWizardOpen(false)} onSubmitted={() => { setWizardOpen(false); setTimeout(load, 400); }} />
    </div>
  );
}
