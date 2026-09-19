import { useCallback, useEffect, useState } from "react";
import {
  ArrowLeft, Phone, Mail, MapPin, Calendar, Star, Wallet, Store, ShieldCheck,
  ShieldAlert, XCircle, CheckCircle2, Loader2, Lock, FileCheck2, CreditCard,
  User, Building2, Image as ImageIcon, FileText,
} from "lucide-react";
import api, { fmt, fmtC } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import MerchantBankKycAdmin from "@/pages/admin/MerchantBankKycAdmin";

const fmtDay = (s) => (s ? new Date(s).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");

const PField = ({ label, value }) => (
  <div>
    <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400">{label}</p>
    <p className="text-sm font-medium text-slate-800 dark:text-slate-100 mt-0.5 break-words">{value || "—"}</p>
  </div>
);

const isPdf = (u) => String(u || "").toLowerCase().split("?")[0].endsWith(".pdf");
const DocCard = ({ label, url, onZoom }) => (
  <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
    <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800/60 text-xs font-semibold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
      <ImageIcon className="h-3.5 w-3.5" /> {label}
    </div>
    {url ? (
      <button type="button" onClick={() => onZoom(url)} className="block w-full">
        {isPdf(url)
          ? <span className="w-full h-40 grid place-items-center bg-slate-50 dark:bg-slate-800/40 text-rose-500"><span className="flex flex-col items-center"><FileText className="h-10 w-10" /><span className="text-[11px] font-bold mt-1">View PDF</span></span></span>
          : <img src={url} alt={label} className="w-full h-40 object-cover" onError={(e) => { e.currentTarget.style.opacity = 0.3; }} />}
      </button>
    ) : (
      <div className="h-40 grid place-items-center text-slate-300 text-sm">Not uploaded</div>
    )}
  </div>
);

const TABS = [
  ["overview", "Overview", User],
  ["shop", "Shop", Store],
  ["documents", "KYC Documents", FileCheck2],
  ["bankkyc", "Bank & KYC", CreditCard],
];

export default function MerchantConsole({ userId, onBack }) {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState("overview");
  const [zoom, setZoom] = useState(null);
  const [kycReject, setKycReject] = useState(false);
  const [kycReason, setKycReason] = useState("");
  const [kycBusy, setKycBusy] = useState(false);

  const reload = useCallback(() => api.get(`/admin/merchants/${userId}/detail`).then((r) => setD(r.data)).catch(() => {}), [userId]);
  useEffect(() => { setD(null); reload(); }, [userId, reload]);

  const BackBar = (
    <button data-testid="mc-back" onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300 hover:text-primary-700 mb-4">
      <ArrowLeft className="h-4 w-4" /> Back to list
    </button>
  );
  if (!d) return <div data-testid="merchant-console">{BackBar}<div className="py-20 text-center text-slate-400">Loading merchant…</div></div>;

  const u = d.user || {};
  const basic = d.basic || {};
  const shop = d.shop || {};
  const addr = d.address || {};
  const docs = d.documents || {};
  const score = d.score?.score ?? d.completion_score ?? 0;
  const rejReason = u.kyc_rejection_reason || d.rejection_reason;
  const verified = u.kyc_status === "approved";

  const doKycApprove = async () => {
    setKycBusy(true);
    try { await api.post(`/admin/merchants/${userId}/kyc-action`, { action: "approve" }); toast.success("KYC approved"); setKycReject(false); setKycReason(""); reload(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed to approve"); } finally { setKycBusy(false); }
  };
  const doKycReject = async () => {
    if (!kycReason.trim()) { toast.error("Please add a rejection reason"); return; }
    setKycBusy(true);
    try { await api.post(`/admin/merchants/${userId}/kyc-action`, { action: "reject", reason: kycReason.trim() }); toast.success("KYC rejected"); setKycReject(false); setKycReason(""); reload(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed to reject"); } finally { setKycBusy(false); }
  };

  const shopName = u.shop_name || shop.shop_name || u.name || "Merchant";
  const initials = shopName.split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div data-testid="merchant-console">
      {BackBar}

      {/* ---- Header ---- */}
      <div className="rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 mb-5 shadow-sm">
        <div className="relative h-36 bg-gradient-to-br from-primary-700 via-fuchsia-600 to-sky-500">
          <div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, rgba(255,255,255,0.5) 0, transparent 45%), radial-gradient(circle at 80% 60%, rgba(255,255,255,0.35) 0, transparent 40%)" }} />
          <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "26px 26px" }} />
          <div className="absolute top-4 right-5 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 backdrop-blur px-3 py-1 text-white text-xs font-mono font-bold tracking-wide" data-testid="merchant-code">
              <Lock className="h-3 w-3" /> {u.merchant_code || "—"}
            </span>
          </div>
        </div>
        <div className="px-6 pb-5">
          <div className="-mt-14 flex flex-wrap items-end justify-between gap-4">
            <div className="relative shrink-0">
              <div className="h-24 w-24 rounded-2xl ring-4 ring-white dark:ring-slate-900 bg-gradient-to-br from-primary-600 to-primary-800 overflow-hidden grid place-items-center text-white text-3xl font-extrabold shadow-lg">
                {u.photo ? <img src={u.photo} alt="" className="h-full w-full object-cover" /> : initials}
              </div>
              <span className={`absolute -bottom-1 -right-1 h-6 w-6 rounded-full ring-2 ring-white dark:ring-slate-900 grid place-items-center ${verified ? "bg-emerald-500" : u.kyc_status === "rejected" ? "bg-red-500" : "bg-amber-500"}`}>
                {verified ? <ShieldCheck className="h-3.5 w-3.5 text-white" /> : <ShieldAlert className="h-3.5 w-3.5 text-white" />}
              </span>
            </div>
          </div>
          <div className="mt-4">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">{shopName}</h1>
              <Badge className="bg-primary-50 text-primary-700 border-0 capitalize dark:bg-primary-900/30 dark:text-primary-300">merchant</Badge>
              {verified
                ? <Badge className="bg-emerald-100 text-emerald-700 border-0">KYC approved</Badge>
                : <Badge className={`border-0 ${u.kyc_status === "rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>KYC {(u.kyc_status || "pending").replace("_", " ")}</Badge>}
              {shop.shop_type_name && <Badge className="bg-slate-100 text-slate-600 border-0">{shop.shop_type_name}</Badge>}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="flex items-center gap-1"><User className="h-4 w-4" />{basic.full_name || u.name || "—"}</span>
              <span className="flex items-center gap-1"><Phone className="h-4 w-4" />{u.phone}</span>
              {(u.email || basic.email) && <span className="flex items-center gap-1"><Mail className="h-4 w-4" />{u.email || basic.email}</span>}
              {(addr.city || addr.state || u.city) && <span className="flex items-center gap-1"><MapPin className="h-4 w-4" />{[addr.city || u.city, addr.state || u.state].filter(Boolean).join(", ")}</span>}
              <span className="flex items-center gap-1"><Calendar className="h-4 w-4" />Joined {fmtDay(u.created_at)}</span>
            </div>
          </div>
          {/* stat chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
            <div className="rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 px-4 py-3">
              <div className="flex items-center gap-1.5 text-amber-600"><Star className="h-4 w-4 fill-amber-400 text-amber-400" /><span className="text-[11px] uppercase tracking-wider font-bold">Rating</span></div>
              <p className="font-heading font-extrabold text-xl text-slate-900 dark:text-white mt-0.5">{u.rating ?? 5}</p>
            </div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-100 dark:border-emerald-900/30 px-4 py-3">
              <div className="flex items-center gap-1.5 text-emerald-600"><Wallet className="h-4 w-4" /><span className="text-[11px] uppercase tracking-wider font-bold">Wallet</span></div>
              <p className="font-heading font-extrabold text-xl text-slate-900 dark:text-white mt-0.5 truncate" title={fmt(u.wallet_balance || 0)}>{fmtC(u.wallet_balance || 0)}</p>
            </div>
            <div className="rounded-xl bg-primary-50 dark:bg-primary-900/10 border border-primary-100 dark:border-primary-900/30 px-4 py-3">
              <div className="flex items-center gap-1.5 text-primary-600"><Building2 className="h-4 w-4" /><span className="text-[11px] uppercase tracking-wider font-bold">Profile</span></div>
              <p className="font-heading font-extrabold text-xl text-slate-900 dark:text-white mt-0.5">{score}%</p>
            </div>
            <div className="rounded-xl bg-sky-50 dark:bg-sky-900/10 border border-sky-100 dark:border-sky-900/30 px-4 py-3">
              <div className="flex items-center gap-1.5 text-sky-600"><ShieldCheck className="h-4 w-4" /><span className="text-[11px] uppercase tracking-wider font-bold">Status</span></div>
              <p className="font-heading font-extrabold text-xl capitalize text-slate-900 dark:text-white mt-0.5">{verified ? "Verified" : (u.kyc_status || "pending").replace("_", " ")}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Banners ---- */}
      {u.kyc_status === "rejected" && rejReason && (
        <div className="rounded-xl border border-red-200 dark:border-red-900/40 bg-red-50 dark:bg-red-900/10 p-4 mb-4 flex items-start gap-2" data-testid="mc-reject-banner">
          <XCircle className="h-5 w-5 text-red-600 mt-0.5" />
          <div className="text-sm"><p className="font-semibold text-red-700">KYC rejected</p><p className="text-red-600/90">{rejReason}</p></div>
        </div>
      )}

      {/* ---- KYC decision bar ---- */}
      {u.kyc_status !== "approved" && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-900/10 p-4 mb-4" data-testid="mc-kyc-action-bar">
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-5 w-5 text-amber-600" />
            <p className="font-heading font-bold text-slate-800 dark:text-white">
              {u.kyc_status === "rejected" ? "KYC rejected — you can re-approve or update the decision" : "KYC pending — approve or reject this merchant"}
            </p>
          </div>
          {!kycReject ? (
            <div className="flex flex-wrap gap-3">
              <Button data-testid="mc-kyc-approve" onClick={doKycApprove} disabled={kycBusy} className="flex-1 min-w-[140px] bg-emerald-600 hover:bg-emerald-700">
                {kycBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <><CheckCircle2 className="h-4 w-4 mr-1" /> Approve KYC</>}
              </Button>
              <Button data-testid="mc-kyc-reject-open" onClick={() => setKycReject(true)} disabled={kycBusy} variant="outline" className="flex-1 min-w-[140px] border-red-200 text-red-600 hover:bg-red-50">
                <XCircle className="h-4 w-4 mr-1" /> Reject
              </Button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea data-testid="mc-kyc-reason" value={kycReason} onChange={(e) => setKycReason(e.target.value)} rows={2}
                placeholder="Reason for rejection (shown to the merchant in their panel)…"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 dark:bg-slate-900 p-3 text-sm focus:outline-none focus:border-red-400" />
              <div className="flex gap-2">
                <Button data-testid="mc-kyc-reject-confirm" onClick={doKycReject} disabled={kycBusy} className="flex-1 bg-red-600 hover:bg-red-700">
                  {kycBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Rejection"}
                </Button>
                <Button variant="outline" onClick={() => { setKycReject(false); setKycReason(""); }}>Cancel</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ---- Tabs ---- */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-5 border-b border-slate-200 dark:border-slate-800">
        {TABS.map(([key, label, Icon]) => (
          <button key={key} data-testid={`mctab-${key}`} onClick={() => setTab(key)}
            className={`shrink-0 flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === key ? "border-primary-600 text-primary-700 dark:text-primary-300" : "border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"}`}>
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {/* ---- OVERVIEW ---- */}
      {tab === "overview" && (
        <div className="grid lg:grid-cols-2 gap-6" data-testid="mctab-overview">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <h3 className="font-heading font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2"><User className="h-5 w-5 text-primary-700" /> Owner Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <PField label="Owner Name" value={basic.full_name || u.name} />
              <PField label="Date of Birth" value={basic.dob} />
              <PField label="Gender" value={basic.gender} />
              <PField label="Mobile" value={u.phone} />
              <PField label="Email" value={u.email || basic.email} />
              <PField label="Merchant Code" value={u.merchant_code} />
            </div>
          </div>
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <h3 className="font-heading font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2"><MapPin className="h-5 w-5 text-primary-700" /> Shop Address</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2"><PField label="Full Address" value={addr.manual_address} /></div>
              <PField label="City" value={addr.city} />
              <PField label="District" value={addr.district} />
              <PField label="State" value={addr.state} />
              <PField label="Pincode" value={addr.pincode} />
              <div className="col-span-2"><PField label="GPS" value={addr.lat ? `${Number(addr.lat).toFixed(5)}, ${Number(addr.lng).toFixed(5)}` : "—"} /></div>
            </div>
          </div>
        </div>
      )}

      {/* ---- SHOP ---- */}
      {tab === "shop" && (
        <div className="space-y-6" data-testid="mctab-shop">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <h3 className="font-heading font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2"><Store className="h-5 w-5 text-primary-700" /> Shop Details</h3>
            <div className="grid grid-cols-2 gap-4">
              <PField label="Shop Name" value={shop.shop_name || u.shop_name} />
              <PField label="Shop Type" value={shop.shop_type_name || u.shop_type} />
              <PField label="Trade License No." value={shop.license_number} />
              <div className="col-span-2">
                <p className="text-[11px] uppercase tracking-wider font-bold text-slate-400 mb-1">Categories Served</p>
                <div className="flex flex-wrap gap-1.5">
                  {(shop.categories || []).length === 0 && <span className="text-sm text-slate-400">—</span>}
                  {(shop.categories || []).map((c, i) => <Badge key={i} className="bg-primary-50 text-primary-700 border-0">{c.category_name}</Badge>)}
                </div>
              </div>
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <DocCard label="Shop — Exterior" url={shop.photo_exterior} onZoom={setZoom} />
            <DocCard label="Shop — Interior" url={shop.photo_interior} onZoom={setZoom} />
            <DocCard label="License / Certificate" url={shop.license_url} onZoom={setZoom} />
          </div>
        </div>
      )}

      {/* ---- DOCUMENTS ---- */}
      {tab === "documents" && (
        <div className="space-y-6" data-testid="mctab-documents">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <h3 className="font-heading font-bold mb-4 text-slate-900 dark:text-white flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-primary-700" /> KYC Documents</h3>
            <div className="grid grid-cols-2 gap-4">
              <PField label="PAN Number" value={docs.pan_number} />
              <PField label="GST Number" value={docs.gst_number} />
              <PField label="Aadhaar Number" value={docs.aadhaar_number} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <DocCard label="PAN Card" url={docs.pan_url} onZoom={setZoom} />
            <DocCard label="GST Certificate" url={docs.gst_url} onZoom={setZoom} />
          </div>
        </div>
      )}

      {/* ---- BANK ---- */}
      {tab === "bankkyc" && (
        <MerchantBankKycAdmin userId={userId} onZoom={setZoom} />
      )}

      {/* ---- Zoom modal ---- */}
      {zoom && (
        <div className="fixed inset-0 z-50 bg-black/80 grid place-items-center p-6" onClick={() => setZoom(null)}>
          {isPdf(zoom)
            ? <iframe title="document" src={zoom} className="w-full max-w-4xl h-[85vh] rounded-xl bg-white" onClick={(e) => e.stopPropagation()} />
            : <img src={zoom} alt="" className="max-h-[85vh] max-w-full rounded-xl shadow-2xl" />}
        </div>
      )}
    </div>
  );
}
