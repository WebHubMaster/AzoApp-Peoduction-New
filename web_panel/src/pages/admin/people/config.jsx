/* Per-role configuration for the People module (lists, filters, KPIs, profile tabs). */
import { Users, Wrench, Store, Wallet, ShoppingBag, Star, Wifi, ShieldCheck, TrendingUp, UserPlus, Bell, Network, IndianRupee, CheckCircle2, Crown } from "lucide-react";
import { Avatar, Pill, TierPill, Progress, money, dt, rel } from "./ui";

const Name = ({ r, sub, code }) => (
  <div className="flex items-center gap-3 min-w-0">
    <Avatar name={r.name || r.shop_name} src={r.photo} size={36} dot={r.profile_update_unreviewed} />
    <div className="min-w-0">
      <div className="flex items-center gap-1.5 min-w-0">
        <span className="font-semibold text-slate-900 dark:text-white truncate" data-testid="row-name">{r.name || "—"}</span>
        {r.premium_partner && <span data-testid="row-pro-badge" title="AzoApp Pro partner" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold text-white bg-gradient-to-r from-amber-500 to-orange-500 shrink-0"><Crown className="h-2.5 w-2.5" />PRO</span>}
        {r.profile_update_unreviewed && <span className="text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-900/30 rounded px-1 py-0.5 shrink-0">Updated {rel(r.profile_updated_at)}</span>}
      </div>
      <p className="text-[11px] text-slate-400 truncate font-mono">{code || sub}</p>
    </div>
  </div>
);
const Contact = ({ r }) => <div className="text-xs leading-tight"><p className="font-medium text-slate-700 dark:text-slate-200">{r.phone || "—"}</p>{r.email && <p className="text-slate-400 truncate max-w-[180px]">{r.email}</p>}</div>;
const Chips = ({ items = [], max = 3 }) => items.length ? <div className="flex flex-wrap gap-1 max-w-[220px]">{items.slice(0, max).map((s) => <span key={s} className="px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 capitalize">{s}</span>)}{items.length > max && <span className="text-[11px] text-slate-400">+{items.length - max}</span>}</div> : <span className="text-slate-300">—</span>;
const Status = ({ r }) => <div className="flex flex-col gap-1 items-start"><Pill s={r.status_label || r.status || "active"} />{r.is_guest && <Pill s="guest" size="xs" />}</div>;
const Joined = ({ r }) => <div className="text-xs"><p className="text-slate-700 dark:text-slate-200">{dt(r.created_at, false)}</p><p className="text-slate-400">{rel(r.created_at)}</p></div>;
const LastAct = ({ r }) => <span className="text-xs text-slate-600 dark:text-slate-300" title={dt(r.last_activity_at)}>{rel(r.last_activity_at)}</span>;
const Bk = ({ r }) => <div className="text-right"><p className="font-semibold text-slate-800 dark:text-slate-100">{r.bookings_count ?? 0}</p><p className="text-[11px] text-slate-400">{r.completed_count ?? 0} done · {r.active_count ?? 0} live</p></div>;

const DATE = (label, fk, tk) => ({ type: "date", label, from: fk, to: tk });
const RANGE = (label, a, b, prefix = "") => ({ type: "range", label, min: a, max: b, prefix });
const SEL = (label, key, opts) => ({ type: "select", label, key, options: opts });
const PROFILE_UPD = SEL("Profile update status", "profile_update", [{ value: "unread", label: "Unreviewed updates" }, { value: "any", label: "Has updated profile" }, { value: "none", label: "Never updated" }]);
const STATUS = SEL("Status", "status", [{ value: "active", label: "Active" }, { value: "blocked", label: "Blocked" }, { value: "suspended", label: "Suspended" }]);

export const ROLE_CONFIG = {
  customer: {
    title: "Customers", singular: "Customer", icon: Users, color: "primary",
    searchHint: "Search name, phone, email, customer ID or booking code…",
    kpis: (k) => [
      { icon: Users, label: "Total customers", value: k.total, sub: `${k.new_30d ?? 0} new in 30d`, tone: "primary" },
      { icon: ShoppingBag, label: "Bookings", value: k.bookings, sub: `${k.completed ?? 0} completed · ${k.active_bookings ?? 0} active`, tone: "sky" },
      { icon: IndianRupee, label: "Lifetime GMV", value: money(k.gmv), sub: `AOV ${money(k.avg_order_value)}`, tone: "emerald" },
      { icon: Wallet, label: "Wallet float", value: money(k.wallet_total), sub: `${k.with_bookings ?? 0} with bookings`, tone: "violet" },
      { icon: Bell, label: "Profile updates", value: k.unread_updates, sub: "awaiting review", tone: k.unread_updates ? "rose" : "slate" },
    ],
    columns: [
      { key: "name", label: "Customer", sortKey: "name", render: (r) => <Name r={r} sub={`ID ${String(r.id).slice(0, 8)}`} /> },
      { key: "phone", label: "Contact", render: (r) => <Contact r={r} /> },
      { key: "tier", label: "Tier", render: (r) => <TierPill tier={r.tier} label={r.tier_label} /> },
      { key: "city", label: "City", sortKey: "city", render: (r) => r.city || <span className="text-slate-300">—</span> },
      { key: "bookings", label: "Bookings", sortKey: "bookings", align: "right", render: (r) => <Bk r={r} /> },
      { key: "spent", label: "Total spent", sortKey: "spent", align: "right", render: (r) => <span className="font-semibold">{money(r.total_spent)}</span> },
      { key: "wallet", label: "Wallet", sortKey: "wallet", align: "right", render: (r) => money(r.wallet_balance) },
      { key: "status", label: "Status", render: (r) => <Status r={r} /> },
      { key: "joined", label: "Joined", sortKey: "created_at", render: (r) => <Joined r={r} />, hideMobile: true },
      { key: "last", label: "Last activity", sortKey: "last_active", render: (r) => <LastAct r={r} /> },
    ],
    filters: (f) => [STATUS, SEL("Tier", "tier", (f.tiers || []).map((t) => ({ value: t.key, label: t.label }))), SEL("City", "city", f.cities || []),
      RANGE("Bookings", "min_bookings", "max_bookings"), RANGE("Spend (₹)", "min_spent", "max_spent", "₹"), RANGE("Wallet (₹)", "min_wallet", "max_wallet", "₹"),
      DATE("Joined date", "joined_from", "joined_to"), DATE("Last activity", "active_from", "active_to"), PROFILE_UPD],
  },
  partner: {
    title: "Partners", singular: "Partner", icon: Wrench, color: "emerald",
    searchHint: "Search name, phone, partner code or email…",
    kpis: (k) => [
      { icon: Wrench, label: "Total partners", value: k.total, sub: `${k.new_30d ?? 0} new in 30d`, tone: "primary" },
      { icon: Wifi, label: "Online now", value: k.online, sub: `${(k.total || 0) - (k.online || 0)} offline`, tone: "emerald" },
      { icon: ShieldCheck, label: "KYC approved", value: k.kyc_approved, sub: `${k.kyc_pending ?? 0} pending`, tone: "sky" },
      { icon: Star, label: "Avg rating", value: k.avg_rating, sub: `${k.completed ?? 0} jobs completed`, tone: "amber" },
      { icon: TrendingUp, label: "Partner earnings", value: money(k.total_earned), sub: `wallet ${money(k.wallet_total)}`, tone: "violet" },
      { icon: Bell, label: "Profile updates", value: k.unread_updates, sub: "awaiting review", tone: k.unread_updates ? "rose" : "slate" },
    ],
    columns: [
      { key: "name", label: "Partner", sortKey: "name", render: (r) => <Name r={r} code={r.partner_code || `ID ${String(r.id).slice(0, 8)}`} /> },
      { key: "phone", label: "Contact", render: (r) => <Contact r={r} /> },
      { key: "city", label: "City", sortKey: "city", render: (r) => r.city || r.service_area_name || <span className="text-slate-300">—</span> },
      { key: "skills", label: "Skills", render: (r) => <Chips items={r.skills} />, nowrap: false },
      { key: "rating", label: "Rating", sortKey: "rating", render: (r) => <span className="inline-flex items-center gap-1 font-semibold"><Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" />{r.rating ?? "—"}</span> },
      { key: "online", label: "Availability", render: (r) => <Pill s={r.is_online ? "online" : "offline"}><span className={`h-1.5 w-1.5 rounded-full ${r.is_online ? "bg-emerald-500" : "bg-slate-400"}`} />{r.is_online ? "Online" : "Offline"}</Pill> },
      { key: "kyc", label: "KYC", sortKey: "kyc", render: (r) => <Pill s={r.kyc_status || "pending"} /> },
      { key: "completion", label: "Profile", render: (r) => <Progress v={r.profile_completion ?? 0} className="w-28" /> },
      { key: "jobs", label: "Jobs", sortKey: "bookings", align: "right", render: (r) => <Bk r={r} /> },
      { key: "earned", label: "Earned", sortKey: "earned", align: "right", render: (r) => <div className="text-right"><p className="font-semibold">{money(r.total_earned)}</p><p className="text-[11px] text-slate-400">wallet {money(r.wallet_balance)}</p></div> },
      { key: "status", label: "Status", render: (r) => <Status r={r} /> },
      { key: "joined", label: "Joined", sortKey: "created_at", render: (r) => <Joined r={r} />, hideMobile: true },
      { key: "last", label: "Last activity", sortKey: "last_active", render: (r) => <LastAct r={r} /> },
    ],
    filters: (f) => [STATUS, SEL("KYC status", "kyc", f.kyc_statuses || []), SEL("Availability", "online", [{ value: "online", label: "Online" }, { value: "offline", label: "Offline" }]),
      SEL("City", "city", f.cities || []), SEL("Skill", "skill", f.skills || []), RANGE("Rating (min)", "min_rating", null),
      RANGE("Jobs", "min_bookings", "max_bookings"), DATE("Joined date", "joined_from", "joined_to"), DATE("Last activity", "active_from", "active_to"), PROFILE_UPD],
  },
  merchant: {
    title: "Merchants", singular: "Merchant", icon: Store, color: "violet",
    searchHint: "Search shop, owner, phone, merchant code or email…",
    kpis: (k) => [
      { icon: Store, label: "Total merchants", value: k.total, sub: `${k.new_30d ?? 0} new in 30d`, tone: "primary" },
      { icon: ShieldCheck, label: "KYC approved", value: k.kyc_approved, sub: `${k.verified ?? 0} verified`, tone: "emerald" },
      { icon: Network, label: "Referred partners", value: k.network_partners, sub: "across network", tone: "sky" },
      { icon: ShoppingBag, label: "Bookings", value: k.bookings, sub: `${k.completed ?? 0} completed`, tone: "amber" },
      { icon: TrendingUp, label: "Merchant earnings", value: money(k.total_earned), sub: `wallet ${money(k.wallet_total)}`, tone: "violet" },
      { icon: Bell, label: "Profile updates", value: k.unread_updates, sub: "awaiting review", tone: k.unread_updates ? "rose" : "slate" },
    ],
    columns: [
      { key: "name", label: "Shop / Owner", sortKey: "name", render: (r) => <div className="flex items-center gap-3 min-w-0"><Avatar name={r.shop_name || r.name} src={r.photo} size={36} dot={r.profile_update_unreviewed} /><div className="min-w-0"><div className="flex items-center gap-1.5"><span className="font-semibold text-slate-900 dark:text-white truncate" data-testid="row-name">{r.shop_name || r.name}</span>{r.verified_merchant && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}{r.profile_update_unreviewed && <span className="text-[10px] font-bold text-red-600 bg-red-50 dark:bg-red-900/30 rounded px-1 py-0.5">Updated {rel(r.profile_updated_at)}</span>}</div><p className="text-[11px] text-slate-400 truncate">{r.name}</p></div></div> },
      { key: "code", label: "Merchant code", render: (r) => <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-200">{r.merchant_code || "—"}</span> },
      { key: "phone", label: "Contact", render: (r) => <Contact r={r} /> },
      { key: "city", label: "City", sortKey: "city", render: (r) => r.city || <span className="text-slate-300">—</span> },
      { key: "shop_type", label: "Shop type", render: (r) => r.shop_type || <span className="text-slate-300">—</span> },
      { key: "categories", label: "Categories", render: (r) => <Chips items={r.categories || r.skills} />, nowrap: false },
      { key: "kyc", label: "KYC", sortKey: "kyc", render: (r) => <Pill s={r.kyc_status || "pending"} /> },
      { key: "completion", label: "Profile", render: (r) => <Progress v={r.profile_completion ?? 0} className="w-28" /> },
      { key: "bookings", label: "Bookings", sortKey: "bookings", align: "right", render: (r) => <Bk r={r} /> },
      { key: "earned", label: "Earned", sortKey: "earned", align: "right", render: (r) => <div className="text-right"><p className="font-semibold">{money(r.total_earned)}</p><p className="text-[11px] text-slate-400">wallet {money(r.wallet_balance)}</p></div> },
      { key: "status", label: "Status", render: (r) => <Status r={r} /> },
      { key: "joined", label: "Joined", sortKey: "created_at", render: (r) => <Joined r={r} />, hideMobile: true },
      { key: "last", label: "Last activity", sortKey: "last_active", render: (r) => <LastAct r={r} /> },
    ],
    filters: (f) => [SEL("KYC status", "kyc", f.kyc_statuses || []), SEL("Verification", "verified", [{ value: "yes", label: "Verified" }, { value: "no", label: "Not verified" }]), STATUS,
      SEL("City", "city", f.cities || []), SEL("Shop type", "shop_type", f.shop_types || []), SEL("Category", "category", (f.service_categories || []).map((c) => ({ value: c.slug, label: c.name }))),
      DATE("Joined date", "joined_from", "joined_to"), DATE("Last activity", "active_from", "active_to"), PROFILE_UPD],
  },
};
export const KPI_ICONS = { UserPlus };
