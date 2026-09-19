import PremiumSelect from "@/components/ui/PremiumSelect";
import { useEffect, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import api, { fmt } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DatePicker } from "@/components/ui/date-picker";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  CheckCircle2, Clock, XCircle, Upload, Award, Wallet, TrendingUp, AlertTriangle,
  ShieldCheck, FileText, Gift, ArrowDownToLine, Star, ChevronLeft, ChevronRight, CalendarDays,
} from "lucide-react";
import { toast } from "sonner";

const STATUS_STYLE = {
  approved: { c: "bg-emerald-100 text-emerald-700", Icon: CheckCircle2, t: "Approved" },
  verified: { c: "bg-emerald-100 text-emerald-700", Icon: CheckCircle2, t: "Verified" },
  passed: { c: "bg-emerald-100 text-emerald-700", Icon: CheckCircle2, t: "Passed" },
  completed: { c: "bg-emerald-100 text-emerald-700", Icon: CheckCircle2, t: "Completed" },
  under_review: { c: "bg-blue-100 text-blue-700", Icon: Clock, t: "Under review" },
  submitted: { c: "bg-blue-100 text-blue-700", Icon: Clock, t: "Submitted" },
  pending: { c: "bg-amber-100 text-amber-700", Icon: Clock, t: "Pending" },
  self_declared: { c: "bg-slate-100 text-slate-600", Icon: Clock, t: "Self-declared" },
  not_required: { c: "bg-slate-100 text-slate-500", Icon: CheckCircle2, t: "Not required" },
  rejected: { c: "bg-red-100 text-red-700", Icon: XCircle, t: "Rejected" },
  failed: { c: "bg-red-100 text-red-700", Icon: XCircle, t: "Failed" },
};

const StatusPill = ({ status }) => {
  const s = STATUS_STYLE[status] || STATUS_STYLE.pending;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${s.c}`}>
      <s.Icon className="h-3.5 w-3.5" /> {s.t}
    </span>
  );
};

const Empty = ({ text }) => (
  <div className="bg-white rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-400">{text}</div>
);

// ============================================================ VERIFICATION
export function VerificationSection() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => api.get("/partner/verification").then((r) => setData(r.data)), []);
  useEffect(() => { load(); }, [load]);
  if (!data) return <Empty text="Loading…" />;

  const overallBadge = {
    approved: <Badge className="bg-emerald-100 text-emerald-700 border-0">Verified Partner</Badge>,
    action_required: <Badge className="bg-red-100 text-red-700 border-0">Action required</Badge>,
    in_progress: <Badge className="bg-amber-100 text-amber-700 border-0">In progress</Badge>,
  }[data.overall];

  return (
    <div className="max-w-3xl">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-heading font-bold text-lg text-slate-900">Verification Pipeline</h3>
          <p className="text-sm text-slate-500">Complete each stage to become a Verified Partner.</p>
        </div>
        {overallBadge}
      </div>

      <div className="space-y-3" data-testid="verification-stages">
        {data.stages.map((s, i) => (
          <div key={s.key} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold
                  ${s.status === "approved" ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"}`}>{i + 1}</div>
                <div>
                  <p className="font-semibold text-slate-800">{s.name}
                    {s.mandatory && <span className="text-red-400 ml-1">*</span>}</p>
                  {s.reason && <p className="text-xs text-red-500 mt-0.5">{s.reason}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={s.status} />
                {["pending", "rejected"].includes(s.status) && (s.documents?.length > 0 || !s.auto_approve) && (
                  <Button size="sm" variant="outline" data-testid={`submit-stage-${s.key}`}
                    onClick={() => setOpen(s)}>
                    <Upload className="h-3.5 w-3.5 mr-1" /> Submit
                  </Button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <StageSubmitDialog stage={open} onClose={() => setOpen(null)} onDone={() => { setOpen(null); load(); }} />
    </div>
  );
}

function StageSubmitDialog({ stage, onClose, onDone }) {
  const [docs, setDocs] = useState({});
  useEffect(() => { setDocs({}); }, [stage]);
  if (!stage) return null;
  const fields = stage.documents?.length ? stage.documents : ["note"];
  const submit = async () => {
    const documents = Object.entries(docs).map(([type, url]) => ({ type, url, name: type }));
    try {
      await api.post(`/partner/verification/${stage.key}/submit`, { documents, data: docs });
      toast.success(`${stage.name} submitted`);
      onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  return (
    <Dialog open={!!stage} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Submit: {stage.name}</DialogTitle>
          <DialogDescription>Provide the required information / document references for this stage.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {fields.map((f) => (
            <div key={f}>
              <label className="text-sm font-medium capitalize">{f.replace(/_/g, " ")}</label>
              <Input placeholder={`Enter ${f.replace(/_/g, " ")} / document URL`}
                data-testid={`stage-field-${f}`}
                value={docs[f] || ""} onChange={(e) => setDocs({ ...docs, [f]: e.target.value })} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={submit} data-testid="stage-submit-btn" className="bg-primary-700 hover:bg-primary-800">Submit for review</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================ SKILLS & ASSESSMENT
export function SkillsSection() {
  const [catalog, setCatalog] = useState([]);
  const [mine, setMine] = useState([]);
  const [certs, setCerts] = useState([]);
  const [elig, setElig] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [assess, setAssess] = useState(null);
  const [certOpen, setCertOpen] = useState(false);

  const load = useCallback(() => {
    api.get("/partner/skills/catalog").then((r) => setCatalog(r.data));
    api.get("/partner/skills").then((r) => setMine(r.data));
    api.get("/partner/certificates").then((r) => setCerts(r.data));
    api.get("/partner/eligibility").then((r) => setElig(r.data));
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="max-w-4xl space-y-8">
      <section>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-heading font-bold text-lg">My Skills</h3>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" data-testid="add-cert-btn" onClick={() => setCertOpen(true)}>
              <Award className="h-4 w-4 mr-1" /> Add Certificate</Button>
            <Button size="sm" data-testid="add-skill-btn" className="bg-primary-700 hover:bg-primary-800" onClick={() => setAddOpen(true)}>+ Add Skill</Button>
          </div>
        </div>
        {mine.length === 0 && <Empty text="No skills yet. Add your primary skills to receive matching jobs." />}
        <div className="grid sm:grid-cols-2 gap-3" data-testid="my-skills">
          {mine.map((s) => {
            const e = elig?.skills?.find((x) => x.skill_id === s.skill_id);
            return (
              <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-slate-800">{s.skill_name}</p>
                  {s.is_primary ? <Badge className="bg-primary-50 text-primary-700 border-0">Primary</Badge>
                    : <Badge variant="outline">Secondary</Badge>}
                </div>
                <div className="flex items-center gap-2 mt-2 text-sm text-slate-500">
                  <span>{s.level}</span> · <span>{s.experience_years}y exp</span>
                  <StatusPill status={s.status} />
                </div>
                <div className="mt-2 flex items-center gap-2 flex-wrap">
                  {s.requires_assessment && <StatusPill status={s.assessment_status} />}
                  {s.requires_assessment && s.assessment_status !== "passed" && (
                    <Button size="sm" variant="outline" data-testid={`take-test-${s.skill_id}`}
                      onClick={() => api.get(`/partner/assessment/${s.skill_id}`).then((r) => setAssess(r.data))}>
                      Take Test</Button>
                  )}
                </div>
                {e && !e.eligible && (
                  <p className="text-xs text-amber-600 mt-2 flex items-start gap-1">
                    <AlertTriangle className="h-3.5 w-3.5 mt-0.5" /> {e.blockers.join(", ")}</p>
                )}
                {e && e.eligible && (
                  <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1">
                    <CheckCircle2 className="h-3.5 w-3.5" /> Eligible for jobs</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <h3 className="font-heading font-bold text-lg mb-3">Certificates</h3>
        {certs.length === 0 && <Empty text="No certificates uploaded." />}
        <div className="space-y-2">
          {certs.map((c) => (
            <div key={c.id} className="bg-white rounded-lg border border-slate-200 p-3 flex items-center justify-between">
              <div className="flex items-center gap-2"><FileText className="h-4 w-4 text-slate-400" />
                <div><p className="font-medium text-sm">{c.name}</p><p className="text-xs text-slate-400">{c.skill_name}</p></div></div>
              <StatusPill status={c.status} />
            </div>
          ))}
        </div>
      </section>

      <AddSkillDialog open={addOpen} catalog={catalog} mine={mine} onClose={() => setAddOpen(false)}
        onDone={() => { setAddOpen(false); load(); }} />
      <AddCertDialog open={certOpen} mine={mine} onClose={() => setCertOpen(false)}
        onDone={() => { setCertOpen(false); load(); }} />
      <AssessmentDialog assess={assess} onClose={() => setAssess(null)}
        onDone={() => { setAssess(null); load(); }} />
    </div>
  );
}

function AddSkillDialog({ open, catalog, mine, onClose, onDone }) {
  const avail = catalog.filter((c) => !mine.some((m) => m.skill_id === c.id));
  const [skillId, setSkillId] = useState("");
  const [exp, setExp] = useState(0);
  const [level, setLevel] = useState("Beginner");
  const [primary, setPrimary] = useState(true);
  const skill = catalog.find((c) => c.id === skillId);
  const submit = async () => {
    if (!skillId) return toast.error("Select a skill");
    try {
      await api.post("/partner/skills", { skill_id: skillId, experience_years: Number(exp), level, is_primary: primary });
      toast.success("Skill added"); onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Skill</DialogTitle>
          <DialogDescription>Select a skill and declare your experience & level.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <PremiumSelect className="w-full border rounded-md h-10 px-3 text-sm" value={skillId} data-testid="skill-select"
            onChange={(e) => { setSkillId(e.target.value); const s = catalog.find((c) => c.id === e.target.value); if (s) setLevel(s.levels?.[0] || "Beginner"); }}>
            <option value="">Choose a skill…</option>
            {avail.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.category})</option>)}
          </PremiumSelect>
          {skill && (
            <div className="text-xs text-slate-500 bg-slate-50 rounded-md p-2 space-y-0.5">
              {skill.min_experience > 0 && <p>Min experience: {skill.min_experience}y</p>}
              {skill.requires_certificate && <p>Requires certificate</p>}
              {skill.requires_assessment && <p>Requires assessment (pass ≥ {skill.passing_score}%)</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-sm">Experience (years)</label>
              <Input type="number" min="0" value={exp} data-testid="skill-exp" onChange={(e) => setExp(e.target.value)} /></div>
            <div><label className="text-sm">Level</label>
              <PremiumSelect className="w-full border rounded-md h-10 px-3 text-sm" value={level} onChange={(e) => setLevel(e.target.value)}>
                {(skill?.levels || ["Beginner", "Intermediate", "Advanced", "Expert", "Master"]).map((l) => <option key={l}>{l}</option>)}
              </PremiumSelect></div>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={primary} onChange={(e) => setPrimary(e.target.checked)} /> Primary skill</label>
        </div>
        <DialogFooter><Button data-testid="skill-save-btn" onClick={submit} className="bg-primary-700 hover:bg-primary-800">Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddCertDialog({ open, mine, onClose, onDone }) {
  const [skillId, setSkillId] = useState("");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const submit = async () => {
    if (!name) return toast.error("Certificate name required");
    const skill = mine.find((m) => m.skill_id === skillId);
    await api.post("/partner/certificates", { skill_id: skillId, skill_name: skill?.skill_name || "", name, url: url || "certificate.pdf" });
    toast.success("Certificate uploaded for review"); onDone();
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Certificate</DialogTitle>
          <DialogDescription>Upload a certificate reference for admin review.</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <PremiumSelect className="w-full border rounded-md h-10 px-3 text-sm" value={skillId} onChange={(e) => setSkillId(e.target.value)}>
            <option value="">General / no skill</option>
            {mine.map((m) => <option key={m.id} value={m.skill_id}>{m.skill_name}</option>)}
          </PremiumSelect>
          <Input placeholder="Certificate name" data-testid="cert-name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Document URL" value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <DialogFooter><Button data-testid="cert-save-btn" onClick={submit} className="bg-primary-700 hover:bg-primary-800">Upload</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssessmentDialog({ assess, onClose, onDone }) {
  const [answers, setAnswers] = useState({});
  const [result, setResult] = useState(null);
  useEffect(() => { setAnswers({}); setResult(null); }, [assess]);
  if (!assess) return null;
  const submit = async () => {
    try {
      const { data } = await api.post(`/partner/assessment/${assess.skill_id}/submit`, { answers });
      setResult(data);
      if (data.passed) toast.success(`Passed with ${data.score}%!`); else toast.error(`Failed: ${data.score}%`);
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  return (
    <Dialog open={!!assess} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{assess.skill_name} Assessment</DialogTitle>
          <DialogDescription>Pass ≥ {assess.passing_score}%. Attempts used: {assess.attempts_used}/{assess.max_attempts}.</DialogDescription></DialogHeader>
        {result ? (
          <div className="text-center py-6">
            {result.passed ? <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" /> : <XCircle className="h-12 w-12 text-red-500 mx-auto" />}
            <p className="font-heading font-bold text-2xl mt-2">{result.score}%</p>
            <p className="text-slate-500">{result.passed ? "Assessment passed!" : `Attempts left: ${result.attempts_left}`}</p>
          </div>
        ) : (
          <div className="space-y-4 max-h-[50vh] overflow-y-auto">
            {assess.questions.map((q, qi) => (
              <div key={q.id} data-testid={`question-${qi}`}>
                <p className="font-medium text-sm mb-1.5">{qi + 1}. {q.q}</p>
                <div className="space-y-1">
                  {q.options.map((opt, oi) => (
                    <label key={oi} className={`flex items-center gap-2 text-sm border rounded-md px-3 py-2 cursor-pointer
                      ${String(answers[q.id]) === String(oi) ? "border-primary-500 bg-primary-50" : "border-slate-200"}`}>
                      <input type="radio" name={q.id} data-testid={`q${qi}-opt${oi}`}
                        checked={String(answers[q.id]) === String(oi)}
                        onChange={() => setAnswers({ ...answers, [q.id]: oi })} /> {opt}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          {result ? <Button onClick={onDone}>Close</Button>
            : <Button data-testid="assessment-submit" onClick={submit} className="bg-primary-700 hover:bg-primary-800">Submit Test</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================ WALLET & WITHDRAW
export function WalletSection() {
  const [w, setW] = useState(null);
  const [cfg, setCfg] = useState(null);
  const [wds, setWds] = useState([]);
  const [open, setOpen] = useState(false);
  const [kyc, setKyc] = useState(null);
  const load = useCallback(() => {
    api.get("/partner/wallet").then((r) => setW(r.data));
    api.get("/partner/wallet/config").then((r) => setCfg(r.data));
    api.get("/partner/withdrawals").then((r) => setWds(r.data));
    api.get("/partner/finance-kyc").then((r) => setKyc(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!w) return <Empty text="Loading…" />;
  const eligible = kyc?.eligible;

  return (
    <div className="max-w-3xl">
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-primary-700 text-white rounded-2xl p-5 azo-grid-bg">
          <p className="text-primary-100 text-sm">Withdrawable</p>
          <p className="font-heading font-black text-3xl mt-1">{fmt(w.withdrawable_balance)}</p>
          {eligible ? (
            <Button size="sm" data-testid="withdraw-btn" onClick={() => setOpen(true)}
              className="mt-3 bg-white text-primary-700 hover:bg-primary-50"><ArrowDownToLine className="h-4 w-4 mr-1" /> Withdraw</Button>
          ) : (
            <Button size="sm" data-testid="complete-kyc-btn" onClick={() => { window.dispatchEvent(new CustomEvent("partner-nav", { detail: "bankkyc" })); }}
              className="mt-3 bg-white/90 text-primary-700 hover:bg-white"><ShieldCheck className="h-4 w-4 mr-1" /> Complete KYC to withdraw</Button>
          )}
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-slate-400 text-sm">Pending (locked)</p>
          <p className="font-heading font-bold text-2xl mt-1 text-amber-600">{fmt(w.pending_balance)}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-5">
          <p className="text-slate-400 text-sm">Total earned</p>
          <p className="font-heading font-bold text-2xl mt-1 text-emerald-600">{fmt(w.total_earned)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6 text-center text-sm">
        <div className="bg-white border rounded-lg p-3"><p className="text-slate-400">Incentives</p><p className="font-semibold text-emerald-600">+{fmt(w.total_incentive)}</p></div>
        <div className="bg-white border rounded-lg p-3"><p className="text-slate-400">Penalties</p><p className="font-semibold text-red-600">-{fmt(w.total_penalty)}</p></div>
        <div className="bg-white border rounded-lg p-3"><p className="text-slate-400">Withdrawn</p><p className="font-semibold text-slate-700">{fmt(w.total_withdrawn)}</p></div>
      </div>

      <h3 className="font-heading font-bold text-lg mb-3">Withdrawal Requests</h3>
      <div className="space-y-2 mb-8" data-testid="withdrawals-list">
        {wds.length === 0 && <Empty text="No withdrawals yet." />}
        {wds.map((x) => (
          <div key={x.id} className="bg-white rounded-lg border border-slate-200 p-4 flex justify-between items-center">
            <div><p className="font-medium">{fmt(x.amount)} <span className="text-xs text-slate-400 uppercase">via {x.method}</span></p>
              <p className="text-xs text-slate-400">{new Date(x.requested_at).toLocaleString()} {x.reason && `· ${x.reason}`}</p></div>
            <StatusPill status={x.status} />
          </div>
        ))}
      </div>

      <h3 className="font-heading font-bold text-lg mb-3">Wallet Ledger</h3>
      <div className="space-y-2" data-testid="wallet-ledger">
        {w.ledger.length === 0 && <Empty text="No transactions yet." />}
        {w.ledger.map((l) => (
          <div key={l.id} className="bg-white rounded-lg border border-slate-200 p-3 flex justify-between items-center">
            <div><p className="font-medium text-sm capitalize">{l.note}</p>
              <p className="text-xs text-slate-400 capitalize">{l.kind.replace(/_/g, " ")} · {l.status}</p></div>
            <p className={`font-semibold ${l.direction === "credit" ? "text-emerald-600" : "text-red-600"}`}>
              {l.direction === "credit" ? "+" : "-"}{fmt(l.amount)}</p>
          </div>
        ))}
      </div>

      <WithdrawDialog open={open} cfg={cfg} max={w.withdrawable_balance} onClose={() => setOpen(false)}
        onDone={() => { setOpen(false); load(); }} />
    </div>
  );
}

function WithdrawDialog({ open, cfg, max, onClose, onDone }) {
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("upi");
  const [upi, setUpi] = useState("");
  const [bank, setBank] = useState({ account_holder: "", bank_name: "", account_number: "", ifsc: "", branch: "" });
  const submit = async () => {
    try {
      await api.post("/partner/withdrawals", {
        amount: Number(amount), method,
        upi_id: method === "upi" ? upi : "", bank: method === "bank" ? bank : null,
      });
      toast.success("Withdrawal requested"); onDone();
    } catch (e) { toast.error(e.response?.data?.detail || "Failed"); }
  };
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Request Withdrawal</DialogTitle>
          <DialogDescription>Min {fmt(cfg?.min_withdrawal || 0)} · Max {fmt(cfg?.max_withdrawal || 0)} · Available {fmt(max)}</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <Input type="number" placeholder="Amount" data-testid="withdraw-amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <div className="flex gap-2">
            {cfg?.upi_enabled && <Button type="button" variant={method === "upi" ? "default" : "outline"} onClick={() => setMethod("upi")} className={method === "upi" ? "bg-primary-700" : ""}>UPI</Button>}
            {cfg?.bank_enabled && <Button type="button" variant={method === "bank" ? "default" : "outline"} onClick={() => setMethod("bank")} className={method === "bank" ? "bg-primary-700" : ""}>Bank</Button>}
          </div>
          {method === "upi" ? (
            <Input placeholder="yourname@upi" data-testid="withdraw-upi" value={upi} onChange={(e) => setUpi(e.target.value)} />
          ) : (
            <div className="space-y-2">
              <Input placeholder="Account holder" value={bank.account_holder} onChange={(e) => setBank({ ...bank, account_holder: e.target.value })} />
              <Input placeholder="Bank name" value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} />
              <Input placeholder="Account number" data-testid="withdraw-acc" value={bank.account_number} onChange={(e) => setBank({ ...bank, account_number: e.target.value })} />
              <Input placeholder="IFSC" value={bank.ifsc} onChange={(e) => setBank({ ...bank, ifsc: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 11) })} inputMode="text" autoCapitalize="characters" autoComplete="off" maxLength={11} className="uppercase" />
            </div>
          )}
        </div>
        <DialogFooter><Button data-testid="withdraw-submit" onClick={submit} className="bg-primary-700 hover:bg-primary-800">Request</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================ TRAINING
export function TrainingSection() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(null);
  const load = useCallback(() => api.get("/partner/training").then((r) => setItems(r.data)), []);
  useEffect(() => { load(); }, [load]);
  const markComplete = async (t) => {
    await api.post(`/partner/training/${t.id}/progress`, { percent: 100, completed: true });
    toast.success(`${t.title} completed`); setOpen(null); load();
  };
  const start = async (t) => {
    await api.post(`/partner/training/${t.id}/progress`, { percent: 50, completed: false });
    setOpen(t); load();
  };
  const embed = (url) => {
    const m = (url || "").match(/(?:v=|youtu\.be\/|embed\/)([\w-]{11})/);
    return m ? `https://www.youtube.com/embed/${m[1]}` : null;
  };
  return (
    <div className="max-w-3xl">
      <h3 className="font-heading font-bold text-lg mb-1">Training</h3>
      <p className="text-sm text-slate-500 mb-4">Mandatory modules must be completed to pass the related verification stage.</p>
      {items.length === 0 && <Empty text="No training assigned." />}
      <div className="space-y-3" data-testid="training-list">
        {items.map((t) => (
          <div key={t.id} className="bg-white rounded-xl border border-slate-200 p-4">
            <div className="flex justify-between items-start gap-3">
              <div>
                <p className="font-semibold text-slate-800 flex items-center gap-2">{t.title}
                  {t.mandatory && <Badge className="bg-red-50 text-red-600 border-0 text-xs">Mandatory</Badge>}</p>
                <p className="text-sm text-slate-500">{t.description}</p>
                <p className="text-xs text-slate-400 mt-1">{t.duration_min} min</p>
              </div>
              {t.completed ? <StatusPill status="completed" />
                : <Button size="sm" variant="outline" data-testid={`watch-${t.id}`} onClick={() => start(t)}>Watch</Button>}
            </div>
            {t.progress_percent > 0 && !t.completed && <Progress value={t.progress_percent} className="h-1.5 mt-3" />}
          </div>
        ))}
      </div>
      <Dialog open={!!open} onOpenChange={() => setOpen(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{open?.title}</DialogTitle>
            <DialogDescription>Watch the full video, then mark as complete.</DialogDescription></DialogHeader>
          {open && embed(open.video_url) ? (
            <div className="aspect-video"><iframe title={open.title} className="w-full h-full rounded-lg" src={embed(open.video_url)} allowFullScreen /></div>
          ) : <a href={open?.video_url} target="_blank" rel="noreferrer" className="text-primary-700 underline">Open video</a>}
          <DialogFooter><Button data-testid="training-complete" onClick={() => markComplete(open)} className="bg-primary-700 hover:bg-primary-800">Mark as Completed</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ============================================================ AVAILABILITY & LEAVE
export function AvailabilitySection() {
  // Premium, calendar-only availability manager (UI redesign — logic unchanged).
  // Online/Offline/Break/Emergency + Leave are intentionally NOT here: current-day
  // Online is controlled ONLY by the Dashboard GO ONLINE button. This page manages
  // date-wise future availability (max 7 Available dates).
  const [cal, setCal] = useState({ calendar: [], dates: [], available_count: 0, max_available: 7, today: "" });
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [picked, setPicked] = useState(null); // "YYYY-MM-DD" for the popup
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);      // status being saved ("available"|"unavailable")

  // IST calendar date so the client aligns with the server's daily reset.
  const istDate = (dt = new Date()) => {
    const d = new Date(dt.getTime() + (330 + dt.getTimezoneOffset()) * 60000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const todayStr = cal.today || istDate();

  const load = useCallback(() => {
    setLoading(true);
    return api.get("/partner/availability/calendar")
      .then((r) => setCal(r.data || { calendar: [], dates: [] }))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  // Lock background scroll while the popup is open (spec 10/11).
  useEffect(() => {
    if (!picked) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [picked]);

  const statusOf = (dateStr) => (cal.calendar || []).find((c) => c.date === dateStr)?.status || null;
  const availableList = (cal.calendar || []).filter((c) => c.status === "available").map((c) => c.date).sort();

  const setStatus = async (dateStr, status) => {
    setBusy(status);
    try {
      const { data } = await api.post("/partner/availability/calendar/set", { date: dateStr, status });
      setCal(data); setPicked(null);
      toast.success(status === "available" ? "Marked Available" : "Marked Not Available");
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not save"); }
    finally { setBusy(null); }
  };

  const fmtLong = (s) => { try { return new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch { return s; } };
  const fmtShort = (s) => { try { return new Date(`${s}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: "numeric" }); } catch { return s; } };

  // Month grid (Sun-first, leading blanks for alignment).
  const y = month.getFullYear(); const m = month.getMonth();
  const firstDow = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(y, m, d));
  const monthLabel = month.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const canGoPrev = `${y}-${String(m + 1).padStart(2, "0")}` > todayStr.slice(0, 7);
  const availCount = cal.available_count ?? availableList.length;
  const maxAvail = cal.max_available ?? 7;
  const pct = Math.min(100, Math.round((availCount / maxAvail) * 100));

  return (
    <div className="w-full space-y-6">
      {/* Page summary header */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-gradient-to-br from-primary-50 to-sky-50 dark:from-primary-900/20 dark:to-sky-900/10 p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <h3 className="font-heading font-black text-xl sm:text-2xl text-slate-900 dark:text-white flex items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary-600 text-white"><CalendarDays className="h-5 w-5" /></span>
              My Availability
            </h3>
            <p className="text-[13px] text-slate-500 dark:text-slate-400 mt-1.5 max-w-2xl">
              Pick the days you&apos;ll work (max {maxAvail}). On Available dates you&apos;re auto-considered online for that day&apos;s scheduled jobs — no need to press GO ONLINE.
            </p>
          </div>
          <div className="rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 px-4 py-3 min-w-[150px]">
            <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Available dates</p>
            <p className="text-2xl font-black text-emerald-600 leading-tight">{availCount}<span className="text-base text-slate-400 font-bold"> / {maxAvail}</span></p>
            <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
              <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
      </div>

      {/* Premium full-width calendar card */}
      <div className="rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-6 shadow-sm" data-testid="availability-calendar">
        <div className="flex items-center justify-between mb-4">
          <button data-testid="cal-prev" disabled={!canGoPrev} onClick={() => setMonth(new Date(y, m - 1, 1))}
            className="h-10 w-10 grid place-items-center rounded-xl border border-slate-200 dark:border-slate-700 disabled:opacity-30 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition"><ChevronLeft className="h-5 w-5" /></button>
          <p className="font-heading font-black text-lg sm:text-xl text-slate-900 dark:text-white" data-testid="cal-month">{monthLabel}</p>
          <button data-testid="cal-next" onClick={() => setMonth(new Date(y, m + 1, 1))}
            className="h-10 w-10 grid place-items-center rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 active:scale-95 transition"><ChevronRight className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2 mb-1.5">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => (
            <div key={i} className="text-center text-[10px] sm:text-[11.5px] font-bold uppercase tracking-wider text-slate-400 py-1">
              <span className="sm:hidden">{d[0]}</span><span className="hidden sm:inline">{d}</span>
            </div>
          ))}
        </div>
        {loading ? (
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {Array.from({ length: 35 }).map((_, i) => (
              <div key={i} className="rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse min-h-[58px] sm:min-h-[80px]" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {cells.map((dt, i) => {
              if (!dt) return <div key={`b${i}`} />;
              const ds = istDate(dt);
              const isPast = ds < todayStr;
              const isToday = ds === todayStr;
              const st = statusOf(ds);
              let cls = "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-primary-400 hover:shadow-sm hover:-translate-y-0.5";
              if (isPast) cls = "border-transparent bg-slate-50/50 dark:bg-slate-800/30 text-slate-300 dark:text-slate-700 cursor-not-allowed";
              else if (st === "available") cls = "border-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-300 hover:-translate-y-0.5 hover:shadow-md";
              else if (st === "unavailable") cls = "border-rose-300 bg-rose-50 dark:bg-rose-900/25 text-rose-600 dark:text-rose-300 hover:-translate-y-0.5";
              return (
                <button key={ds} data-testid={`cal-day-${ds}`} disabled={isPast}
                  aria-label={`${fmtLong(ds)}${st ? ` — ${st}` : ""}`}
                  onClick={() => setPicked(ds)}
                  className={`relative rounded-2xl border p-1 min-h-[58px] sm:min-h-[80px] flex flex-col items-center justify-center gap-0.5 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-primary-400 ${cls} ${isToday ? "ring-2 ring-primary-500" : ""}`}>
                  {isToday && <span className="absolute top-1 right-1 text-[7.5px] font-black uppercase tracking-wide bg-primary-600 text-white rounded-full px-1.5 py-0.5">Today</span>}
                  <span className="text-base sm:text-lg font-black leading-none">{dt.getDate()}</span>
                  {st === "available" && <span className="text-[8px] sm:text-[10px] font-bold leading-none">Available</span>}
                  {st === "unavailable" && <span className="text-[8px] sm:text-[10px] font-bold leading-none">Not Avail.</span>}
                  {!st && !isPast && <span className="text-[8px] sm:text-[10px] text-slate-300 dark:text-slate-600 leading-none">Awaiting</span>}
                </button>
              );
            })}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-4 text-[11.5px] text-slate-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Available</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-rose-500" /> Not Available</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600" /> Awaiting</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full ring-2 ring-primary-500" /> Today</span>
        </div>
      </div>

      {/* Next available dates */}
      <div>
        <h4 className="font-heading font-black text-base mb-3 text-slate-800 dark:text-slate-100">Next available dates</h4>
        {availableList.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-6 text-center">
            <p className="text-[13px] text-slate-500">Select up to {maxAvail} dates when you&apos;re available to work.</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2" data-testid="next-available-list">
            {availableList.map((d) => (
              <button key={d} data-testid={`next-avail-${d}`} onClick={() => setPicked(d)}
                className="w-full flex items-center justify-between rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/60 dark:bg-emerald-900/20 px-4 py-3 text-left hover:shadow-sm hover:-translate-y-0.5 transition">
                <span className="text-[13.5px] font-bold text-slate-800 dark:text-slate-100 truncate">📅 {fmtShort(d)}</span>
                <span className="text-[11.5px] font-black text-emerald-600 shrink-0 ml-3 inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5" /> Available</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Premium responsive popup: centered modal (desktop) / bottom-sheet (mobile) */}
      {picked && createPortal(
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center" data-testid="availability-popup">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-150" onClick={() => !busy && setPicked(null)} />
          <div role="dialog" aria-modal="true"
            className="relative w-full sm:w-[92%] sm:max-w-[520px] bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-6 animate-in slide-in-from-bottom sm:zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto m-0 sm:mx-3">
            <button aria-label="Close" data-testid="popup-close" onClick={() => !busy && setPicked(null)}
              className="absolute top-3.5 right-3.5 h-9 w-9 grid place-items-center rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-primary-400"><XCircle className="h-5 w-5" /></button>
            <div className="sm:hidden mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
            <p className="text-[11px] font-black uppercase tracking-wider text-primary-600">Availability</p>
            <h3 className="font-heading font-black text-lg text-slate-900 dark:text-white mt-0.5">Are you available on this date?</h3>
            <div className="mt-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-4 py-3">
              <p className="text-[10.5px] font-bold uppercase tracking-wider text-slate-400">Date</p>
              <p className="text-[15px] font-black text-slate-900 dark:text-white">📅 {fmtLong(picked)}</p>
            </div>
            {statusOf(picked) && (
              <p className="mt-3 text-[13px] text-slate-500">Currently: <b className={statusOf(picked) === "available" ? "text-emerald-600" : "text-rose-600"}>{statusOf(picked) === "available" ? "Available" : "Not Available"}</b> · tap either to change</p>
            )}
            <div className="grid grid-cols-2 gap-3 mt-4">
              <button data-testid="popup-available" disabled={!!busy} onClick={() => setStatus(picked, "available")}
                className="h-12 rounded-2xl bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white font-bold inline-flex items-center justify-center gap-2 transition disabled:opacity-60"><CheckCircle2 className="h-4.5 w-4.5" /> {busy === "available" ? "Saving…" : "Available"}</button>
              <button data-testid="popup-unavailable" disabled={!!busy} onClick={() => setStatus(picked, "unavailable")}
                className="h-12 rounded-2xl border-2 border-rose-200 dark:border-rose-800 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 active:scale-[0.98] font-bold inline-flex items-center justify-center gap-2 transition disabled:opacity-60"><XCircle className="h-4.5 w-4.5" /> {busy === "unavailable" ? "Saving…" : "Not Available"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

export function IncentivesSection() {
  const [incs, setIncs] = useState([]);
  const [pens, setPens] = useState([]);
  useEffect(() => {
    api.get("/partner/incentives").then((r) => setIncs(r.data));
    api.get("/partner/penalties").then((r) => setPens(r.data));
  }, []);
  return (
    <div className="max-w-3xl space-y-8">
      <section>
        <h3 className="font-heading font-bold text-lg mb-3 flex items-center gap-2"><Gift className="h-5 w-5 text-primary-600" /> Bonus Targets</h3>
        {incs.length === 0 && <Empty text="No active incentives." />}
        <div className="space-y-3" data-testid="incentives-list">
          {incs.map((i) => (
            <div key={i.id} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex justify-between items-start">
                <div><p className="font-semibold text-slate-800">{i.name}</p>
                  <p className="text-sm text-slate-500">{i.description}</p></div>
                <p className="font-heading font-extrabold text-emerald-600">{fmt(i.bonus_amount)}</p>
              </div>
              <div className="mt-3">
                <div className="flex justify-between text-xs text-slate-500 mb-1">
                  <span>{i.jobs_done} / {i.job_target} jobs {i.rating_min > 0 && `· rating ≥ ${i.rating_min}`}</span>
                  <span>{i.progress_pct}%</span>
                </div>
                <Progress value={i.progress_pct} className="h-2" />
                <p className="text-xs mt-2">
                  {i.eligible
                    ? <span className="text-emerald-600 font-medium">Target achieved — bonus pending admin payout</span>
                    : <span className="text-slate-500">{i.remaining_jobs} more job(s) to unlock {fmt(i.bonus_amount)}</span>}
                  {i.claim_status === "paid" && <Badge className="ml-2 bg-emerald-100 text-emerald-700 border-0">Paid</Badge>}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="font-heading font-bold text-lg mb-3 flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" /> Penalties</h3>
        {pens.length === 0 && <Empty text="No penalties. Keep it up!" />}
        <div className="space-y-2" data-testid="penalties-list">
          {pens.map((p) => (
            <div key={p.id} className="bg-white rounded-lg border border-slate-200 p-4 flex justify-between items-center">
              <div><p className="font-medium text-slate-800">{p.reason}</p>
                <p className="text-xs text-slate-400 capitalize">{p.type} · {new Date(p.created_at).toLocaleDateString()} {p.status === "reversed" && "· reversed"}</p></div>
              <p className={`font-semibold ${p.status === "reversed" ? "text-slate-400 line-through" : "text-red-600"}`}>-{fmt(p.amount)}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
