import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Star, Wallet, Phone, Mail, MapPin, Package, ShieldCheck, Store, Wrench, User as UserIcon } from "lucide-react";
import api, { fmt } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

const SC = { completed: "bg-emerald-100 text-emerald-700", paid: "bg-emerald-100 text-emerald-700", searching: "bg-amber-100 text-amber-700", assigned: "bg-blue-100 text-blue-700", started: "bg-indigo-100 text-indigo-700", cancelled: "bg-red-100 text-red-700" };
const RoleIcon = { customer: UserIcon, partner: Wrench, merchant: Store, admin: ShieldCheck };

export default function UserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [d, setD] = useState(null);
  useEffect(() => { api.get(`/admin/users/${id}/detail`).then((r) => setD(r.data)).catch(() => {}); }, [id]);
  if (!d) return <div className="min-h-screen flex items-center justify-center text-slate-400">Loading…</div>;
  const u = d.user;
  const Icon = RoleIcon[u.role] || UserIcon;
  const Field = ({ label, value }) => value ? <div><p className="text-xs font-bold uppercase tracking-wider text-slate-400">{label}</p><p className="text-slate-800 mt-0.5">{value}</p></div> : null;

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center gap-3">
          <button data-testid="ud-back" onClick={() => navigate("/admin")} className="text-slate-500 hover:text-primary-700"><ArrowLeft className="h-5 w-5" /></button>
          <span className="font-heading font-extrabold text-lg text-slate-900">Customer 360°</span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8" data-testid="user-detail-page">
        {/* profile header */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 flex items-center gap-5 mb-6">
          <div className="h-20 w-20 rounded-2xl bg-primary-700 flex items-center justify-center text-white">
            {u.photo ? <img src={u.photo} alt="" className="h-full w-full object-cover rounded-2xl" /> : <Icon className="h-9 w-9" />}
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h1 className="font-heading font-extrabold text-2xl text-slate-900">{u.shop_name || u.name}</h1>
              <Badge className="bg-primary-50 text-primary-700 border-0 capitalize">{u.role}</Badge>
              {u.kyc_status && u.kyc_status !== "na" && <Badge className={`border-0 ${u.kyc_status === "approved" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>KYC {u.kyc_status}</Badge>}
            </div>
            <div className="flex flex-wrap gap-4 mt-2 text-sm text-slate-500">
              <span className="flex items-center gap-1"><Phone className="h-4 w-4" />{u.phone}</span>
              {u.email && <span className="flex items-center gap-1"><Mail className="h-4 w-4" />{u.email}</span>}
              {u.role === "partner" && <span className="flex items-center gap-1"><Star className="h-4 w-4 fill-amber-400 text-amber-400" />{u.rating} · {u.jobs_completed} jobs</span>}
            </div>
          </div>
          <div className="text-right"><p className="text-xs uppercase tracking-wider font-bold text-slate-400">Wallet</p><p className="font-heading font-extrabold text-2xl text-slate-900">{fmt(u.wallet_balance)}</p></div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* profile fields */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6">
            <h2 className="font-heading font-bold text-lg mb-4">Profile Details</h2>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Name" value={u.name} />
              <Field label="Gender" value={u.gender} />
              <Field label="Language" value={u.language} />
              <Field label="Alt. Mobile" value={u.alternate_mobile} />
              {u.role === "partner" && <Field label="Skills" value={(u.skills || []).join(", ")} />}
              {u.role === "merchant" && <Field label="Shop Type" value={u.shop_type} />}
              <Field label="Joined" value={new Date(u.created_at).toLocaleDateString()} />
            </div>
            <h3 className="font-heading font-bold text-sm mt-6 mb-3 flex items-center gap-1"><MapPin className="h-4 w-4 text-primary-700" /> Addresses ({(u.addresses || []).length})</h3>
            {(u.addresses || []).length === 0 && <p className="text-sm text-slate-400">No saved addresses</p>}
            {(u.addresses || []).map((a) => <div key={a.id} className="text-sm text-slate-600 border border-slate-100 rounded-lg p-3 mb-2"><b>{a.label}</b> · {a.line}, {a.city} {a.pincode}</div>)}
          </div>

          {/* bookings + txns */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="font-heading font-bold text-lg mb-4 flex items-center gap-2"><Package className="h-5 w-5 text-primary-700" /> Bookings ({d.bookings.length})</h2>
              {d.bookings.length === 0 && <p className="text-sm text-slate-400">No bookings</p>}
              <div className="space-y-2">
                {d.bookings.slice(0, 12).map((b) => (
                  <div key={b.id} className="flex items-center justify-between border border-slate-100 rounded-lg p-3">
                    <div><p className="font-medium text-slate-800 text-sm">{b.service_name} <span className="text-xs text-slate-400">#{b.code}</span></p><p className="text-xs text-slate-400">{new Date(b.created_at).toLocaleDateString()}</p></div>
                    <div className="flex items-center gap-3"><Badge className={`border-0 capitalize ${SC[b.status] || "bg-slate-100 text-slate-600"}`}>{b.status.replace(/_/g, " ")}</Badge><span className="font-semibold text-sm">{fmt(b.pricing.total)}</span></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-6">
              <h2 className="font-heading font-bold text-lg mb-4 flex items-center gap-2"><Wallet className="h-5 w-5 text-primary-700" /> Transactions ({d.transactions.length})</h2>
              {d.transactions.length === 0 && <p className="text-sm text-slate-400">No transactions</p>}
              <div className="space-y-2">
                {d.transactions.slice(0, 12).map((t) => (
                  <div key={t.id} className="flex items-center justify-between border border-slate-100 rounded-lg p-3">
                    <div><p className="font-medium text-slate-800 text-sm capitalize">{t.kind}</p><p className="text-xs text-slate-400">{t.note}</p></div>
                    <span className={`font-semibold text-sm ${t.type === "credit" ? "text-emerald-600" : "text-slate-700"}`}>{t.type === "credit" ? "+" : "-"}{fmt(t.amount)}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
