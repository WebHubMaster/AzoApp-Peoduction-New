import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2, Search, Eye, ArrowLeft, RefreshCcw, Wrench, IndianRupee, MapPin, Phone,
  User as UserIcon, Calendar, CheckCircle2, XCircle, Clock, FileText, ArrowRightLeft,
  ShieldCheck, History, ExternalLink, Ban,
} from "lucide-react";
import api from "@/lib/api";
import { toast } from "sonner";
import PremiumSelect from "@/components/ui/PremiumSelect";
import PremiumDatePicker from "@/components/ui/PremiumDatePicker";

const STATUS_STYLE = {
  pending: { label: "Pending", cls: "bg-amber-100 text-amber-700" },
  under_review: { label: "Under Review", cls: "bg-sky-100 text-sky-700" },
  converted_to_service: { label: "Converted to Service", cls: "bg-violet-100 text-violet-700" },
  service_active: { label: "Service Active", cls: "bg-emerald-100 text-emerald-700" },
  rejected: { label: "Rejected", cls: "bg-rose-100 text-rose-700" },
  closed: { label: "Closed", cls: "bg-slate-200 text-slate-600" },
};
const rupee = (n) => "₹" + Number(n || 0).toLocaleString("en-IN");
const fmtDate = (d) => { try { return new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };

function StatusBadge({ s }) {
  const st = STATUS_STYLE[s] || STATUS_STYLE.pending;
  return <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap ${st.cls}`}>{st.label}</span>;
}

export default function CustomJobsAdmin() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [cats, setCats] = useState([]);
  const [selectedId, setSelectedId] = useState(null);

  const [filters, setFilters] = useState({ status: "", category_id: "", q: "", pincode: "", date_from: "", date_to: "" });

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
    api.get(`/custom-jobs?${params.toString()}`)
      .then((r) => setRows(r.data || [])).catch(() => {}).finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.get("/catalog/admin/categories").then((r) => setCats(r.data || [])).catch(() => {}); }, []);

  if (selectedId) {
    return <CustomJobDetail id={selectedId} onBack={() => { setSelectedId(null); load(); }}
      onConverted={() => load()} navigate={navigate} />;
  }

  const inp = "h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-800 text-sm outline-none focus:border-primary-500";

  return (
    <div data-testid="custom-jobs-admin">
      <div className="flex items-end justify-between gap-3 mb-4">
        <div>
          <h1 className="font-heading font-black text-2xl text-slate-900 dark:text-white flex items-center gap-2">
            <Wrench className="h-6 w-6 text-primary-600" /> Custom Job Requests
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Customer service requests awaiting review & conversion.</p>
        </div>
        <button onClick={load} className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-primary-700 flex items-center gap-1 text-sm">
          <RefreshCcw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {/* filters */}
      <div className="flex flex-wrap gap-2 mb-4" data-testid="cja-filters">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input className={`${inp} pl-9 w-full`} placeholder="Search ID, customer, work…"
            value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} />
        </div>
        <PremiumSelect className={`${inp} rounded-md`} value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}>
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="under_review">Under Review</option>
          <option value="converted_to_service">Converted</option>
          <option value="rejected">Rejected</option>
          <option value="closed">Closed</option>
        </PremiumSelect>
        <PremiumSelect className={`${inp} rounded-md`} value={filters.category_id} onChange={(e) => setFilters((f) => ({ ...f, category_id: e.target.value }))}>
          <option value="">All categories</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </PremiumSelect>
        <input className={`${inp} w-28`} placeholder="Pincode" value={filters.pincode}
          onChange={(e) => setFilters((f) => ({ ...f, pincode: e.target.value.replace(/\D/g, "").slice(0, 6) }))} />
        <PremiumDatePicker className={`${inp} rounded-md`} value={filters.date_from} onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))} placeholder="From date" />
        <PremiumDatePicker className={`${inp} rounded-md`} value={filters.date_to} onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))} placeholder="To date" />
      </div>

      {loading ? (
        <div className="py-20 grid place-items-center text-slate-400"><Loader2 className="h-7 w-7 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center text-slate-400" data-testid="cja-empty">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
          No custom job requests found.
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 text-xs uppercase tracking-wider">
                <tr>
                  {["Request ID", "Customer", "Mobile", "Category", "Work Name", "Budget", "Pincode", "Area", "Submitted", "Status", ""].map((h) => (
                    <th key={h} className="text-left font-semibold px-3 py-2.5 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.map((r) => (
                  <tr key={r.id} data-testid={`cja-row-${r.request_id}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2.5 font-mono text-xs font-semibold text-primary-700">{r.request_id}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">{r.customer_name_snapshot}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.customer_mobile_snapshot}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.category_name}</td>
                    <td className="px-3 py-2.5 text-slate-700 dark:text-slate-200 max-w-[180px] truncate" title={r.work_name}>{r.work_name}</td>
                    <td className="px-3 py-2.5 font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">{rupee(r.expected_budget)}</td>
                    <td className="px-3 py-2.5 text-slate-500">{r.pincode}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap">{r.city || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-500 whitespace-nowrap text-xs">{fmtDate(r.created_at)}</td>
                    <td className="px-3 py-2.5"><StatusBadge s={r.display_status || r.status} /></td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => setSelectedId(r.id)} data-testid={`cja-view-${r.request_id}`}
                        className="h-8 px-3 rounded-lg bg-primary-50 text-primary-700 hover:bg-primary-100 font-semibold text-xs flex items-center gap-1">
                        <Eye className="h-3.5 w-3.5" /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================= DETAIL =============== */
function CustomJobDetail({ id, onBack, onConverted, navigate }) {
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/custom-jobs/${id}`).then((r) => setJob(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (status) => {
    setBusy(status);
    try {
      await api.patch(`/custom-jobs/${id}/status`, { status });
      toast.success("Status updated");
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    setBusy("");
  };

  const switchToService = async () => {
    setBusy("convert");
    try {
      const { data } = await api.post(`/custom-jobs/${id}/convert`);
      if (data.already_converted) toast.info("Already converted — opening the linked service.");
      else toast.success("Draft service created! Configure the details and activate it.");
      onConverted?.();
      navigate(`/admin?tab=services&editService=${data.service_id}`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Conversion failed"); }
    setBusy("");
  };

  if (loading || !job) return <div className="py-20 grid place-items-center text-slate-400"><Loader2 className="h-7 w-7 animate-spin" /></div>;

  const converted = !!job.converted_service_id;

  return (
    <div className="max-w-4xl" data-testid="cja-detail">
      <button onClick={onBack} className="mb-4 text-sm text-slate-500 hover:text-primary-700 flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> Back to list
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-heading font-black text-2xl text-slate-900 dark:text-white">{job.work_name}</h1>
            <StatusBadge s={job.display_status || job.status} />
          </div>
          <p className="text-slate-400 text-sm font-mono mt-1">{job.request_id} · Submitted {fmtDate(job.created_at)}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Customer Details" icon={UserIcon}>
          <Row k="Name" v={job.customer_name_snapshot} />
          <Row k="Mobile" v={<span className="flex items-center gap-1">{job.customer_mobile_snapshot} <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /></span>} />
          <Row k="Customer ID" v={<span className="font-mono text-xs">{job.customer_id}</span>} />
        </Card>
        <Card title="Work Details" icon={Wrench}>
          <Row k="Category" v={job.category_name} />
          <Row k="Work Name" v={job.work_name} />
          <Row k="Customer Budget" v={<span className="font-semibold">{rupee(job.expected_budget)}</span>} />
        </Card>
        <Card title="Location" icon={MapPin}>
          <Row k="Pincode" v={job.pincode} />
          <Row k="City" v={job.city || "—"} />
          <Row k="State" v={job.state || "—"} />
          <Row k="Service Area" v={<span className="text-emerald-600 font-medium flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Available</span>} />
        </Card>
        <Card title="System Information" icon={FileText}>
          <Row k="Created" v={fmtDate(job.created_at)} />
          <Row k="Updated" v={fmtDate(job.updated_at)} />
          <Row k="Source" v="Custom Job Request" />
          {converted && <Row k="Service ID" v={<span className="font-mono text-xs">{job.converted_service_id}</span>} />}
        </Card>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Description</p>
        <p className="text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap">{job.description}</p>
      </div>

      {/* actions */}
      <div className="mt-5 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Actions</p>
        {converted ? (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm text-violet-700 bg-violet-50 px-3 py-2 rounded-lg">
              <ArrowRightLeft className="h-4 w-4" /> Converted to service
              {job.service?.status === "active" ? " · Active" : " · Draft"}
            </div>
            <button onClick={() => navigate(`/admin?tab=services&editService=${job.converted_service_id}`)} data-testid="cja-view-service"
              className="h-11 px-5 rounded-xl bg-primary-700 hover:bg-primary-800 text-white font-semibold flex items-center gap-2">
              <ExternalLink className="h-4 w-4" /> View / Edit Service
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2.5">
            <button onClick={switchToService} disabled={busy === "convert"} data-testid="cja-switch-to-service"
              className="h-11 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold flex items-center gap-2 shadow-lg">
              {busy === "convert" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
              Switch to New Service
            </button>
            <button onClick={() => setStatus("under_review")} disabled={busy || job.status === "under_review"}
              className="h-11 px-4 rounded-xl border border-sky-200 text-sky-700 hover:bg-sky-50 disabled:opacity-40 font-semibold flex items-center gap-1.5">
              <Clock className="h-4 w-4" /> Mark Under Review
            </button>
            <button onClick={() => setStatus("rejected")} disabled={!!busy}
              className="h-11 px-4 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 disabled:opacity-40 font-semibold flex items-center gap-1.5">
              <XCircle className="h-4 w-4" /> Reject
            </button>
            <button onClick={() => setStatus("closed")} disabled={!!busy}
              className="h-11 px-4 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 font-semibold flex items-center gap-1.5">
              <Ban className="h-4 w-4" /> Close
            </button>
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-3">
          Note: the customer budget ({rupee(job.expected_budget)}) is only a suggestion. Set the real price in the Service editor after converting.
        </p>
      </div>

      {/* audit trail */}
      <div className="mt-5 rounded-2xl border border-slate-200 dark:border-slate-700 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5"><History className="h-4 w-4" /> Audit Trail</p>
        <ol className="space-y-2.5">
          {(job.audit || []).slice().reverse().map((a, i) => (
            <li key={i} className="flex items-start gap-3 text-sm">
              <span className="h-2 w-2 rounded-full bg-primary-500 mt-1.5 shrink-0" />
              <div className="min-w-0">
                <span className="font-semibold text-slate-700 dark:text-slate-200 capitalize">{(a.action || "").replace(/_/g, " ")}</span>
                {a.by_name && <span className="text-slate-400"> · {a.by_name}</span>}
                <span className="text-slate-400 text-xs block">{fmtDate(a.at)}{a.note ? ` — ${a.note}` : ""}</span>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Card({ title, icon: Icon, children }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-900">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
        {Icon && <Icon className="h-4 w-4" />} {title}
      </p>
      <div>{children}</div>
    </div>
  );
}
function Row({ k, v }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 text-sm">
      <span className="text-slate-400 shrink-0">{k}</span>
      <span className="text-slate-700 dark:text-slate-200 font-medium text-right break-words">{v}</span>
    </div>
  );
}
