import PremiumSelect from "@/components/ui/PremiumSelect";
import { useEffect, useState, useCallback } from "react";
import api, { fmt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Trash2, Plus, ArrowUp, ArrowDown, CheckCircle2, XCircle, Award, Gift, AlertTriangle,
  Zap, Flame, Trophy, Banknote, RotateCcw, Download,
} from "lucide-react";
import { toast } from "sonner";
import { StatusTabs } from "@/pages/admin/adminSections";

const Card = ({ children, className = "" }) => (
  <div className={`bg-white rounded-xl border border-slate-200 p-4 ${className}`}>{children}</div>
);
const Empty = ({ text }) => <div className="text-slate-400 text-sm text-center py-8">{text}</div>;

// ============================================================ VERIFICATION WORKFLOW CONFIG
export function VerificationWorkflowConfig() {
  const [stages, setStages] = useState([]);
  const load = useCallback(() => api.get("/admin/partner/verification-config").then((r) => setStages(r.data.stages)), []);
  useEffect(() => { load(); }, [load]);
  const upd = (i, patch) => setStages(stages.map((s, x) => (x === i ? { ...s, ...patch } : s)));
  const move = (i, dir) => {
    const j = i + dir; if (j < 0 || j >= stages.length) return;
    const copy = [...stages]; [copy[i], copy[j]] = [copy[j], copy[i]]; setStages(copy);
  };
  const add = () => setStages([...stages, { key: `stage_${Date.now()}`, name: "New Stage", mandatory: false, requires_approval: true, auto_approve: false, documents: [] }]);
  const remove = (i) => setStages(stages.filter((_, x) => x !== i));
  const save = async () => {
    await api.put("/admin/partner/verification-config", { stages });
    toast.success("Workflow saved"); load();
  };
  return (
    <div className="max-w-3xl">
      <p className="text-sm text-slate-500 mb-4">Configure the dynamic verification pipeline. Reorder, add/remove stages, mark mandatory or auto-approve.</p>
      <div className="space-y-2" data-testid="workflow-stages">
        {stages.map((s, i) => (
          <Card key={i} className="flex items-center gap-3 flex-wrap">
            <div className="flex flex-col">
              <button onClick={() => move(i, -1)} className="text-slate-400 hover:text-slate-700"><ArrowUp className="h-4 w-4" /></button>
              <button onClick={() => move(i, 1)} className="text-slate-400 hover:text-slate-700"><ArrowDown className="h-4 w-4" /></button>
            </div>
            <div className="flex-1 min-w-[180px]">
              <Input value={s.name} onChange={(e) => upd(i, { name: e.target.value })} data-testid={`stage-name-${i}`} />
              <Input className="mt-1 text-xs" placeholder="Required documents (comma separated)"
                value={(s.documents || []).join(", ")}
                onChange={(e) => upd(i, { documents: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} />
            </div>
            <label className="flex items-center gap-1 text-xs">Mandatory <Switch checked={!!s.mandatory} onCheckedChange={(v) => upd(i, { mandatory: v })} /></label>
            <label className="flex items-center gap-1 text-xs">Needs approval <Switch checked={!!s.requires_approval} onCheckedChange={(v) => upd(i, { requires_approval: v })} /></label>
            <label className="flex items-center gap-1 text-xs">Auto <Switch checked={!!s.auto_approve} onCheckedChange={(v) => upd(i, { auto_approve: v })} /></label>
            <button onClick={() => remove(i)} className="text-red-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
          </Card>
        ))}
      </div>
      <div className="flex gap-2 mt-4">
        <Button variant="outline" onClick={add} data-testid="add-stage-btn"><Plus className="h-4 w-4 mr-1" /> Add Stage</Button>
        <Button onClick={save} data-testid="save-workflow-btn" className="bg-primary-700 hover:bg-primary-800">Save Workflow</Button>
      </div>
    </div>
  );
}

// ============================================================ PARTNER VERIFICATION REVIEW
export function PartnerVerificationReview() {
  const [partners, setPartners] = useState([]);
  const [sel, setSel] = useState(null);
  const [view, setView] = useState(null);
  const [reject, setReject] = useState(null);
  const [reason, setReason] = useState("");
  useEffect(() => { api.get("/admin/users?role=partner").then((r) => setPartners(r.data)); }, []);
  const open = (p) => { setSel(p); api.get(`/admin/partner/${p.id}/verification`).then((r) => setView(r.data)); };
  const act = async (stageKey, action, rsn = "") => {
    await api.post(`/admin/partner/${sel.id}/verification/${stageKey}/action`, { action, reason: rsn });
    toast.success(`Stage ${action}d`);
    api.get(`/admin/partner/${sel.id}/verification`).then((r) => setView(r.data));
    setReject(null); setReason("");
  };
  return (
    <div className="grid md:grid-cols-3 gap-4">
      <Card className="md:col-span-1">
        <p className="font-semibold mb-2">Partners</p>
        <div className="space-y-1 max-h-[70vh] overflow-y-auto" data-testid="admin-partner-list">
          {partners.map((p) => (
            <button key={p.id} data-testid={`partner-row-${p.id}`} onClick={() => open(p)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm ${sel?.id === p.id ? "bg-primary-50 text-primary-700" : "hover:bg-slate-50"}`}>
              <span className="font-medium">{p.name}</span>
              <span className="block text-xs text-slate-400">{p.phone} · KYC {p.kyc_status}</span>
            </button>
          ))}
        </div>
      </Card>
      <Card className="md:col-span-2">
        {!view ? <Empty text="Select a partner to review verification" /> : (
          <>
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold">{sel.name}</p>
              <Badge className={view.overall === "approved" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-amber-100 text-amber-700 border-0"}>{view.overall}</Badge>
            </div>
            <div className="space-y-2" data-testid="admin-verification-stages">
              {view.stages.map((s) => (
                <div key={s.key} className="border border-slate-200 rounded-lg p-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <p className="font-medium text-sm">{s.name}{s.mandatory && <span className="text-red-400">*</span>}</p>
                      <p className="text-xs text-slate-400">{s.status}{s.reason && ` · ${s.reason}`}</p>
                      {(s.documents || []).length > 0 && <p className="text-xs text-slate-500 mt-1">Docs: {s.documents.map((d) => d.type || d).join(", ")}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="text-emerald-600" data-testid={`approve-${s.key}`}
                        onClick={() => act(s.key, "approve")} disabled={s.status === "approved"}>
                        <CheckCircle2 className="h-4 w-4" /></Button>
                      <Button size="sm" variant="outline" className="text-red-600" data-testid={`reject-${s.key}`}
                        onClick={() => setReject(s.key)}><XCircle className="h-4 w-4" /></Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Card>
      <Dialog open={!!reject} onOpenChange={() => setReject(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Reject stage</DialogTitle>
            <DialogDescription>Provide a reason the partner will see.</DialogDescription></DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" data-testid="reject-reason" />
          <DialogFooter><Button onClick={() => act(reject, "reject", reason)} className="bg-red-600 hover:bg-red-700" data-testid="reject-confirm">Reject</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================ SKILLS CATALOG MANAGER
export function SkillsCatalogManager() {
  const [skills, setSkills] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = useCallback(() => api.get("/admin/partner/skills").then((r) => setSkills(r.data)), []);
  useEffect(() => { load(); }, [load]);
  const blank = { name: "", category: "", min_experience: 0, requires_certificate: false, requires_assessment: false, passing_score: 70, max_attempts: 3, time_limit_min: 15, questions: [], levels: ["Beginner", "Intermediate", "Advanced", "Expert", "Master"], status: "active" };
  const del = async (id) => { await api.delete(`/admin/partner/skills/${id}`); toast.success("Deleted"); load(); };
  return (
    <div>
      <Button className="mb-4 bg-primary-700 hover:bg-primary-800" data-testid="new-skill-btn" onClick={() => setEdit(blank)}><Plus className="h-4 w-4 mr-1" /> New Skill</Button>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3" data-testid="skills-catalog">
        {skills.map((s) => (
          <Card key={s.id}>
            <div className="flex justify-between items-start">
              <div><p className="font-semibold">{s.name}</p><p className="text-xs text-slate-400">{s.category}</p></div>
              <div className="flex gap-1">
                <button onClick={() => setEdit(s)} className="text-primary-600 text-xs">Edit</button>
                <button onClick={() => del(s.id)} className="text-red-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {s.min_experience > 0 && <Badge variant="outline" className="text-xs">{s.min_experience}y exp</Badge>}
              {s.requires_certificate && <Badge variant="outline" className="text-xs">Cert</Badge>}
              {s.requires_assessment && <Badge className="bg-blue-50 text-blue-700 border-0 text-xs">Test ≥{s.passing_score}% ({s.questions?.length || 0}q)</Badge>}
            </div>
          </Card>
        ))}
      </div>
      <SkillEditDialog skill={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />
    </div>
  );
}

function SkillEditDialog({ skill, onClose, onDone }) {
  const [f, setF] = useState(skill);
  useEffect(() => { setF(skill); }, [skill]);
  if (!f) return null;
  const setQ = (qs) => setF({ ...f, questions: qs });
  const addQ = () => setQ([...(f.questions || []), { id: `q${Date.now()}`, q: "", options: ["", "", "", ""], answer_index: 0 }]);
  const save = async () => {
    if (!f.name) return toast.error("Name required");
    const payload = { ...f, min_experience: Number(f.min_experience), passing_score: Number(f.passing_score), max_attempts: Number(f.max_attempts) };
    if (f.id) await api.put(`/admin/partner/skills/${f.id}`, payload);
    else await api.post("/admin/partner/skills", payload);
    toast.success("Saved"); onDone();
  };
  return (
    <Dialog open={!!skill} onOpenChange={onClose}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{f.id ? "Edit" : "New"} Skill</DialogTitle>
          <DialogDescription>Define requirements & assessment questions that gate service eligibility.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Skill name" value={f.name} data-testid="skill-name-input" onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input placeholder="Category" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-xs">Min exp (y)</label><Input type="number" value={f.min_experience} onChange={(e) => setF({ ...f, min_experience: e.target.value })} /></div>
            <div><label className="text-xs">Pass %</label><Input type="number" value={f.passing_score} onChange={(e) => setF({ ...f, passing_score: e.target.value })} /></div>
            <div><label className="text-xs">Attempts</label><Input type="number" value={f.max_attempts} onChange={(e) => setF({ ...f, max_attempts: e.target.value })} /></div>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-sm">Requires certificate <Switch checked={f.requires_certificate} onCheckedChange={(v) => setF({ ...f, requires_certificate: v })} /></label>
            <label className="flex items-center gap-2 text-sm">Requires assessment <Switch checked={f.requires_assessment} data-testid="requires-assessment" onCheckedChange={(v) => setF({ ...f, requires_assessment: v })} /></label>
          </div>
          {f.requires_assessment && (
            <div className="border-t pt-3">
              <div className="flex justify-between items-center mb-2"><p className="font-medium text-sm">Questions</p>
                <Button size="sm" variant="outline" onClick={addQ} data-testid="add-question-btn">+ Question</Button></div>
              {(f.questions || []).map((q, qi) => (
                <div key={qi} className="border rounded-lg p-2 mb-2 space-y-1">
                  <Input placeholder="Question" value={q.q} onChange={(e) => setQ(f.questions.map((x, i) => i === qi ? { ...x, q: e.target.value } : x))} />
                  {q.options.map((opt, oi) => (
                    <div key={oi} className="flex items-center gap-2">
                      <input type="radio" checked={q.answer_index === oi} onChange={() => setQ(f.questions.map((x, i) => i === qi ? { ...x, answer_index: oi } : x))} />
                      <Input placeholder={`Option ${oi + 1}`} value={opt} onChange={(e) => setQ(f.questions.map((x, i) => i === qi ? { ...x, options: x.options.map((o, k) => k === oi ? e.target.value : o) } : x))} />
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter><Button onClick={save} data-testid="skill-catalog-save" className="bg-primary-700 hover:bg-primary-800">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================ CERTIFICATES REVIEW
export function CertificatesReview() {
  const [certs, setCerts] = useState([]);
  const load = useCallback(() => api.get("/admin/partner/certificates").then((r) => setCerts(r.data)), []);
  useEffect(() => { load(); }, [load]);
  const review = async (id, action) => { await api.post(`/admin/partner/certificates/${id}/review`, { action }); toast.success(action); load(); };
  return (
    <div className="space-y-2 max-w-3xl" data-testid="cert-review-list">
      {certs.length === 0 && <Empty text="No certificates submitted." />}
      {certs.map((c) => (
        <Card key={c.id} className="flex justify-between items-center">
          <div><p className="font-medium">{c.name}</p><p className="text-xs text-slate-400">{c.skill_name} · {c.status}</p></div>
          {c.status === "pending" && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="text-emerald-600" onClick={() => review(c.id, "verify")}>Verify</Button>
              <Button size="sm" variant="outline" className="text-red-600" onClick={() => review(c.id, "reject")}>Reject</Button>
            </div>
          )}
        </Card>
      ))}
    </div>
  );
}

// ============================================================ WITHDRAWALS QUEUE + WALLET CONFIG
const WdField = ({ k, v, cls = "" }) => (
  <div><span className="text-slate-400 text-xs">{k}</span><p className={`font-medium ${cls}`}>{v}</p></div>
);

export function WithdrawalsQueue() {
  const [items, setItems] = useState([]);
  const [reject, setReject] = useState(null);
  const [reason, setReason] = useState("");
  const [tab, setTab] = useState("pending");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewId, setViewId] = useState(null);
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  const load = useCallback(() => {
    api.get("/admin/partner/withdrawals").then((r) => setItems(r.data));
  }, []);
  useEffect(() => { load(); }, [load]);
  const act = async (id, action, rsn = "") => { await api.post(`/admin/partner/withdrawals/${id}/action`, { action, reason: rsn }); toast.success(action); setReject(null); setReason(""); load(); };
  const retry = async (id) => { try { const { data } = await api.post(`/admin/partner/withdrawals/${id}/retry`); toast.success(data.status === "completed" ? "Payout successful" : "Retry failed again"); load(); } catch (e) { toast.error(e?.response?.data?.detail || "Retry failed"); } };
  const exportCsv = () => {
    if (!dated.length) return toast.error("Nothing to export");
    const cols = ["partner_name", "amount", "fee", "net_amount", "method", "upi_id", "status", "requested_at"];
    const head = ["Partner", "Amount", "Fee", "Net", "Method", "UPI", "Status", "Requested"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [head.join(","), ...dated.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    const range = dateFrom || dateTo ? `_${dateFrom || "start"}_to_${dateTo || "today"}` : "";
    a.href = url; a.download = `withdrawals${range}.csv`; a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${dated.length} withdrawal(s)`);
  };
  useEffect(() => { setPage(1); }, [tab, q, dateFrom, dateTo]);
  const withinDate = (x) => {
    const d = String(x.requested_at || x.created_at || "").slice(0, 10);
    if (dateFrom && d && d < dateFrom) return false;
    if (dateTo && d && d > dateTo) return false;
    return true;
  };
  const dated = items.filter(withinDate);
  const counts = dated.reduce((m, x) => { m[x.status] = (m[x.status] || 0) + 1; return m; }, {});
  const tabs = [
    { key: "pending", label: "Pending", count: counts.pending || 0 },
    { key: "completed", label: "Approved", count: counts.completed || 0 },
    { key: "failed", label: "Payout Failed", count: counts.failed || 0 },
    { key: "rejected", label: "Rejected", count: counts.rejected || 0 },
    { key: "all", label: "All", count: dated.length },
  ];
  const shownAll = (() => {
    const ql = q.trim().toLowerCase();
    const searched = !ql ? dated : dated.filter((x) => [x.partner_name, x.upi_id, x.bank?.account_number, x.amount, x.method].some((v) => String(v || "").toLowerCase().includes(ql)));
    return tab === "all" ? searched : searched.filter((x) => x.status === tab);
  })();
  const pageCount = Math.max(1, Math.ceil(shownAll.length / pageSize));
  const cur = Math.min(page, pageCount);
  const shown = shownAll.slice((cur - 1) * pageSize, cur * pageSize);
  const sum = (arr) => arr.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const totalRequested = sum(dated);
  const totalApproved = sum(dated.filter((x) => x.status === "completed"));
  const totalPending = sum(dated.filter((x) => x.status === "pending"));
  const totalRejected = sum(dated.filter((x) => x.status === "rejected"));

  // Full-page detail view (sidebar stays visible) — opens like a Transaction.
  const viewObj = viewId ? items.find((x) => x.id === viewId) : null;
  if (viewObj) {
    const x = viewObj;
    const badge = x.status === "completed" ? "bg-emerald-100 text-emerald-700"
      : x.status === "failed" ? "bg-red-100 text-red-700"
        : x.status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700";
    const label = x.status === "completed" ? "Approved / Paid" : x.status === "failed" ? "Payout Failed" : x.status;
    const tl = [{ at: x.requested_at || x.created_at, label: "Withdrawal requested" }];
    if (x.status === "completed" && x.processed_at) tl.push({ at: x.processed_at, label: "Approved — payout initiated" });
    if (x.status === "rejected" && x.processed_at) tl.push({ at: x.processed_at, label: `Rejected${x.reason ? ` — ${x.reason}` : ""}`, fail: true });
    if (x.payout?.status === "failed") tl.push({ at: x.processed_at || x.created_at, label: `Payout failed${x.payout.failure_reason ? ` — ${x.payout.failure_reason}` : ""}`, fail: true });
    if (x.payout?.status === "processed" || x.payout?.status === "queued") tl.push({ at: x.retried_at || x.processed_at, label: `Payout ${x.payout.status}${x.payout.payout_id ? ` (${x.payout.payout_id})` : ""}` });
    if (x.retried_at && x.status === "completed") tl.push({ at: x.retried_at, label: "Payout retried successfully" });
    return (
      <div className="space-y-5" data-testid="wd-detail">
        <button onClick={() => setViewId(null)} data-testid="wd-back" className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white">&larr; Back to withdrawals</button>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="text-xs text-slate-400">Withdrawal request</p>
              <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">{x.partner_name}</h1>
              <p className="text-sm text-slate-500 mt-1">{String(x.requested_at || x.created_at || "").slice(0, 16).replace("T", " ")}</p>
            </div>
            <div className="text-right">
              <p className="font-heading font-extrabold text-3xl text-slate-900 dark:text-white">{fmt(x.amount)}</p>
              <span className={`inline-block mt-1 text-xs px-2.5 py-1 rounded-full capitalize ${badge}`}>{label}</span>
            </div>
          </div>
          <div className="flex gap-2 mt-4 flex-wrap">
            {x.status === "pending" && <>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" data-testid={`approve-wd-${x.id}`} onClick={() => { act(x.id, "approve"); setViewId(null); }}>Approve &amp; Pay</Button>
              <Button size="sm" variant="outline" className="text-red-600" onClick={() => setReject(x.id)}>Reject</Button>
            </>}
            {x.status === "failed" && <Button size="sm" className="bg-primary-700 hover:bg-primary-800 gap-1" data-testid={`retry-wd-${x.id}`} onClick={() => retry(x.id)}><RotateCcw className="h-3.5 w-3.5" /> Retry payout</Button>}
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h2 className="font-heading font-bold text-slate-900 dark:text-white">Payout Destination</h2>
            <WdField k="Method" v={(x.method || "").toUpperCase()} />
            {x.method === "upi"
              ? <WdField k="UPI ID" v={x.upi_id || "—"} />
              : <><WdField k="Bank" v={x.bank?.bank_name || "—"} /><WdField k="Account" v={x.bank?.account_number || "—"} /><WdField k="IFSC" v={x.bank?.ifsc || "—"} /></>}
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h2 className="font-heading font-bold text-slate-900 dark:text-white">Amount</h2>
            <WdField k="Requested" v={fmt(x.amount)} />
            <WdField k="Processing fee" v={fmt(x.fee)} />
            <WdField k="Net payable" v={fmt(x.net_amount)} cls="text-emerald-600" />
          </div>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
            <h2 className="font-heading font-bold text-slate-900 dark:text-white">Payout &amp; Gateway</h2>
            <WdField k="Payout ref" v={x.payout?.payout_id ? `${x.payout.payout_id}${x.payout.simulated ? " (sim)" : ""}` : "—"} />
            <WdField k="UTR" v={x.payout?.utr || "—"} />
            <WdField k="Payout status" v={x.payout?.status || "—"} cls={x.payout?.status === "failed" ? "text-red-600 capitalize" : "capitalize"} />
            {x.payout?.failure_reason && <WdField k="Failure reason" v={x.payout.failure_reason} cls="text-red-600" />}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <h2 className="font-heading font-bold mb-4 text-slate-900 dark:text-white">Timeline</h2>
          <div className="relative pl-6">
            <div className="absolute left-2 top-1 bottom-1 w-px bg-slate-200 dark:bg-slate-700" />
            <div className="space-y-4">
              {tl.map((e, i) => (
                <div key={i} className="relative" data-testid={`wd-timeline-${i}`}>
                  <span className={`absolute -left-[22px] top-0.5 h-4 w-4 rounded-full border-2 border-white dark:border-slate-900 ${e.fail ? "bg-red-500" : i === tl.length - 1 ? "bg-emerald-500" : "bg-primary-500"}`} />
                  <p className={`text-sm ${e.fail ? "text-red-600 font-medium" : "text-slate-700 dark:text-slate-200"}`}>{e.label}</p>
                  <p className="text-[11px] text-slate-400">{e.at ? String(e.at).slice(0, 16).replace("T", " ") : "—"}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Dialog open={!!reject} onOpenChange={() => setReject(null)}>
          <DialogContent><DialogHeader><DialogTitle>Reject withdrawal</DialogTitle>
            <DialogDescription>Amount is released back to the partner wallet.</DialogDescription></DialogHeader>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
            <DialogFooter><Button className="bg-red-600 hover:bg-red-700" onClick={() => { act(reject, "reject", reason); setViewId(null); }}>Reject</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="withdrawals-queue">
      <div>
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <p className="font-semibold">Withdrawal Requests</p>
          <div className="flex items-end gap-2 flex-wrap" data-testid="withdrawal-date-filter">
            <div><label className="text-[11px] text-slate-500 block">Search</label><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Partner / UPI / A/c / amount" className="h-9 w-56" data-testid="wd-search" /></div>
            <div><label className="text-[11px] text-slate-500 block">From</label><DatePicker value={dateFrom} onChange={(v) => setDateFrom(v)} placeholder="From date" /></div>
            <div><label className="text-[11px] text-slate-500 block">To</label><DatePicker value={dateTo} onChange={(v) => setDateTo(v)} placeholder="To date" /></div>
            {(dateFrom || dateTo || q) && <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => { setDateFrom(""); setDateTo(""); setQ(""); }}>Clear</Button>}
            <Button size="sm" variant="outline" className="gap-1" data-testid="wd-export" onClick={exportCsv}><Download className="h-4 w-4" /> Export</Button>
          </div>
        </div>
        {/* Advance total calculation summary */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4" data-testid="withdrawal-summary">
          <Card className="!p-3"><p className="text-[11px] uppercase tracking-wider text-slate-400">Total Requested</p><p className="text-lg font-bold text-slate-800 dark:text-white">{fmt(totalRequested)}</p><p className="text-[11px] text-slate-400">{dated.length} request{dated.length === 1 ? "" : "s"}</p></Card>
          <Card className="!p-3"><p className="text-[11px] uppercase tracking-wider text-amber-500">Pending</p><p className="text-lg font-bold text-amber-600">{fmt(totalPending)}</p><p className="text-[11px] text-slate-400">{counts.pending || 0} request{(counts.pending || 0) === 1 ? "" : "s"}</p></Card>
          <Card className="!p-3"><p className="text-[11px] uppercase tracking-wider text-emerald-500">Approved / Paid</p><p className="text-lg font-bold text-emerald-600">{fmt(totalApproved)}</p><p className="text-[11px] text-slate-400">{counts.completed || 0} paid</p></Card>
          <Card className="!p-3"><p className="text-[11px] uppercase tracking-wider text-red-500">Rejected</p><p className="text-lg font-bold text-red-600">{fmt(totalRejected)}</p><p className="text-[11px] text-slate-400">{counts.rejected || 0} rejected</p></Card>
        </div>
        <div className="mb-3"><StatusTabs tabs={tabs} value={tab} onChange={setTab} /></div>
        <div className="space-y-2" data-testid="admin-withdrawals">
          {shown.length === 0 && <Empty text="No withdrawal requests." />}
          {shown.map((x) => (
            <Card key={x.id} className="flex flex-col gap-2">
              <div className="flex justify-between items-center flex-wrap gap-2">
                <div>
                  <p className="font-medium">{x.partner_name} · {fmt(x.amount)} <span className="text-xs uppercase text-slate-400">{x.method}</span></p>
                  <p className="text-xs text-slate-400">{x.method === "upi" ? x.upi_id : x.bank?.account_number} · fee {fmt(x.fee)} · net {fmt(x.net_amount)} · {String(x.requested_at || x.created_at || "").slice(0, 10)}</p>
                </div>
                <div className="flex gap-2 items-center">
                  <Button size="sm" variant="outline" data-testid={`view-wd-${x.id}`} onClick={() => setViewId(x.id)}>View</Button>
                  {x.status === "pending" ? (
                    <>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" data-testid={`approve-wd-${x.id}`} onClick={() => act(x.id, "approve")}>Approve &amp; Pay</Button>
                      <Button size="sm" variant="outline" className="text-red-600" onClick={() => setReject(x.id)}>Reject</Button>
                    </>
                  ) : x.status === "failed" ? (
                    <>
                      <Badge className="bg-red-100 text-red-700 border-0">Payout failed</Badge>
                      <Button size="sm" className="bg-primary-700 hover:bg-primary-800 gap-1" data-testid={`retry-wd-${x.id}`} onClick={() => retry(x.id)}><RotateCcw className="h-3.5 w-3.5" /> Retry payout</Button>
                    </>
                  ) : <Badge className={x.status === "completed" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-red-100 text-red-700 border-0"}>{x.status === "completed" ? "Approved / Paid" : x.status}</Badge>}
                </div>
              </div>
              {viewId === x.id && (
                <div className="rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 p-3 text-xs grid grid-cols-2 sm:grid-cols-3 gap-2" data-testid={`wd-details-${x.id}`}>
                  <div><span className="text-slate-400">Partner</span><p className="font-medium">{x.partner_name}</p></div>
                  <div><span className="text-slate-400">Amount</span><p className="font-medium">{fmt(x.amount)}</p></div>
                  <div><span className="text-slate-400">Net payable</span><p className="font-medium">{fmt(x.net_amount)}</p></div>
                  <div><span className="text-slate-400">Method</span><p className="font-medium uppercase">{x.method}</p></div>
                  {x.method === "upi"
                    ? <div><span className="text-slate-400">UPI ID</span><p className="font-medium">{x.upi_id || "—"}</p></div>
                    : <><div><span className="text-slate-400">Bank / A/c</span><p className="font-medium">{x.bank?.bank_name} · {x.bank?.account_number}</p></div><div><span className="text-slate-400">IFSC</span><p className="font-medium">{x.bank?.ifsc || "—"}</p></div></>}
                  <div><span className="text-slate-400">Requested</span><p className="font-medium">{String(x.requested_at || x.created_at || "—").slice(0, 16).replace("T", " ")}</p></div>
                  <div><span className="text-slate-400">Status</span><p className="font-medium capitalize">{x.status}</p></div>
                  {x.reason && <div><span className="text-slate-400">Reject reason</span><p className="font-medium text-red-600">{x.reason}</p></div>}
                  {x.payout?.payout_id && <div><span className="text-slate-400">Payout ref</span><p className="font-medium">{x.payout.payout_id}{x.payout.simulated ? " (sim)" : ""}</p></div>}
                  {x.payout?.utr && <div><span className="text-slate-400">UTR</span><p className="font-medium">{x.payout.utr}</p></div>}
                  {x.payout?.status === "failed" && x.payout?.failure_reason && <div className="col-span-2"><span className="text-slate-400">Payout failure</span><p className="font-medium text-red-600">{x.payout.failure_reason}</p></div>}
                </div>
              )}
            </Card>
          ))}
        </div>
        {shownAll.length > pageSize && (
          <div className="flex items-center justify-between mt-4 text-sm text-slate-500" data-testid="wd-pagination">
            <span>{(cur - 1) * pageSize + 1}–{Math.min(cur * pageSize, shownAll.length)} of {shownAll.length}</span>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" disabled={cur <= 1} onClick={() => setPage(cur - 1)} data-testid="wd-prev">Prev</Button>
              <span className="px-2 font-medium text-slate-700 dark:text-slate-200">{cur} / {pageCount}</span>
              <Button size="sm" variant="outline" disabled={cur >= pageCount} onClick={() => setPage(cur + 1)} data-testid="wd-next">Next</Button>
            </div>
          </div>
        )}
      </div>
      <Dialog open={!!reject} onOpenChange={() => setReject(null)}>
        <DialogContent><DialogHeader><DialogTitle>Reject withdrawal</DialogTitle>
          <DialogDescription>Amount is released back to the partner wallet.</DialogDescription></DialogHeader>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Reason" />
          <DialogFooter><Button className="bg-red-600 hover:bg-red-700" onClick={() => act(reject, "reject", reason)}>Reject</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================ INCENTIVES MANAGER

// Payouts, Withdrawal Rules & Reward automation — surfaced inside the
// Integration Center (moved out of the Withdraw Requests screen).
export function WalletRewardConfig() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => { api.get("/admin/partner/wallet-config").then((r) => setCfg(r.data)); }, []);
  const saveCfg = async () => { await api.put("/admin/partner/wallet-config", cfg); toast.success("Config saved"); };
  if (!cfg) return <div className="py-16 text-center text-slate-400">Loading…</div>;
  return (
    <div className="max-w-3xl space-y-6" data-testid="wallet-reward-config">
      <Card>
        <p className="font-semibold mb-3">Withdrawal Rules</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div><label className="text-xs">Min</label><Input type="number" value={cfg.min_withdrawal} onChange={(e) => setCfg({ ...cfg, min_withdrawal: Number(e.target.value) })} /></div>
          <div><label className="text-xs">Max</label><Input type="number" value={cfg.max_withdrawal} onChange={(e) => setCfg({ ...cfg, max_withdrawal: Number(e.target.value) })} /></div>
          <div><label className="text-xs">Fee %</label><Input type="number" value={cfg.processing_fee_pct} onChange={(e) => setCfg({ ...cfg, processing_fee_pct: Number(e.target.value) })} /></div>
          <div><label className="text-xs">Fee flat</label><Input type="number" value={cfg.processing_fee_flat} onChange={(e) => setCfg({ ...cfg, processing_fee_flat: Number(e.target.value) })} /></div>
        </div>
        <div className="flex gap-4 mt-3">
          <label className="flex items-center gap-2 text-sm">UPI <Switch checked={cfg.upi_enabled} onCheckedChange={(v) => setCfg({ ...cfg, upi_enabled: v })} /></label>
          <label className="flex items-center gap-2 text-sm">Bank <Switch checked={cfg.bank_enabled} onCheckedChange={(v) => setCfg({ ...cfg, bank_enabled: v })} /></label>
          <Button size="sm" onClick={saveCfg} className="bg-primary-700 hover:bg-primary-800 ml-auto" data-testid="save-wallet-cfg">Save Rules</Button>
        </div>
      </Card>
      <Card>
        <p className="font-semibold mb-1">Auto Payout &amp; Streak Bonuses</p>
        <p className="text-xs text-slate-500 mb-3">Reward partners automatically to keep them active and competitive.</p>
        <div className="space-y-3">
          <label className="flex items-center justify-between gap-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <span><b>Auto Payout</b> — credit unlocked incentive bonuses to the wallet instantly, without admin approval.</span>
            <Switch data-testid="cfg-auto-payout" checked={cfg.auto_payout_enabled !== false} onCheckedChange={(v) => setCfg({ ...cfg, auto_payout_enabled: v })} />
          </label>
          <label className="flex items-center justify-between gap-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <span><b>Streak Bonuses</b> — reward consecutive 5★ jobs with an auto-increasing bonus.</span>
            <Switch data-testid="cfg-streak" checked={cfg.streak_enabled !== false} onCheckedChange={(v) => setCfg({ ...cfg, streak_enabled: v })} />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <div><label className="text-xs">Streak length (jobs)</label><Input type="number" value={cfg.streak_threshold ?? 5} onChange={(e) => setCfg({ ...cfg, streak_threshold: Number(e.target.value) })} /></div>
            <div><label className="text-xs">Base bonus ₹</label><Input type="number" value={cfg.streak_base_bonus ?? 100} onChange={(e) => setCfg({ ...cfg, streak_base_bonus: Number(e.target.value) })} /></div>
            <div><label className="text-xs">Increment ₹ / milestone</label><Input type="number" value={cfg.streak_increment ?? 50} onChange={(e) => setCfg({ ...cfg, streak_increment: Number(e.target.value) })} /></div>
          </div>
          <label className="flex items-center justify-between gap-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <span><b>Streak Freeze</b> — protect a partner&apos;s streak from ONE off-day per week.</span>
            <Switch data-testid="cfg-streak-freeze" checked={cfg.streak_freeze_enabled !== false} onCheckedChange={(v) => setCfg({ ...cfg, streak_freeze_enabled: v })} />
          </label>
          <label className="flex items-center justify-between gap-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <span><b>Streak Reminders</b> — daily evening nudge to partners on a live streak.</span>
            <Switch data-testid="cfg-streak-reminder" checked={cfg.streak_reminder_enabled !== false} onCheckedChange={(v) => setCfg({ ...cfg, streak_reminder_enabled: v })} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs">Freezes / week</label><Input type="number" value={cfg.streak_freeze_per_week ?? 1} onChange={(e) => setCfg({ ...cfg, streak_freeze_per_week: Number(e.target.value) })} /></div>
          </div>
          <label className="flex items-center justify-between gap-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <span><b>Weekly Leaderboard Rewards</b> — auto-bonus the previous week&apos;s top 3 partners.</span>
            <Switch data-testid="cfg-lb-rewards" checked={cfg.leaderboard_rewards_enabled !== false} onCheckedChange={(v) => setCfg({ ...cfg, leaderboard_rewards_enabled: v })} />
          </label>
          <div className="grid grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <label className="text-xs">Rank #{i + 1} reward ₹</label>
                <Input type="number" value={(cfg.leaderboard_reward_top3 || [500, 300, 200])[i] ?? 0}
                  onChange={(e) => {
                    const arr = [...(cfg.leaderboard_reward_top3 || [500, 300, 200])];
                    arr[i] = Number(e.target.value);
                    setCfg({ ...cfg, leaderboard_reward_top3: arr });
                  }} />
              </div>
            ))}
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={saveCfg} className="bg-primary-700 hover:bg-primary-800" data-testid="save-reward-cfg">Save Reward Settings</Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function IncentivesManager() {
  const [incs, setIncs] = useState([]);
  const [partners, setPartners] = useState([]);
  const [edit, setEdit] = useState(null);
  const [award, setAward] = useState(null);
  const load = useCallback(() => api.get("/admin/partner/incentives").then((r) => setIncs(r.data)), []);
  useEffect(() => { load(); api.get("/admin/users?role=partner").then((r) => setPartners(r.data)); }, [load]);
  const blank = { name: "", description: "", job_target: 0, revenue_target: 0, rating_min: 0, bonus_amount: 0, start_date: "", end_date: "", status: "active" };
  const del = async (id) => { await api.delete(`/admin/partner/incentives/${id}`); toast.success("Deleted"); load(); };
  const doAward = async (incId, pid) => {
    try { await api.post(`/admin/partner/incentives/${incId}/award/${pid}`); toast.success("Bonus awarded"); setAward(null); }
    catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  return (
    <div className="max-w-3xl">
      <Button className="mb-4 bg-primary-700 hover:bg-primary-800" data-testid="new-incentive-btn" onClick={() => setEdit(blank)}><Plus className="h-4 w-4 mr-1" /> New Incentive</Button>
      <div className="space-y-3" data-testid="incentives-admin">
        {incs.map((i) => (
          <Card key={i.id}>
            <div className="flex justify-between items-start">
              <div><p className="font-semibold flex items-center gap-2"><Gift className="h-4 w-4 text-primary-600" /> {i.name}</p>
                <p className="text-sm text-slate-500">{i.description}</p>
                <p className="text-xs text-slate-400 mt-1">Target {i.job_target} jobs · rating ≥ {i.rating_min} · bonus {fmt(i.bonus_amount)}</p></div>
              <div className="flex gap-2">
                <button onClick={() => setAward(i)} className="text-emerald-600 text-xs font-medium">Award</button>
                <button onClick={() => setEdit(i)} className="text-primary-600 text-xs">Edit</button>
                <button onClick={() => del(i.id)} className="text-red-400"><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>
          </Card>
        ))}
      </div>
      <IncentiveEditDialog inc={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />
      <Dialog open={!!award} onOpenChange={() => setAward(null)}>
        <DialogContent><DialogHeader><DialogTitle>Award: {award?.name}</DialogTitle>
          <DialogDescription>Select an eligible partner to credit the bonus.</DialogDescription></DialogHeader>
          <div className="space-y-1 max-h-[50vh] overflow-y-auto">
            {partners.map((p) => (
              <div key={p.id} className="flex justify-between items-center border rounded-lg px-3 py-2">
                <span className="text-sm">{p.name} <span className="text-xs text-slate-400">· {p.jobs_completed} jobs · {p.rating}★</span></span>
                <Button size="sm" variant="outline" onClick={() => doAward(award.id, p.id)}>Award {fmt(award?.bonus_amount)}</Button>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function IncentiveEditDialog({ inc, onClose, onDone }) {
  const [f, setF] = useState(inc);
  useEffect(() => { setF(inc); }, [inc]);
  if (!f) return null;
  const save = async () => {
    if (!f.name) return toast.error("Name required");
    const p = { ...f, job_target: Number(f.job_target), revenue_target: Number(f.revenue_target), rating_min: Number(f.rating_min), bonus_amount: Number(f.bonus_amount) };
    if (f.id) await api.put(`/admin/partner/incentives/${f.id}`, p); else await api.post("/admin/partner/incentives", p);
    toast.success("Saved"); onDone();
  };
  return (
    <Dialog open={!!inc} onOpenChange={onClose}>
      <DialogContent><DialogHeader><DialogTitle>{f.id ? "Edit" : "New"} Incentive</DialogTitle>
        <DialogDescription>Set targets and bonus amount.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Name" value={f.name} data-testid="incentive-name" onChange={(e) => setF({ ...f, name: e.target.value })} />
          <Input placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <div><label className="text-xs">Job target</label><Input type="number" value={f.job_target} onChange={(e) => setF({ ...f, job_target: e.target.value })} /></div>
            <div><label className="text-xs">Bonus amount</label><Input type="number" value={f.bonus_amount} data-testid="incentive-bonus" onChange={(e) => setF({ ...f, bonus_amount: e.target.value })} /></div>
            <div><label className="text-xs">Min rating</label><Input type="number" step="0.1" value={f.rating_min} onChange={(e) => setF({ ...f, rating_min: e.target.value })} /></div>
            <div><label className="text-xs">Revenue target</label><Input type="number" value={f.revenue_target} onChange={(e) => setF({ ...f, revenue_target: e.target.value })} /></div>
            <div><label className="text-xs">Start date</label><DatePicker value={f.start_date} onChange={(v) => setF({ ...f, start_date: v })} placeholder="Select start date" /></div>
            <div><label className="text-xs">End date</label><DatePicker value={f.end_date} onChange={(v) => setF({ ...f, end_date: v })} placeholder="Select end date" minDate={f.start_date ? new Date(f.start_date) : undefined} /></div>
          </div>
        </div>
        <DialogFooter><Button onClick={save} data-testid="incentive-save" className="bg-primary-700 hover:bg-primary-800">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================ PENALTIES MANAGER
export function PenaltiesManager() {
  const [pens, setPens] = useState([]);
  const [partners, setPartners] = useState([]);
  const [open, setOpen] = useState(false);
  const load = useCallback(() => api.get("/admin/partner/penalties").then((r) => setPens(r.data)), []);
  useEffect(() => { load(); api.get("/admin/users?role=partner").then((r) => setPartners(r.data)); }, [load]);
  const reverse = async (id) => { await api.post(`/admin/partner/penalties/${id}/reverse`); toast.success("Reversed"); load(); };
  return (
    <div className="max-w-3xl">
      <Button className="mb-4 bg-primary-700 hover:bg-primary-800" data-testid="new-penalty-btn" onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1" /> Apply Penalty</Button>
      <div className="space-y-2" data-testid="penalties-admin">
        {pens.length === 0 && <Empty text="No penalties applied." />}
        {pens.map((p) => (
          <Card key={p.id} className="flex justify-between items-center">
            <div><p className="font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-red-500" /> {p.partner_name} — {p.reason}</p>
              <p className="text-xs text-slate-400 capitalize">{p.type} · {fmt(p.amount)} · {p.status}</p></div>
            {p.status === "active" && <Button size="sm" variant="outline" onClick={() => reverse(p.id)}>Reverse</Button>}
          </Card>
        ))}
      </div>
      <PenaltyDialog open={open} partners={partners} onClose={() => setOpen(false)} onDone={() => { setOpen(false); load(); }} />
    </div>
  );
}

function PenaltyDialog({ open, partners, onClose, onDone }) {
  const [f, setF] = useState({ partner_id: "", reason: "", type: "fixed", amount: 0, note: "" });
  const save = async () => {
    if (!f.partner_id || !f.reason) return toast.error("Partner & reason required");
    await api.post("/admin/partner/penalties", { ...f, amount: Number(f.amount) });
    toast.success("Penalty applied"); onDone();
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent><DialogHeader><DialogTitle>Apply Penalty</DialogTitle>
        <DialogDescription>Deducts from partner wallet with a ledger entry.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <PremiumSelect className="w-full border rounded-md h-10 px-3 text-sm" value={f.partner_id} data-testid="penalty-partner" onChange={(e) => setF({ ...f, partner_id: e.target.value })}>
            <option value="">Select partner…</option>
            {partners.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.phone})</option>)}
          </PremiumSelect>
          <Input placeholder="Reason" value={f.reason} data-testid="penalty-reason" onChange={(e) => setF({ ...f, reason: e.target.value })} />
          <div className="grid grid-cols-2 gap-2">
            <PremiumSelect className="border rounded-md h-10 px-3 text-sm" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
              <option value="fixed">Fixed ₹</option><option value="percentage">Percentage %</option><option value="score">Score only</option>
            </PremiumSelect>
            <Input type="number" placeholder="Amount" value={f.amount} data-testid="penalty-amount" onChange={(e) => setF({ ...f, amount: e.target.value })} />
          </div>
        </div>
        <DialogFooter><Button onClick={save} data-testid="penalty-save" className="bg-red-600 hover:bg-red-700">Apply</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================ TRAINING MANAGER
export function TrainingManager() {
  const [items, setItems] = useState([]);
  const [edit, setEdit] = useState(null);
  const load = useCallback(() => api.get("/admin/partner/training").then((r) => setItems(r.data)), []);
  useEffect(() => { load(); }, [load]);
  const blank = { title: "", description: "", video_url: "", duration_min: 0, assign_type: "all", assign_value: "", mandatory: false, status: "active" };
  const del = async (id) => { await api.delete(`/admin/partner/training/${id}`); toast.success("Deleted"); load(); };
  return (
    <div className="max-w-3xl">
      <Button className="mb-4 bg-primary-700 hover:bg-primary-800" data-testid="new-training-btn" onClick={() => setEdit(blank)}><Plus className="h-4 w-4 mr-1" /> New Training</Button>
      <div className="space-y-3" data-testid="training-admin">
        {items.map((t) => (
          <Card key={t.id} className="flex justify-between items-start">
            <div>
              <p className="font-semibold flex items-center gap-2">{t.title}
                {t.mandatory && <Badge className="bg-red-50 text-red-600 border-0 text-xs">Mandatory</Badge>}
                <Badge variant="outline" className="text-xs capitalize">{t.assign_type}{t.assign_value ? `: ${t.assign_value}` : ""}</Badge></p>
              <p className="text-sm text-slate-500">{t.description}</p>
              <p className="text-xs text-slate-400 mt-1 break-all">{t.video_url}</p>
            </div>
            <div className="flex gap-2 shrink-0">
              <button onClick={() => setEdit(t)} className="text-primary-600 text-xs">Edit</button>
              <button onClick={() => del(t.id)} className="text-red-400"><Trash2 className="h-4 w-4" /></button>
            </div>
          </Card>
        ))}
      </div>
      <TrainingEditDialog t={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); }} />
    </div>
  );
}

function TrainingEditDialog({ t, onClose, onDone }) {
  const [f, setF] = useState(t);
  useEffect(() => { setF(t); }, [t]);
  if (!f) return null;
  const save = async () => {
    if (!f.title || !f.video_url) return toast.error("Title & video URL required");
    const p = { ...f, duration_min: Number(f.duration_min) };
    if (f.id) await api.put(`/admin/partner/training/${f.id}`, p); else await api.post("/admin/partner/training", p);
    toast.success("Saved"); onDone();
  };
  return (
    <Dialog open={!!t} onOpenChange={onClose}>
      <DialogContent><DialogHeader><DialogTitle>{f.id ? "Edit" : "New"} Training</DialogTitle>
        <DialogDescription>Assign a training video to all partners, a skill, a category, or a verification stage.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Title" value={f.title} data-testid="training-title" onChange={(e) => setF({ ...f, title: e.target.value })} />
          <Input placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <Input placeholder="Video URL (YouTube)" value={f.video_url} data-testid="training-url" onChange={(e) => setF({ ...f, video_url: e.target.value })} />
          <div className="grid grid-cols-3 gap-2">
            <div><label className="text-xs">Duration (min)</label><Input type="number" value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: e.target.value })} /></div>
            <div><label className="text-xs">Assign to</label>
              <PremiumSelect className="w-full border rounded-md h-10 px-3 text-sm" value={f.assign_type} onChange={(e) => setF({ ...f, assign_type: e.target.value })}>
                <option value="all">All partners</option><option value="stage">Verification stage</option><option value="skill">Skill</option><option value="category">Category</option>
              </PremiumSelect></div>
            <div><label className="text-xs">Value</label><Input placeholder="stage key / id" value={f.assign_value} onChange={(e) => setF({ ...f, assign_value: e.target.value })} /></div>
          </div>
          <label className="flex items-center gap-2 text-sm">Mandatory (gates stage) <Switch checked={f.mandatory} data-testid="training-mandatory" onCheckedChange={(v) => setF({ ...f, mandatory: v })} /></label>
        </div>
        <DialogFooter><Button onClick={save} data-testid="training-save" className="bg-primary-700 hover:bg-primary-800">Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================ LEAVES QUEUE
export function LeavesQueue() {
  const [items, setItems] = useState([]);
  const load = useCallback(() => api.get("/admin/partner/leaves").then((r) => setItems(r.data)), []);
  useEffect(() => { load(); }, [load]);
  const act = async (id, action) => { await api.post(`/admin/partner/leaves/${id}/action`, { action }); toast.success(action); load(); };
  return (
    <div className="max-w-3xl space-y-2" data-testid="admin-leaves">
      {items.length === 0 && <Empty text="No leave requests." />}
      {items.map((l) => (
        <Card key={l.id} className="flex justify-between items-center">
          <div><p className="font-medium">{l.partner_name} · {l.start_date} → {l.end_date}</p>
            <p className="text-xs text-slate-400">{l.reason}</p></div>
          {l.status === "pending" ? (
            <div className="flex gap-2">
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" data-testid={`leave-approve-${l.id}`} onClick={() => act(l.id, "approve")}>Approve</Button>
              <Button size="sm" variant="outline" className="text-red-600" onClick={() => act(l.id, "reject")}>Reject</Button>
            </div>
          ) : <Badge className={l.status === "approved" ? "bg-emerald-100 text-emerald-700 border-0" : "bg-red-100 text-red-700 border-0"}>{l.status}</Badge>}
        </Card>
      ))}
    </div>
  );
}

// ============================================================ PAYOUT LOG (auto payouts & bonuses)
const KIND_META = {
  incentive: { label: "Auto Incentive", Icon: Zap, tone: "bg-emerald-100 text-emerald-700" },
  streak_bonus: { label: "Streak Bonus", Icon: Flame, tone: "bg-orange-100 text-orange-700" },
  leaderboard_reward: { label: "Leaderboard Reward", Icon: Trophy, tone: "bg-amber-100 text-amber-700" },
};

export function PayoutLog() {
  const [data, setData] = useState(null);
  const [kind, setKind] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const load = useCallback(() => {
    const params = new URLSearchParams();
    if (kind) params.set("kind", kind);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    params.set("page", page);
    params.set("page_size", pageSize);
    api.get(`/admin/partner/payout-log?${params.toString()}`).then((r) => setData(r.data)).catch(() => setData({ rows: [], total: 0, summary: {}, grand_total: 0 }));
  }, [kind, dateFrom, dateTo, page]);

  useEffect(() => { load(); }, [load]);

  const summary = data?.summary || {};
  const rows = data?.rows || [];
  const totalPages = Math.max(1, Math.ceil((data?.total || 0) / pageSize));

  return (
    <div className="max-w-5xl space-y-5" data-testid="admin-payout-log">
      <p className="text-sm text-slate-500">Every automatic wallet credit — incentives paid the moment they unlock, 5★ streak bonuses, and weekly leaderboard rewards. No manual approval involved.</p>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3" data-testid="payout-summary">
        {["incentive", "streak_bonus", "leaderboard_reward"].map((k) => {
          const m = KIND_META[k];
          const s = summary[k] || { total: 0, count: 0 };
          return (
            <Card key={k} className="!p-3">
              <p className="text-[11px] uppercase tracking-wider text-slate-400 flex items-center gap-1"><m.Icon className="h-3.5 w-3.5" /> {m.label}</p>
              <p className="text-lg font-bold text-slate-800">{fmt(s.total)}</p>
              <p className="text-[11px] text-slate-400">{s.count} payout{s.count === 1 ? "" : "s"}</p>
            </Card>
          );
        })}
        <Card className="!p-3 bg-primary-700 border-primary-700">
          <p className="text-[11px] uppercase tracking-wider text-primary-100 flex items-center gap-1"><Banknote className="h-3.5 w-3.5" /> Grand Total</p>
          <p className="text-lg font-bold text-white">{fmt(data?.grand_total || 0)}</p>
          <p className="text-[11px] text-primary-200">{data?.total || 0} records</p>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2" data-testid="payout-filters">
        <div className="w-48">
          <label className="text-[11px] text-slate-500 block mb-1">Type</label>
          <PremiumSelect className="w-full border rounded-md h-10 px-3 text-sm" value={kind || "all"} onChange={(e) => { setPage(1); setKind(e.target.value === "all" ? "" : e.target.value); }}
            options={[{ value: "all", label: "All types" }, { value: "incentive", label: "Auto Incentive" }, { value: "streak_bonus", label: "Streak Bonus" }, { value: "leaderboard_reward", label: "Leaderboard Reward" }]} />
        </div>
        <div><label className="text-[11px] text-slate-500 block mb-1">From</label><DatePicker value={dateFrom} onChange={(v) => { setPage(1); setDateFrom(v); }} placeholder="From date" /></div>
        <div><label className="text-[11px] text-slate-500 block mb-1">To</label><DatePicker value={dateTo} onChange={(v) => { setPage(1); setDateTo(v); }} placeholder="To date" /></div>
        {(kind || dateFrom || dateTo) && <Button size="sm" variant="ghost" className="text-slate-500" onClick={() => { setKind(""); setDateFrom(""); setDateTo(""); setPage(1); }}>Clear</Button>}
      </div>

      {/* Table */}
      <div className="space-y-2" data-testid="payout-rows">
        {rows.length === 0 && <Empty text="No automatic payouts yet. They'll appear here the moment a bonus is credited." />}
        {rows.map((r) => {
          const m = KIND_META[r.kind] || { label: r.kind, Icon: Award, tone: "bg-slate-100 text-slate-600" };
          return (
            <div key={r.id} className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-lg grid place-items-center ${m.tone}`}><m.Icon className="h-4.5 w-4.5" /></div>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-slate-800 truncate">{r.partner_name}</p>
                <p className="text-xs text-slate-400 truncate">{r.note}</p>
              </div>
              <Badge className={`border-0 ${m.tone}`}>{m.label}</Badge>
              <div className="text-right w-24">
                <p className="font-semibold text-emerald-600">+{fmt(r.amount)}</p>
                <p className="text-[11px] text-slate-400">{r.created_at ? new Date(r.created_at).toLocaleDateString() : ""}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</Button>
          <span className="text-sm text-slate-500">Page {page} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}
