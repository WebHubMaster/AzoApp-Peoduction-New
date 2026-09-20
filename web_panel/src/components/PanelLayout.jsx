import { useNavigate } from "react-router-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/context/AuthContext";
import { useSiteConfig } from "@/context/SiteConfigContext";
import { useTheme } from "@/context/ThemeContext";
import api, { mediaSrc } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { openPushPrompt, usePushDeviceState } from "@/components/PushRegistrar";
import { useRealtime } from "@/context/RealtimeContext";
import {
  LogOut, Search, Sun, Moon, Bell, BellRing, BellOff, ChevronDown, ChevronRight,
  Star, Menu, X, PanelLeftClose, PanelLeftOpen, Folder,
  User as UserIcon, Camera, Save, MoreHorizontal, ShieldCheck,
} from "lucide-react";
import ProfilePhotoPicker from "@/components/common/ProfilePhotoPicker";

const applyTheme = (mode) => {
  const root = document.documentElement;
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", dark);
};

const ThemeToggle = () => {
  const [mode, setMode] = useState(() => localStorage.getItem("azo_theme") || "light");
  useEffect(() => { applyTheme(mode); localStorage.setItem("azo_theme", mode); }, [mode]);
  const toggle = () => {
    const root = document.documentElement;
    root.classList.add("theme-anim");
    window.setTimeout(() => root.classList.remove("theme-anim"), 450);
    setMode((m) => (m === "dark" ? "light" : "dark"));
  };
  const isDark = mode === "dark";
  return (
    <button data-testid="theme-toggle" onClick={toggle} aria-label="Toggle theme"
      className="relative h-9 w-9 rounded-xl border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 overflow-hidden active:scale-95 transition-all">
      <Sun className={`h-4 w-4 absolute transition-all duration-300 ${isDark ? "opacity-0 -rotate-90 scale-50" : "opacity-100 rotate-0 scale-100"}`} />
      <Moon className={`h-4 w-4 absolute transition-all duration-300 ${isDark ? "opacity-100 rotate-0 scale-100" : "opacity-0 rotate-90 scale-50"}`} />
    </button>
  );
};

const GlobalSearch = ({ onNavigate }) => {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [open, setOpen] = useState(false);
  const box = useRef();
  useEffect(() => {
    const t = setTimeout(() => { if (q.trim().length >= 2) api.get(`/admin/search?q=${encodeURIComponent(q)}`).then((r) => { setRes(r.data); setOpen(true); }).catch(() => {}); else setRes(null); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  useEffect(() => { const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const go = (type) => { const map = { user: "customers", service: "services", category: "categories", subcategory: "subcategories", booking: "bookings", coupon: "coupons", transaction: "ledger" }; onNavigate?.(map[type] || "dashboard"); setOpen(false); setQ(""); };
  return (
    <div className="relative flex-1" ref={box}>
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <input data-testid="global-search" value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => res && setOpen(true)}
        placeholder="Search users, services, bookings…"
        className="w-full h-10 pl-9 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-200 focus:bg-white dark:focus:bg-slate-800" />
      {open && res && (
        <div className="absolute top-11 left-0 right-0 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-96 overflow-y-auto z-50 p-2">
          {(res.groups || []).length === 0 && <p className="text-sm text-slate-400 px-3 py-4 text-center">No results for {res.query}</p>}
          {(res.groups || []).map((g) => (
            <div key={g.collection} className="mb-1">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 pt-2 pb-1">{g.type} ({g.count})</p>
              {g.results.map((r) => (
                <button key={r.id} onClick={() => go(g.type)} className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-sm text-slate-700 dark:text-slate-200 truncate">
                  {r.name || r.code || r.title || r.note || r.id}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PushPermissionRow = () => {
  const { perm } = usePushDeviceState();
  if (perm === "unsupported") return null;
  const granted = perm === "granted";
  const blocked = perm === "denied";
  // Once the browser permission is granted we treat alerts as ON — the device is
  // (re)subscribed silently in the background, so we never nag the user again.
  return (
    <div data-testid="push-permission-row" className={`px-4 py-2.5 flex items-center gap-2 text-xs border-b border-slate-100 dark:border-slate-700 ${granted ? "bg-emerald-50/60 dark:bg-emerald-900/10" : "bg-amber-50/70 dark:bg-amber-900/10"}`}>
      {granted ? <BellRing className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> : <BellOff className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
      <span className="flex-1 min-w-0 truncate text-slate-600 dark:text-slate-300">
        {granted ? "Device alerts: On" : blocked ? "Device alerts: Blocked in browser" : "Device alerts: Off"}
      </span>
      {!granted && (
        <button data-testid="push-permission-enable" onClick={openPushPrompt}
          className="shrink-0 font-semibold text-primary-700 dark:text-primary-300 hover:underline">
          {blocked ? "Fix" : "Enable"}
        </button>
      )}
    </div>
  );
};

const PartnerAlertsReminder = ({ role }) => {
  const { perm } = usePushDeviceState();
  const [hidden, setHidden] = useState(() => sessionStorage.getItem("azo_alerts_banner_hidden") === "1");
  // Show ONLY when the user still needs to act (permission not yet granted or blocked).
  // Once granted, the device is subscribed in the background and NO warning ever shows.
  if (role !== "partner" || hidden || perm === "unsupported" || perm === "granted") return null;
  const blocked = perm === "denied";
  return (
    <div data-testid="partner-alerts-banner" className={`flex items-center gap-2 px-4 py-2 text-xs sm:text-sm border-b ${blocked ? "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-900/40 text-red-800 dark:text-red-200" : "bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-900/40 text-amber-900 dark:text-amber-100"}`}>
      <BellOff className="h-4 w-4 shrink-0" />
      <span className="flex-1 min-w-0 truncate">
        {blocked ? "Notifications are blocked for this site — you may miss job rings. Tap Fix to unblock them."
          : "Turn on notifications so you never miss a new job ring."}
      </span>
      <button data-testid="partner-alerts-banner-enable" onClick={openPushPrompt}
        className={`shrink-0 font-semibold rounded-lg px-3 py-1 text-white ${blocked ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"}`}>
        {blocked ? "Fix now" : "Turn on"}
      </button>
      <button aria-label="Dismiss" data-testid="partner-alerts-banner-dismiss" onClick={() => { sessionStorage.setItem("azo_alerts_banner_hidden", "1"); setHidden(true); }} className="shrink-0 opacity-60 hover:opacity-100"><X className="h-4 w-4" /></button>
    </div>
  );
};

const NotificationBell = () => {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => localStorage.getItem("azo_notif_seen") || "");
  const box = useRef();
  const { subscribe, playSound } = useRealtime();
  const load = () => api.get("/notifications").then((r) => setItems(r.data || [])).catch(() => {});
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, []);
  // Real-time: instantly refresh the bell + toast whenever a push/notification
  // event arrives over SSE (chat message, job update, withdrawal, etc.).
  useEffect(() => subscribe("notification", (ev) => {
    load();
    try { playSound(); } catch { /* ignore */ }
    if (ev?.title) toast(ev.title, { description: ev.body });
  }), [subscribe, playSound]);
  useEffect(() => { const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const unread = items.filter((n) => !seen || (n.created_at || "") > seen).length;
  const toggle = () => { const nx = !open; setOpen(nx); if (nx && items[0]) { const ts = items[0].created_at; localStorage.setItem("azo_notif_seen", ts); setSeen(ts); } };
  return (
    <div className="relative" ref={box}>
      <button data-testid="notif-bell" onClick={toggle} className="relative h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -top-1.5 -right-1.5 h-5 min-w-[20px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{unread > 9 ? "9+" : unread}</span>}
      </button>
      {open && (
        <div className="fixed sm:absolute left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-0 top-[calc(env(safe-area-inset-top)+5.25rem)] sm:top-11 w-[calc(100vw-1.5rem)] max-w-sm sm:w-80 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl max-h-96 overflow-y-auto z-50">
          <p className="px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 dark:border-slate-700">Notifications</p>
          <PushPermissionRow />
          {items.length === 0 && <p className="px-4 py-6 text-center text-sm text-slate-400">No notifications yet</p>}
          {items.slice(0, 30).map((n) => (
            <div key={n.id} className="px-4 py-3 border-b border-slate-50 dark:border-slate-700/50 last:border-0">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{n.title}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.body || n.message}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const ProfileEditModal = ({ open, onClose }) => {
  const { user, setUser } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [photo, setPhoto] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open && user) { setName(user.name || ""); setEmail(user.email || ""); setPhoto(user.photo || ""); }
  }, [open, user]);
  if (!open) return null;
  const role = user?.role;
  const approved = user?.kyc_status === "approved" || user?.verified_partner || user?.verified_merchant;
  const locked = (role === "partner" || role === "merchant") && approved;
  const save = async () => {
    if (!locked && !name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      // Approved partners/merchants can update ONLY their photo; everyone else
      // (and unapproved providers) can edit their full profile.
      const payload = locked ? { photo } : { name: name.trim(), email: email.trim(), photo };
      const { data } = await api.put("/auth/profile", payload);
      setUser(data);
      toast.success("Profile updated");
      onClose();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Could not update profile");
    }
    setSaving(false);
  };
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 overflow-y-auto" data-testid="profile-edit-modal">
      <div className="fixed inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-md my-auto bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4 sticky top-0 -mt-1 pt-1 bg-white dark:bg-slate-900 z-10">
          <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white">Edit Profile</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-5 w-5" /></button>
        </div>
        {locked && (
          <div data-testid="profile-locked-banner" className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 dark:border-amber-900/40 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-[12.5px] text-amber-800 dark:text-amber-200">
            <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
            <span>Your profile is approved and locked. You can update <b>only your profile picture</b> — contact admin to change other details.</span>
          </div>
        )}
        <div className="flex flex-col items-center gap-3 mb-5">
          <ProfilePhotoPicker value={photo} onChange={setPhoto} size={80} testId="profile-photo" />
          <p className="text-xs text-slate-400">Tap the camera to change your photo</p>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Name</label>
            <Input data-testid="profile-name-input" value={name} onChange={(e) => setName(e.target.value)} className="mt-1" disabled={locked} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Email</label>
            <Input data-testid="profile-email-input" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" placeholder="you@example.com" disabled={locked} />
          </div>
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Phone</label>
            <Input value={user?.phone || ""} disabled className="mt-1 opacity-60" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button data-testid="profile-save-btn" onClick={save} disabled={saving} className="bg-primary-700 hover:bg-primary-800 gap-1.5"><Save className="h-4 w-4" />{saving ? "Saving…" : "Save"}</Button>
        </div>
      </div>
    </div>,
    document.body
  );
};

const ProfileChip = ({ user, onLogout }) => {
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const box = useRef();
  useEffect(() => { const h = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  const initials = (user?.name || "A").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 h-9 pl-1 pr-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800">
        {user?.photo
          ? <img src={user.photo} alt="me" className="h-7 w-7 rounded-lg object-cover" />
          : <span className="h-7 w-7 rounded-lg bg-primary-700 text-white text-xs font-bold flex items-center justify-center">{initials}</span>}
        <ChevronDown className="h-4 w-4 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 top-11 w-56 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 p-1.5">
          <div className="px-3 py-2">
            <p className="text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{user?.name}</p>
            <p className="text-xs text-slate-400">{user?.phone}</p>
          </div>
          <button data-testid="edit-profile-button" onClick={() => { setOpen(false); setEditOpen(true); }} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50">
            <UserIcon className="h-4 w-4" /> Edit Profile
          </button>
          <button data-testid="logout-button" onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      )}
      <ProfileEditModal open={editOpen} onClose={() => setEditOpen(false)} />
    </div>
  );
};

// ---- helpers -------------------------------------------------------------
const normGroups = (nav) => {
  // supports both [{group, icon, items:[...]}] and flat [{key,...}]
  const groups = [];
  (nav || []).forEach((item) => {
    if (item.items) groups.push({ group: item.group, icon: item.icon, items: item.items });
    else groups.push({ group: null, icon: null, items: [item] });
  });
  return groups;
};

// Vuexy-style child row: circle bullet + label, active = gradient pill
const ChildItem = ({ sub, active, onNavigate, badge, fav, onToggleFav, leadIcon, dot }) => {
  const isActive = active === sub.key;
  const LeadIcon = leadIcon;
  return (
    <div className="group/ci relative">
      <button
        data-testid={`nav-${sub.key}`}
        onClick={() => onNavigate(sub.key)}
        className={`w-full flex items-center gap-3 pl-3 pr-2 py-2 rounded-lg text-sm transition-all ${isActive ? "bg-gradient-to-r from-primary-600 to-primary-400 text-white font-normal shadow-lg shadow-primary-500/30" : `${sub.soon ? "opacity-60 " : ""}text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-100`}`}
      >
        {LeadIcon
          ? <LeadIcon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.75} />
          : <span className={`h-1.5 w-1.5 rounded-full border shrink-0 transition-colors ${isActive ? "bg-white border-white" : "border-slate-300 dark:border-slate-600 group-hover/ci:border-primary-400"}`} />}
        <span className="truncate flex-1 text-left">{sub.label}</span>
        {dot && <span data-testid={`nav-dot-${sub.key}`} title="Unreviewed profile updates" className={`h-2 w-2 rounded-full shrink-0 ${isActive ? "bg-white" : "bg-red-500"} ring-2 ${isActive ? "ring-white/40" : "ring-red-200 dark:ring-red-900/40"} animate-pulse`} />}
        {sub.soon && !isActive && <span className="text-[9px] font-bold uppercase tracking-wide text-slate-400 border border-slate-200 dark:border-slate-700 rounded px-1 py-0.5">soon</span>}
        {badge > 0 && <span data-testid={`nav-badge-${sub.key}`} className={`h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${isActive ? "bg-white/25 text-white" : "bg-primary-600 text-white"}`}>{badge > 99 ? "99+" : badge}</span>}
      </button>
      {onToggleFav && (
        <button
          data-testid={`nav-fav-${sub.key}`}
          onClick={(e) => { e.stopPropagation(); onToggleFav(sub.key); }}
          title={fav ? "Unpin" : "Pin to favorites"}
          className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded ${isActive ? "text-white/80" : fav ? "text-amber-400" : "text-slate-300 opacity-0 group-hover/ci:opacity-100"} hover:text-amber-500`}
        >
          <Star className="h-3.5 w-3.5" fill={fav ? "currentColor" : "none"} />
        </button>
      )}
    </div>
  );
};

// Collapsed icon-only row (with active dot for badge)
const NavItem = ({ sub, active, onNavigate, badge, collapsed, dot }) => {
  const Icon = sub.icon;
  const isActive = active === sub.key;
  return (
    <button
      data-testid={`nav-${sub.key}`}
      title={sub.label}
      onClick={() => onNavigate(sub.key)}
      className={`w-full flex items-center justify-center py-2.5 rounded-lg transition-all relative ${isActive ? "bg-gradient-to-br from-primary-600 to-primary-500 text-white shadow-lg shadow-primary-500/30" : "text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"} ${sub.soon ? "opacity-60" : ""}`}
    >
      {Icon && <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />}
      {(badge > 0 || dot) && <span data-testid={dot ? `nav-dot-${sub.key}` : undefined} className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />}
    </button>
  );
};

// ---- main layout ---------------------------------------------------------
export const PanelLayout = ({ title, nav, active, onNavigate, badges = {}, dots = {}, appMode = false, primaryTabs = [], children }) => {
  const { user, logout } = useAuth();
  const { branding } = useSiteConfig();
  const { isDark } = useTheme();
  // Show the dark-mode logo when the panel is in dark mode, else the light one (with graceful fallback)
  const brandLogo = mediaSrc((isDark ? (branding?.logo_dark || branding?.logo_light) : (branding?.logo_light || branding?.logo_dark)) || "");
  const brandName = branding?.site_name || "AzoApp";
  const navigate = useNavigate();
  const panelId = (title || "panel").toLowerCase().replace(/\s+/g, "_");

  const groups = useMemo(() => normGroups(nav), [nav]);
  const flat = useMemo(() => {
    const m = {};
    groups.forEach((g) => g.items.forEach((it) => { m[it.key] = { ...it, group: g.group }; }));
    return m;
  }, [groups]);

  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("azo_nav_collapsed") === "1");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuQuery, setMenuQuery] = useState("");
  const [openGroups, setOpenGroups] = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem(`azo_nav_open_${panelId}`) || "null") || []); } catch { return new Set(); }
  });
  const [favs, setFavs] = useState(() => {
    try { return JSON.parse(localStorage.getItem(`azo_nav_fav_${panelId}`) || "[]"); } catch { return []; }
  });

  useEffect(() => { applyTheme(localStorage.getItem("azo_theme") || "light"); }, []);
  useEffect(() => { localStorage.setItem("azo_nav_collapsed", collapsed ? "1" : "0"); }, [collapsed]);
  useEffect(() => { localStorage.setItem(`azo_nav_open_${panelId}`, JSON.stringify([...openGroups])); }, [openGroups, panelId]);
  useEffect(() => { localStorage.setItem(`azo_nav_fav_${panelId}`, JSON.stringify(favs)); }, [favs, panelId]);

  // Smart active menu: auto-open the group containing the active item
  useEffect(() => {
    const g = flat[active]?.group;
    if (g) setOpenGroups((prev) => (prev.has(g) ? prev : new Set([g])));
  }, [active, flat]);

  // Accordion: only ONE group open at a time — opening another closes the previous.
  const toggleGroup = (g) => setOpenGroups((prev) => (prev.has(g) ? new Set() : new Set([g])));
  const toggleFav = (key) => setFavs((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const handleNav = (key) => {
    setMobileOpen(false);
    setMoreOpen(false);
    onNavigate?.(key);
  };

  const badgeFor = (key) => badges[key] ?? flat[key]?.badge ?? 0;
  const dotFor = (key) => !!dots[key];

  const query = menuQuery.trim().toLowerCase();
  const searching = query.length > 0;
  const matches = (it) => it.label.toLowerCase().includes(query);

  const crumbGroup = flat[active]?.group;
  const crumbLabel = flat[active]?.label || "Dashboard";

  const favItems = favs.map((k) => flat[k]).filter(Boolean);

  const SidebarInner = (
    <>
      <div className={`h-16 flex items-center border-b border-slate-100 dark:border-slate-800 ${collapsed ? "justify-center px-0" : "px-5"}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          {brandLogo ? (
            <img src={brandLogo} alt={brandName}
              className={`object-contain shrink-0 ${collapsed ? "h-9 w-9" : "h-9 max-w-[130px] w-auto"}`} />
          ) : (
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center shadow-lg shadow-primary-700/20 shrink-0">
              <span className="text-white font-heading font-black text-lg leading-none">{(brandName || "A")[0]}</span>
            </div>
          )}
          {!collapsed && (
            <div className="min-w-0">
              {!brandLogo && <p className="font-heading font-extrabold text-base leading-none text-slate-900 dark:text-white truncate">{brandName}</p>}
              <p className={`text-[10px] uppercase tracking-widest text-slate-400 ${brandLogo ? "" : "mt-1"}`}>{title}</p>
            </div>
          )}
        </div>
      </div>

      {/* Menu search */}
      {!collapsed && (
        <div className="px-3 pt-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
            <input
              data-testid="menu-search"
              value={menuQuery}
              onChange={(e) => setMenuQuery(e.target.value)}
              placeholder="Search menu…"
              className="w-full h-9 pl-8 pr-7 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary-200"
            />
            {menuQuery && <button onClick={() => setMenuQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X className="h-3.5 w-3.5" /></button>}
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto no-scrollbar py-3 px-3 space-y-0.5">
        {/* Search results (flat) */}
        {searching && !collapsed && (
          <div className="space-y-0.5">
            {groups.flatMap((g) => g.items).filter(matches).length === 0 && (
              <p className="text-xs text-slate-400 px-3 py-4 text-center">No menu matches “{menuQuery}”</p>
            )}
            {groups.flatMap((g) => g.items).filter(matches).map((sub) => (
              <ChildItem key={sub.key} sub={sub} active={active} onNavigate={handleNav} badge={badgeFor(sub.key)} dot={dotFor(sub.key)} leadIcon={sub.icon} fav={favs.includes(sub.key)} onToggleFav={toggleFav} />
            ))}
          </div>
        )}

        {/* Collapsed: flat icon list */}
        {collapsed && (
          <div className="space-y-1">
            {groups.map((g, gi) => (
              <div key={g.group || gi}>
                {g.group && gi > 0 && <div className="h-px bg-slate-100 dark:bg-slate-800 my-2" />}
                {g.items.map((sub) => <NavItem key={sub.key} sub={sub} active={active} onNavigate={handleNav} badge={badgeFor(sub.key)} dot={dotFor(sub.key)} collapsed />)}
              </div>
            ))}
          </div>
        )}

        {!searching && !collapsed && (
          <>
            {/* Favorites */}
            {favItems.length > 0 && (
              <div className="pb-2">
                <p className="px-3 pb-1.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.15em] text-amber-500"><Star className="h-3 w-3" fill="currentColor" /> Favorites</p>
                {favItems.map((sub) => <ChildItem key={`fav-${sub.key}`} sub={sub} active={active} onNavigate={handleNav} badge={badgeFor(sub.key)} dot={dotFor(sub.key)} leadIcon={sub.icon} fav onToggleFav={toggleFav} />)}
              </div>
            )}

            {favItems.length > 0 && <div className="h-px bg-slate-100 dark:bg-slate-800 my-1" />}

            {/* Vuexy-style groups: parent (icon + chevron + count) → children (bullets, gradient active) */}
            {groups.map((g, gi) => {
              // single-item group => render as a flat top-level item, styled EXACTLY like a group header (same color/weight/icon size) for visual consistency
              if (!g.group || g.items.length === 1) {
                const only = g.items[0];
                const OIcon = only.icon || g.icon || Folder;
                const isActive = active === only.key;
                const b = badgeFor(only.key);
                const isFav = favs.includes(only.key);
                return (
                  <div key={only.key} className="group/ci relative pt-1 first:pt-0">
                    <button
                      data-testid={`nav-${only.key}`}
                      onClick={() => handleNav(only.key)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-normal transition-all ${isActive ? "bg-gradient-to-r from-primary-600 to-primary-400 text-white shadow-lg shadow-primary-500/30" : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                    >
                      <OIcon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                      <span className="flex-1 text-left truncate">{only.label}</span>
                      {dotFor(only.key) && <span data-testid={`nav-dot-${only.key}`} className={`h-2 w-2 rounded-full shrink-0 animate-pulse ${isActive ? "bg-white" : "bg-red-500 ring-2 ring-red-200 dark:ring-red-900/40"}`} />}
                      {b > 0 && <span data-testid={`nav-badge-${only.key}`} className={`h-5 min-w-[20px] px-1.5 rounded-full text-[10px] font-bold flex items-center justify-center ${isActive ? "bg-white/25 text-white" : "bg-red-500 text-white"}`}>{b > 99 ? "99+" : b}</span>}
                    </button>
                    <button
                      data-testid={`nav-fav-${only.key}`}
                      onClick={(e) => { e.stopPropagation(); toggleFav(only.key); }}
                      title={isFav ? "Unpin" : "Pin to favorites"}
                      className={`absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded ${isActive ? "text-white/80" : isFav ? "text-amber-400" : "text-slate-300 opacity-0 group-hover/ci:opacity-100"} hover:text-amber-500`}
                    >
                      <Star className="h-3.5 w-3.5" fill={isFav ? "currentColor" : "none"} />
                    </button>
                  </div>
                );
              }
              const isOpen = openGroups.has(g.group);
              const hasActive = g.items.some((it) => it.key === active);
              const groupBadge = g.items.reduce((s, it) => s + (badgeFor(it.key) || 0), 0);
              const groupDot = g.items.some((it) => dotFor(it.key));
              const GIcon = g.icon || Folder;
              return (
                <div key={g.group} className="pt-1 first:pt-0">
                  <button
                    data-testid={`navgroup-${g.group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}
                    onClick={() => toggleGroup(g.group)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-normal transition-all ${hasActive && !isOpen ? "text-primary-700 dark:text-primary-300 bg-primary-50/70 dark:bg-primary-900/20" : "text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"}`}
                  >
                    <GIcon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                    <span className="flex-1 text-left truncate">{g.group}</span>
                    {groupDot && !isOpen && <span className="h-2 w-2 rounded-full bg-red-500 ring-2 ring-red-200 dark:ring-red-900/40 animate-pulse shrink-0" />}
                    {groupBadge > 0 && <span className="h-5 min-w-[20px] px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">{groupBadge > 99 ? "99+" : groupBadge}</span>}
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                  {isOpen && (
                    <div className="mt-0.5 ml-[19px] pl-3 border-l border-slate-100 dark:border-slate-800 space-y-0.5">
                      {g.items.map((sub) => <ChildItem key={sub.key} sub={sub} active={active} onNavigate={handleNav} badge={badgeFor(sub.key)} dot={dotFor(sub.key)} fav={favs.includes(sub.key)} onToggleFav={toggleFav} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </nav>

      <div className="p-3 border-t border-slate-100 dark:border-slate-800 space-y-1">
        <button data-testid="collapse-toggle" onClick={() => setCollapsed((c) => !c)}
          className={`hidden lg:flex w-full items-center ${collapsed ? "justify-center" : "gap-3 px-3"} py-2 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800`}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
          {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" strokeWidth={1.5} /> : <><PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.5} /> Collapse</>}
        </button>
        <button onClick={() => { logout(); navigate("/"); }}
          className={`w-full flex items-center ${collapsed ? "justify-center" : "gap-3 px-3"} py-2.5 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 transition-all`}
          title="Logout">
          <LogOut className="h-[18px] w-[18px]" strokeWidth={1.5} /> {!collapsed && "Logout"}
        </button>
      </div>
    </>
  );

  const asideW = collapsed ? "lg:w-16" : "lg:w-64";
  const mainMl = collapsed ? "lg:ml-16" : "lg:ml-64";

  return (
    <div className="min-h-screen bg-[#F8F7FA] dark:bg-slate-950 flex">
      {/* Desktop sidebar */}
      <aside className={`hidden lg:flex ${asideW} shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200/70 dark:border-slate-800 flex-col fixed h-screen z-40 transition-[width] duration-200`}>
        {SidebarInner}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[85%] bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col h-full z-10">
            <button onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
            {SidebarInner}
          </aside>
        </div>
      )}

      <main className={`flex-1 min-w-0 ${mainMl} min-h-screen transition-[margin] duration-200`}>
        <div className="px-4 lg:px-6 sticky top-0 z-30" style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top))" }}>
          <div className="relative">
          <div aria-hidden className="pointer-events-none absolute -inset-x-4 lg:-inset-x-6 -top-3 -bottom-4 backdrop-blur-xl bg-gradient-to-b from-white/75 via-white/55 to-transparent dark:from-slate-900/75 dark:via-slate-900/45 dark:to-transparent [mask-image:linear-gradient(to_bottom,black_72%,transparent)]" />
          <header className="relative bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl shadow-card rounded-2xl border border-white/60 dark:border-slate-800 px-3 lg:px-5 min-h-[3.5rem] py-2 flex items-center gap-3">
            {appMode ? (
              <div className="lg:hidden flex items-center gap-2 min-w-0" data-testid="app-brand">
                {brandLogo ? (
                  <img src={brandLogo} alt={brandName}
                    className="h-10 w-auto max-w-[170px] object-contain" data-testid="app-brand-logo" />
                ) : (
                  <>
                    <span className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 text-white font-heading font-black flex items-center justify-center shadow-md shadow-primary-500/30">{(brandName || "A")[0]}</span>
                    <div className="min-w-0 leading-tight">
                      <p className="font-heading font-extrabold text-sm text-slate-900 dark:text-white truncate">{crumbLabel}</p>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">{title}</p>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="lg:hidden flex items-center gap-2 min-w-0">
                <button data-testid="mobile-menu-toggle" onClick={() => setMobileOpen(true)} className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-300 shrink-0">
                  <Menu className="h-4 w-4" />
                </button>
                {brandLogo
                  ? <img src={brandLogo} alt={brandName} className="h-9 w-auto max-w-[150px] object-contain" data-testid="app-brand-logo" />
                  : <p className="font-heading font-extrabold text-sm text-slate-900 dark:text-white truncate">{brandName}</p>}
              </div>
            )}
            {user?.role === "admin" && <div className="hidden sm:block flex-1"><GlobalSearch onNavigate={handleNav} /></div>}
            <div className={`${user?.role === "admin" ? "" : "ml-auto"} flex items-center gap-2 shrink-0`}>
              <NotificationBell />
              <ThemeToggle />
              <div className="h-6 w-px bg-slate-200 dark:bg-slate-700 mx-1" />
              <ProfileChip user={user} onLogout={() => { logout(); navigate("/"); }} />
            </div>
          </header>
          </div>
          <PartnerAlertsReminder role={user?.role} />
        </div>
        <div className={`p-4 lg:p-6 xl:px-8 w-full ${appMode ? "pb-24 lg:pb-6" : ""}`}>{children}</div>
      </main>

      {appMode && (
        <>
          {/* Mobile app-style bottom tab bar */}
          <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 pointer-events-none" data-testid="app-bottom-nav">
            <div className="pointer-events-auto mx-auto max-w-md glass rounded-[28px] border border-white/50 dark:border-slate-700/60 shadow-float grid grid-cols-5 px-1.5 py-1">
              {primaryTabs.map((k) => flat[k]).filter(Boolean).map((it) => {
                const Icon = it.icon || Folder;
                const on = active === it.key;
                const b = badgeFor(it.key);
                return (
                  <button key={it.key} data-testid={`tab-${it.key}`} onClick={() => handleNav(it.key)}
                    className={`relative flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[10px] font-semibold transition-colors ${on ? "text-primary-700 dark:text-primary-300" : "text-slate-400 dark:text-slate-500"}`}>
                    <span className={`relative flex items-center justify-center h-9 w-9 rounded-2xl transition-all duration-200 ${on ? "bg-gradient-to-br from-primary-600 to-primary-500 text-white shadow-md shadow-primary-500/40 scale-105" : ""}`}>
                      <Icon className="h-[18px] w-[18px]" strokeWidth={2} />
                      {b > 0 && <span className="absolute -top-1 -right-1 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-900">{b > 9 ? "9+" : b}</span>}
                    </span>
                    <span className="truncate max-w-[64px]">{it.short || it.label}</span>
                  </button>
                );
              })}
              <button data-testid="tab-more" onClick={() => setMoreOpen(true)}
                className={`flex flex-col items-center justify-center gap-1 pt-2 pb-1.5 text-[10px] font-semibold transition-colors ${moreOpen || !primaryTabs.includes(active) ? "text-primary-700 dark:text-primary-300" : "text-slate-400 dark:text-slate-500"}`}>
                <span className={`flex items-center justify-center h-9 w-9 rounded-2xl transition-all duration-200 ${moreOpen || !primaryTabs.includes(active) ? "bg-gradient-to-br from-primary-600 to-primary-500 text-white shadow-md shadow-primary-500/40 scale-105" : ""}`}>
                  <MoreHorizontal className="h-[18px] w-[18px]" strokeWidth={2} />
                </span>
                <span>More</span>
              </button>
            </div>
          </nav>

          {/* "More" bottom sheet with the full menu */}
          {moreOpen && (
            <div className="lg:hidden fixed inset-0 z-50" data-testid="more-sheet">
              <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200" onClick={() => setMoreOpen(false)} />
              <div className="absolute bottom-0 inset-x-0 bg-white dark:bg-slate-900 rounded-t-3xl border-t border-slate-200 dark:border-slate-800 p-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] max-h-[82vh] overflow-y-auto shadow-2xl animate-in slide-in-from-bottom duration-300">
                <div className="mx-auto h-1.5 w-12 rounded-full bg-slate-200 dark:bg-slate-700 mb-4" />
                <div className="flex items-center justify-between mb-4">
                  <p className="font-heading font-extrabold text-lg text-slate-900 dark:text-white">All Menu</p>
                  <button onClick={() => setMoreOpen(false)} className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  {groups.flatMap((g) => g.items).filter((it) => !primaryTabs.includes(it.key)).map((it) => {
                    const Icon = it.icon || Folder;
                    const on = active === it.key;
                    const b = badgeFor(it.key);
                    return (
                      <button key={it.key} data-testid={`more-${it.key}`} onClick={() => handleNav(it.key)}
                        className={`relative flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition-all active:scale-95 ${on ? "border-primary-300 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-700" : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60"}`}>
                        <span className={`h-11 w-11 rounded-2xl flex items-center justify-center ${on ? "bg-gradient-to-br from-primary-600 to-primary-400 text-white shadow-md shadow-primary-500/30" : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300"}`}>
                          <Icon className="h-5 w-5" strokeWidth={1.9} />
                        </span>
                        <span className={`text-[11px] font-semibold leading-tight ${on ? "text-primary-700 dark:text-primary-300" : "text-slate-600 dark:text-slate-300"}`}>{it.label}</span>
                        {b > 0 && <span className="absolute top-2 right-2 h-4 min-w-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">{b > 9 ? "9+" : b}</span>}
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => { logout(); navigate("/"); }} data-testid="more-logout" className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-2xl bg-red-50 dark:bg-red-900/20 text-red-600 font-bold text-sm active:scale-95 transition-transform">
                  <LogOut className="h-4 w-4" /> Logout
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export const StatCard = ({ label, value, icon: Icon, tone = "primary", sub, trend, title }) => {
  const tones = {
    primary: "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300",
    green: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
    amber: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
    slate: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl sm:rounded-xl border border-slate-200/70 dark:border-slate-800 shadow-card p-4 sm:p-5 hover:shadow-cardhover transition-all duration-200">
      <div className="flex items-start justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[12px] sm:text-[13px] font-medium text-slate-500 dark:text-slate-400 leading-tight">{label}</p>
          <p className="text-[19px] sm:text-[26px] leading-tight font-heading font-extrabold text-slate-800 dark:text-white mt-1 sm:mt-1.5 truncate" title={title != null ? String(title) : undefined}>{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
          {trend != null && <p className={`text-xs font-semibold mt-1.5 ${trend >= 0 ? "text-emerald-600" : "text-red-500"}`}>{trend >= 0 ? "▲" : "▼"} {Math.abs(trend)}%</p>}
        </div>
        {Icon && <div className={`h-9 w-9 sm:h-11 sm:w-11 rounded-xl sm:rounded-lg flex items-center justify-center shrink-0 ${tones[tone]}`}><Icon className="h-[18px] w-[18px] sm:h-[22px] sm:w-[22px]" strokeWidth={1.9} /></div>}
      </div>
    </div>
  );
};
