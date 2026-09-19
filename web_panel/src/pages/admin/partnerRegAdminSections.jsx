import PremiumSelect from "@/components/ui/PremiumSelect";
import { useEffect, useState, useCallback } from "react";
import {
  ShieldCheck, Clock, XCircle, CheckCircle2, Eye, Plus, Trash2, Loader2,
  MapPin, Phone, Mail, FileText, GraduationCap, Briefcase, X, Save,
} from "lucide-react";
import api from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

const STATUS_BADGE = {
  under_review: "bg-amber-100 text-amber-700",
  approved: "bg-emerald-100 text-emerald-700",
  rejected: "bg-red-100 text-red-700",
};

/* ---------------- KYC Queue (pending / approved / rejected) ---------------- */
export function KycQueue({ status = "pending", title, onOpenProfile }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/admin/partner-reg/kyc?status=${status}`)
      .then((r) => setRows(r.data)).catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const Icon = status === "pending" ? Clock : status === "approved" ? CheckCircle2 : XCircle;
  return (
    <div data-testid={`kyc-queue-${status}`}>
      <div className="flex items-center gap-2 mb-5">
        <Icon className={`h-6 w-6 ${status === "pending" ? "text-amber-500" : status === "approved" ? "text-emerald-500" : "text-red-500"}`} />
        <h1 className="font-heading font-extrabold text-2xl text-slate-900">{title}</h1>
        <Badge className="bg-slate-100 text-slate-600 border-0">{rows.length}</Badge>
      </div>
      {loading ? (
        <div className="py-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary-600" /></div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-dashed border-slate-200 p-12 text-center text-slate-400">No applications here.</div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
              <tr>
                <th className="text-left px-4 py-3">Partner</th>
                <th className="text-left px-4 py-3">Location</th>
                <th className="text-left px-4 py-3">Services</th>
                <th className="text-left px-4 py-3">Score</th>
                <th className="text-left px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{r.full_name || "—"}</p>
                    <p className="text-xs text-slate-400">{r.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{[r.city, r.state].filter(Boolean).join(", ") || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {(r.categories || []).slice(0, 3).map((c, i) => <Badge key={i} className="bg-primary-50 text-primary-700 border-0">{c}</Badge>)}
                    </div>
                  </td>
                  <td className="px-4 py-3"><Badge className="bg-slate-100 text-slate-700 border-0">{r.completion_score}%</Badge></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {r.source !== "user" && (
                        <Button size="sm" variant="outline" data-testid={`kyc-open-${r.id}`} onClick={() => setOpenId(r.id)}>
                          <Eye className="h-4 w-4 mr-1" /> Review
                        </Button>
                      )}
                      {onOpenProfile && r.user_id && (
                        <Button size="sm" variant="ghost" className="text-primary-700" data-testid={`kyc-profile-${r.id}`} onClick={() => onOpenProfile(r.user_id)}>
                          Full Profile
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openId && <KycDetail profileId={openId} onClose={() => setOpenId(null)} onChanged={() => { setOpenId(null); load(); }} />}
    </div>
  );
}

const DocLink = ({ label, url }) => (
  <div className="rounded-xl border border-slate-200 overflow-hidden">
    <div className="px-3 py-2 bg-slate-50 text-xs font-semibold text-slate-500">{label}</div>
    {url ? (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        {url.toLowerCase().endsWith(".pdf") ? (
          <div className="p-4 flex items-center gap-2 text-primary-600 text-sm"><FileText className="h-4 w-4" /> View PDF</div>
        ) : (
          <img src={url} alt={label} className="w-full h-40 object-cover" onError={(e) => { e.currentTarget.style.display = "none"; }} />
        )}
      </a>
    ) : <div className="p-4 text-xs text-slate-400">Not uploaded</div>}
  </div>
);

const Row = ({ k, v }) => (
  <div className="flex items-start justify-between gap-4 px-4 py-2.5 text-sm">
    <span className="text-slate-400">{k}</span>
    <span className="text-slate-800 font-medium text-right">{v || "—"}</span>
  </div>
);

function KycDetail({ profileId, onClose, onChanged }) {
  const [p, setP] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => { api.get(`/admin/partner-reg/kyc/${profileId}`).then((r) => setP(r.data)); }, [profileId]);

  const approve = async () => {
    setBusy(true);
    try { await api.post(`/admin/partner-reg/kyc/${profileId}/approve`); toast.success("Partner approved"); onChanged(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  const reject = async () => {
    if (!reason.trim()) return toast.error("Please provide a rejection reason");
    setBusy(true);
    try { await api.post(`/admin/partner-reg/kyc/${profileId}/reject`, { reason }); toast.success("Application rejected"); onChanged(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };

  const b = p?.basic || {}; const w = p?.work || {}; const d = p?.documents || {}; const a = p?.address || {};
  const ocr = d.aadhaar_ocr || {};
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" data-testid="kyc-detail">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary-600" /> KYC Review
            {p && <Badge className={`${STATUS_BADGE[p.status]} border-0 capitalize`}>{p.status.replace("_", " ")}</Badge>}
          </DialogTitle>
        </DialogHeader>
        {!p ? <div className="py-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary-600" /></div> : (
          <div className="space-y-4">
            <Section title="Basic Information" icon={Phone}>
              <Row k="Full Name" v={b.full_name} /><Row k="Date of Birth" v={b.dob} />
              <Row k="Mobile" v={b.mobile} /><Row k="Email" v={b.email} />
              <Row k="Education" v={b.education_name} />
              <Row k="Address" v={`${b.village ? b.village + ", " : ""}${b.city}, ${b.district}, ${b.state} - ${b.pincode}`} />
            </Section>
            <Section title="Work Details" icon={Briefcase}>
              {(w.categories || []).map((c, i) => <Row key={i} k={c.category_name} v={c.experience_label} />)}
            </Section>
            <Section title="Aadhaar & KYC" icon={FileText}>
              <Row k="Aadhaar Number" v={(d.aadhaar_number || "").replace(/(\d{4})(\d{4})(\d{4})/, "$1 $2 $3")} />
              <Row k="OCR Verified" v={ocr.matched ? "Yes ✓ (extracted matches)" : ocr.ocr_ran ? "No — mismatch" : "Not run"} />
              <div className="grid sm:grid-cols-2 gap-3 p-4 pt-2">
                <DocLink label="Aadhaar Front" url={d.aadhaar_front_url} />
                <DocLink label="Aadhaar Back" url={d.aadhaar_back_url} />
                {b.education_id && <DocLink label="Education Certificate" url={d.education_certificate_url} />}
              </div>
            </Section>
            <Section title="Address & Location" icon={MapPin}>
              <Row k="Address" v={a.manual_address} />
              <Row k="Location Address" v={a.location_address} />
              <Row k="Latitude" v={a.lat} /><Row k="Longitude" v={a.lng} />
              {a.lat && a.lng && (
                <div className="p-4 pt-2">
                  <a href={`https://www.google.com/maps?q=${a.lat},${a.lng}`} target="_blank" rel="noreferrer"
                    className="text-primary-600 text-sm hover:underline flex items-center gap-1"><MapPin className="h-4 w-4" /> Open in Google Maps</a>
                </div>
              )}
            </Section>

            {p.status === "rejected" && p.rejection_reason && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-600">
                <span className="font-semibold">Rejection reason: </span>{p.rejection_reason}
              </div>
            )}

            {p.status === "under_review" && (
              <div className="sticky bottom-0 bg-white border-t border-slate-100 pt-4">
                {!rejecting ? (
                  <div className="flex gap-3">
                    <Button data-testid="kyc-approve" onClick={approve} disabled={busy} className="flex-1 bg-emerald-600 hover:bg-emerald-700">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Approve</>}
                    </Button>
                    <Button data-testid="kyc-reject-open" onClick={() => setRejecting(true)} variant="outline" className="flex-1 border-red-200 text-red-600 hover:bg-red-50">
                      <XCircle className="h-4 w-4 mr-1" /> Reject
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea data-testid="kyc-reject-reason" value={reason} onChange={(e) => setReason(e.target.value)} rows={2}
                      placeholder="Reason for rejection (shown to partner)…"
                      className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:border-red-400" />
                    <div className="flex gap-2">
                      <Button data-testid="kyc-reject-confirm" onClick={reject} disabled={busy} className="flex-1 bg-red-600 hover:bg-red-700">
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Rejection"}
                      </Button>
                      <Button variant="outline" onClick={() => setRejecting(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

const Section = ({ title, icon: Ic, children }) => (
  <div className="rounded-2xl border border-slate-200 overflow-hidden">
    <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center gap-2">
      <Ic className="h-4 w-4 text-slate-400" /><p className="font-semibold text-slate-700 text-sm">{title}</p>
    </div>
    <div className="divide-y divide-slate-50">{children}</div>
  </div>
);

/* ---------------- Masters: Education & Experience ---------------- */
function MasterManager({ endpoint, labelKey, singular, testid }) {
  const [rows, setRows] = useState([]);
  const [val, setVal] = useState("");
  const load = useCallback(() => { api.get(`/admin/partner-reg/${endpoint}`).then((r) => setRows(r.data)); }, [endpoint]);
  useEffect(() => { load(); }, [load]);
  const add = async () => {
    if (!val.trim()) return;
    await api.post(`/admin/partner-reg/${endpoint}`, { [labelKey]: val.trim(), order: rows.length });
    toast.success(`${singular} added`); setVal(""); load();
  };
  const toggle = async (r) => {
    await api.put(`/admin/partner-reg/${endpoint}/${r.id}`, { ...r, status: r.status === "active" ? "inactive" : "active" });
    load();
  };
  const del = async (r) => { await api.delete(`/admin/partner-reg/${endpoint}/${r.id}`); toast.success("Deleted"); load(); };
  return (
    <div data-testid={testid}>
      <h1 className="font-heading font-extrabold text-2xl text-slate-900 mb-1">{singular} Options</h1>
      <p className="text-slate-500 text-sm mb-5">Only options created here appear to partners during registration.</p>
      <div className="flex gap-2 mb-5 max-w-md">
        <Input data-testid={`${testid}-input`} value={val} onChange={(e) => setVal(e.target.value)} placeholder={`Add ${singular.toLowerCase()}…`} onKeyDown={(e) => e.key === "Enter" && add()} />
        <Button data-testid={`${testid}-add`} onClick={add} className="bg-primary-700 hover:bg-primary-800"><Plus className="h-4 w-4 mr-1" /> Add</Button>
      </div>
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 max-w-2xl">
        {rows.length === 0 && <p className="p-6 text-center text-slate-400 text-sm">No options yet.</p>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between px-4 py-3">
            <span className="text-slate-800 font-medium">{r[labelKey]}</span>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5"><span className="text-xs text-slate-400">Active</span>
                <Switch checked={r.status === "active"} onCheckedChange={() => toggle(r)} /></div>
              <button onClick={() => del(r)} className="text-slate-300 hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const EducationManager = () => <MasterManager endpoint="educations" labelKey="name" singular="Education" testid="edu-manager" />;
export const ExperienceManager = () => <MasterManager endpoint="experiences" labelKey="label" singular="Experience" testid="exp-manager" />;

/* ---------------- Notifications & OCR config ---------------- */
export function NotificationConfig() {
  const [s, setS] = useState(null);
  const [fcmStatus, setFcmStatus] = useState({ configured: false });
  const [saJson, setSaJson] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get("/admin/settings").then((r) => setS(r.data.integrations || {}));
    api.get("/admin/partner-reg/fcm-config").then((r) => setFcmStatus(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (k, v) => setS((o) => ({ ...o, [k]: v }));
  const setWeb = (k, v) => setS((o) => ({ ...o, fcm_web_config: { ...(o.fcm_web_config || {}), [k]: v } }));

  const save = async () => {
    setBusy(true);
    try { await api.put("/admin/settings", { integrations: s }); toast.success("Settings saved"); }
    catch (e) { toast.error("Save failed"); } finally { setBusy(false); }
  };
  const saveSa = async () => {
    if (!saJson.trim()) return;
    setBusy(true);
    try { const { data } = await api.put("/admin/partner-reg/fcm-config", { service_account_json: saJson }); toast.success(`FCM configured: ${data.project_id}`); setSaJson(""); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Invalid JSON"); } finally { setBusy(false); }
  };

  if (!s) return <div className="py-16 grid place-items-center"><Loader2 className="h-6 w-6 animate-spin text-primary-600" /></div>;
  const web = s.fcm_web_config || {};
  return (
    <div data-testid="notification-config" className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-heading font-extrabold text-2xl text-slate-900">Notifications &amp; OCR</h1>
        <p className="text-slate-500 text-sm">Configure SMS, Push (FCM), Email and Aadhaar OCR. Channels activate automatically once keys are added.</p>
      </div>

      {/* OCR */}
      <Card title="Aadhaar OCR" note="Extracts the Aadhaar number from uploads and matches it to the entered number. Choose your AI provider and paste that provider's key — OCR starts working the moment a valid key is saved.">
        <ToggleRow label="Enable OCR" v={s.ocr_enabled} on={(v) => set("ocr_enabled", v)} />
        <Grid>
          <L label="AI Provider">
            <PremiumSelect value={s.ocr_provider || "emergent"} onChange={(e) => set("ocr_provider", e.target.value)}
              data-testid="ocr-provider-select" searchable={false}
              className="w-full rounded-lg">
              <option value="emergent">Emergent Universal LLM Key</option>
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic (Claude)</option>
            </PremiumSelect>
          </L>
          <L label="Model (optional)"><Input value={s.ocr_model || ""} onChange={(e) => set("ocr_model", e.target.value)}
            placeholder={{ emergent: "gemini-2.5-flash", gemini: "gemini-2.5-flash", openai: "gpt-4o", anthropic: "claude-3-5-sonnet-20241022" }[s.ocr_provider || "emergent"]} /></L>
        </Grid>
        <L label={{
          emergent: "Emergent Universal LLM Key (one key works for Gemini / OpenAI / Claude)",
          gemini: "Google Gemini API Key",
          openai: "OpenAI API Key",
          anthropic: "Anthropic (Claude) API Key",
        }[s.ocr_provider || "emergent"]}>
          <Input type="password" data-testid="ocr-api-key" value={s.ocr_api_key || ""} onChange={(e) => set("ocr_api_key", e.target.value)}
            placeholder={(s.ocr_provider || "emergent") === "emergent" ? "Leave blank to use the built-in platform key" : "Paste your provider API key"} />
        </L>
        <p className="text-[11px] text-slate-400 mt-1">Tip: with the <b>Emergent Universal LLM Key</b> you can leave the key blank to use the platform key. For a direct Gemini / OpenAI / Claude key, select that provider and paste the key here.</p>
      </Card>

      {/* Email */}
      <Card title="Email (SMTP)" note="Works with any SMTP provider (Gmail, SendGrid, SES, Zoho).">
        <ToggleRow label="Enable Email" v={s.email_enabled} on={(v) => set("email_enabled", v)} />
        <Grid>
          <L label="SMTP Host"><Input value={s.smtp_host || ""} onChange={(e) => set("smtp_host", e.target.value)} placeholder="smtp.gmail.com" /></L>
          <L label="Port"><Input value={s.smtp_port || 587} onChange={(e) => set("smtp_port", Number(e.target.value) || 587)} /></L>
          <L label="Username"><Input value={s.smtp_user || ""} onChange={(e) => set("smtp_user", e.target.value)} /></L>
          <L label="Password"><Input type="password" value={s.smtp_password || ""} onChange={(e) => set("smtp_password", e.target.value)} /></L>
          <L label="From Email"><Input value={s.smtp_from_email || ""} onChange={(e) => set("smtp_from_email", e.target.value)} /></L>
          <L label="From Name"><Input value={s.smtp_from_name || ""} onChange={(e) => set("smtp_from_name", e.target.value)} /></L>
        </Grid>
      </Card>

      {/* FCM Push */}
      <Card title="Push Notifications (Firebase FCM)" note={fcmStatus.configured ? `Service account configured · project: ${fcmStatus.project_id}` : "Service account not yet configured."}>
        <ToggleRow label="Enable Push" v={s.fcm_enabled} on={(v) => set("fcm_enabled", v)} />
        <p className="text-xs font-semibold text-slate-500 mt-2">Public Web Config (frontend init)</p>
        <Grid>
          <L label="apiKey"><Input value={web.apiKey || ""} onChange={(e) => setWeb("apiKey", e.target.value)} /></L>
          <L label="authDomain"><Input value={web.authDomain || ""} onChange={(e) => setWeb("authDomain", e.target.value)} /></L>
          <L label="projectId"><Input value={web.projectId || ""} onChange={(e) => setWeb("projectId", e.target.value)} /></L>
          <L label="storageBucket"><Input value={web.storageBucket || ""} onChange={(e) => setWeb("storageBucket", e.target.value)} /></L>
          <L label="messagingSenderId"><Input value={web.messagingSenderId || ""} onChange={(e) => setWeb("messagingSenderId", e.target.value)} /></L>
          <L label="appId"><Input value={web.appId || ""} onChange={(e) => setWeb("appId", e.target.value)} /></L>
        </Grid>
        <L label="VAPID Public Key"><Input value={s.fcm_vapid_key || ""} onChange={(e) => set("fcm_vapid_key", e.target.value)} /></L>
        <L label="Service Account JSON (stored encrypted)">
          <textarea data-testid="fcm-sa-json" value={saJson} onChange={(e) => setSaJson(e.target.value)} rows={4}
            placeholder="Paste the Firebase service-account JSON here…"
            className="w-full rounded-xl border border-slate-200 p-3 text-xs font-mono focus:outline-none focus:border-primary-400" />
        </L>
        <Button data-testid="fcm-sa-save" onClick={saveSa} disabled={busy} variant="outline" className="mt-1">
          <Save className="h-4 w-4 mr-1" /> Save &amp; Validate Service Account
        </Button>
      </Card>

      <div className="sticky bottom-0 bg-white/90 backdrop-blur py-3 border-t border-slate-100">
        <Button data-testid="notif-config-save" onClick={save} disabled={busy} className="bg-primary-700 hover:bg-primary-800">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Save Settings</>}
        </Button>
      </div>
    </div>
  );
}

const Card = ({ title, note, children }) => (
  <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-3">
    <div><p className="font-heading font-bold text-slate-800">{title}</p>{note && <p className="text-xs text-slate-400 mt-0.5">{note}</p>}</div>
    {children}
  </div>
);
const Grid = ({ children }) => <div className="grid sm:grid-cols-2 gap-3">{children}</div>;
const L = ({ label, children }) => <div><label className="block text-xs font-semibold text-slate-500 mb-1">{label}</label>{children}</div>;
const ToggleRow = ({ label, v, on }) => (
  <div className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
    <span className="text-sm font-medium text-slate-700">{label}</span>
    <Switch checked={!!v} onCheckedChange={on} />
  </div>
);
