import React, { useEffect, useMemo, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Menu, Bell, Moon, Sun, LogOut, ChevronLeft, ChevronRight, Search, MapPin,
  MoreHorizontal, X, Sparkles, Settings, CheckCheck, Home,
} from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { useSiteConfig } from "@/context/SiteConfigContext";
import { useTheme } from "@/context/ThemeContext";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const timeAgo = (iso) => {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

function Avatar({ user, size = "h-9 w-9" }) {
  const initials = (user?.name || "U").split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  return user?.photo
    ? <img src={user.photo} alt="" className={`${size} rounded-full object-cover ring-2 ring-white/70 dark:ring-slate-700`} />
    : <span className={`${size} rounded-full grid place-items-center bg-gradient-to-br from-primary-500 to-primary-800 text-white font-bold text-sm ring-2 ring-white/70 dark:ring-slate-700`}>{initials}</span>;
}

function NotificationBell({ testId = "notif-btn" }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(() => localStorage.getItem("azo_notif_seen") || "");
  const load = useCallback(() => { api.get("/notifications").then((r) => setItems(r.data || [])).catch(() => {}); }, []);
  useEffect(() => { load(); const t = setInterval(load, 20000); return () => clearInterval(t); }, [load]);
  const unread = items.filter((n) => !seen || (n.created_at || "") > seen).length;
  const markAll = () => { const now = new Date().toISOString(); localStorage.setItem("azo_notif_seen", now); setSeen(now); };
  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (v) load(); }}>
      <PopoverTrigger asChild>
        <button data-testid={testId} aria-label="Notifications" className="relative h-10 w-10 grid place-items-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 azo-press">
          <Bell className="h-5 w-5" />
          {unread > 0 && <span className="absolute -top-1 -right-1 h-5 min-w-[20px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold grid place-items-center azo-pop">{unread > 9 ? "9+" : unread}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={8} collisionPadding={12} className="w-[340px] p-0 azo-scale-in max-sm:!fixed max-sm:!left-0 max-sm:!right-0 max-sm:!w-full max-sm:!translate-x-0 max-sm:!top-[calc(env(safe-area-inset-top)+3.5rem)] max-sm:!rounded-none max-sm:!border-x-0 max-sm:!shadow-2xl" data-testid="notif-panel">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
          <p className="font-heading font-bold text-slate-900 dark:text-white">Notifications</p>
          {unread > 0 && <button onClick={markAll} data-testid="notif-mark-all" className="text-xs font-semibold text-primary-600 flex items-center gap-1"><CheckCheck className="h-3.5 w-3.5" /> Mark all read</button>}
        </div>
        <div className="max-h-[380px] overflow-y-auto">
          {items.length === 0 && <p className="px-4 py-10 text-center text-sm text-slate-400">You are all caught up.</p>}
          {items.map((n, i) => {
            const isNew = !seen || (n.created_at || "") > seen;
            return (
              <div key={n.id || i} className={`px-4 py-3 border-b border-slate-50 dark:border-slate-800/60 ${isNew ? "bg-primary-50/40 dark:bg-primary-900/10" : ""}`}>
                <div className="flex items-start gap-2.5">
                  {isNew && <span className="mt-1.5 h-2 w-2 rounded-full bg-primary-500 shrink-0" />}
                  <div className={isNew ? "" : "pl-4"}>
                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{n.title}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.body || n.message}</p>
                    <p className="text-[11px] text-slate-400 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ThemeToggle() {
  const { isDark, toggle } = useTheme();
  return (
    <button data-testid="theme-toggle" onClick={toggle} aria-label="Toggle dark mode"
      className="h-10 w-10 grid place-items-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-amber-300 hover:bg-slate-200 dark:hover:bg-slate-700 azo-press">
      {isDark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}

function AvatarMenu({ user, onNavigate }) {
  const { logout } = useAuth();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button data-testid="avatar-menu" className="flex items-center gap-2 pl-1 pr-2 h-10 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 azo-press">
          <Avatar user={user} />
          <div className="hidden lg:block text-left leading-tight">
            <p className="text-sm font-bold text-slate-800 dark:text-white max-w-[120px] truncate">{user?.name || "Customer"}</p>
            <p className="text-[11px] text-slate-400">{user?.phone}</p>
          </div>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <p className="font-bold text-slate-800 dark:text-white">{user?.name}</p>
          <p className="text-xs font-normal text-slate-400">{user?.email || user?.phone}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid="menu-profile" onClick={() => onNavigate("profile")}><Settings className="h-4 w-4 mr-2" /> My Profile</DropdownMenuItem>
        <DropdownMenuItem data-testid="menu-ai" onClick={() => onNavigate("ai")}><Sparkles className="h-4 w-4 mr-2" /> AI Assistant</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem data-testid="menu-logout" onClick={logout} className="text-rose-600 focus:text-rose-600"><LogOut className="h-4 w-4 mr-2" /> Logout</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function CustomerShell({ nav, active, onNavigate, user, badges = {}, mobilePrimary, children }) {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { branding } = useSiteConfig();
  const { isDark } = useTheme();
  const brandLogo = (isDark ? (branding?.logo_dark || branding?.logo_light) : (branding?.logo_light || branding?.logo_dark)) || "";
  const brandName = branding?.site_name || "AzoApp";
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem("azo_sidebar_collapsed") === "1");
  const [menuQ, setMenuQ] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);
  useEffect(() => { localStorage.setItem("azo_sidebar_collapsed", collapsed ? "1" : "0"); }, [collapsed]);

  const filteredNav = useMemo(
    () => nav.filter((n) => n.label.toLowerCase().includes(menuQ.trim().toLowerCase())),
    [nav, menuQ]
  );

  const primaryKeys = mobilePrimary || ["home", "orders", "wallet", "invoices"];
  const primaryNav = primaryKeys.map((k) => nav.find((n) => n.key === k)).filter(Boolean);
  const moreNav = nav.filter((n) => !primaryKeys.includes(n.key));
  const activeLabel = nav.find((n) => n.key === active)?.label || "Dashboard";
  const location = user?.addresses?.find((a) => a.is_default)?.city || user?.addresses?.[0]?.city || "Patna";

  const go = (k) => { onNavigate(k); setMoreOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100">
      {/* ============ DESKTOP SIDEBAR ============ */}
      <aside className={`hidden lg:flex fixed inset-y-0 left-0 z-40 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-[width] duration-300 ${collapsed ? "w-[76px]" : "w-[264px]"}`}>
        <div className="h-16 flex items-center gap-2.5 px-4 border-b border-slate-100 dark:border-slate-800">
          {brandLogo ? (
            <img src={brandLogo} alt={brandName} className={`object-contain ${collapsed ? "h-9 w-9" : "h-10 w-auto max-w-[170px]"}`} />
          ) : (
            <>
              <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 grid place-items-center text-white font-black shrink-0">{(brandName || "A")[0]}</div>
              {!collapsed && (
                <div className="leading-tight">
                  <p className="font-heading font-black text-lg text-slate-900 dark:text-white">{brandName}</p>
                  <p className="text-[10px] font-bold tracking-widest text-primary-600">CUSTOMER</p>
                </div>
              )}
            </>
          )}
        </div>

        {!collapsed && (
          <div className="px-3 pt-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input data-testid="menu-search" value={menuQ} onChange={(e) => setMenuQ(e.target.value)} placeholder="Search menu…"
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40" />
            </div>
          </div>
        )}

        <nav className="flex-1 overflow-y-auto no-scrollbar px-2.5 py-3 space-y-1">
          {filteredNav.map((n) => {
            const on = active === n.key;
            const badge = badges[n.key];
            return (
              <button key={n.key} data-testid={`nav-${n.key}`} onClick={() => go(n.key)} title={collapsed ? n.label : undefined}
                className={`group relative w-full flex items-center gap-3 h-11 rounded-xl px-3 text-sm font-semibold azo-press transition-colors ${on ? "bg-primary-700 text-white shadow-primarybtn" : "text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"} ${collapsed ? "justify-center" : ""}`}>
                <n.icon className={`h-[18px] w-[18px] shrink-0 ${on ? "text-white" : "text-slate-400 group-hover:text-primary-600"}`} />
                {!collapsed && <span className="truncate">{n.label}</span>}
                {badge > 0 && (
                  <span className={`${collapsed ? "absolute top-1.5 right-1.5 h-2 w-2 p-0" : "ml-auto h-5 min-w-[20px] px-1"} grid place-items-center rounded-full ${on ? "bg-white text-primary-700" : "bg-rose-500 text-white"} text-[10px] font-bold`}>
                    {!collapsed && badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="border-t border-slate-100 dark:border-slate-800 p-2.5 space-y-1">
          <button data-testid="sidebar-collapse" onClick={() => setCollapsed((c) => !c)}
            className={`w-full flex items-center gap-3 h-10 rounded-xl px-3 text-sm font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 azo-press ${collapsed ? "justify-center" : ""}`}>
            {collapsed ? <ChevronRight className="h-[18px] w-[18px]" /> : <><ChevronLeft className="h-[18px] w-[18px]" /> Collapse</>}
          </button>
          <button data-testid="logout-btn" onClick={logout}
            className={`w-full flex items-center gap-3 h-10 rounded-xl px-3 text-sm font-semibold text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20 azo-press ${collapsed ? "justify-center" : ""}`}>
            <LogOut className="h-[18px] w-[18px]" />{!collapsed && "Logout"}
          </button>
        </div>
      </aside>

      {/* ============ MAIN COLUMN ============ */}
      <div className={`transition-[padding] duration-300 ${collapsed ? "lg:pl-[76px]" : "lg:pl-[264px]"}`}>
        {/* Desktop header */}
        <header className="hidden lg:flex sticky top-0 z-30 h-16 items-center gap-3 px-6 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800">
          <div className="flex-1 min-w-0">
            <GlobalSearch nav={nav} onNavigate={go} />
          </div>
          <NotificationBell />
          <ThemeToggle />
          <div className="w-px h-8 bg-slate-200 dark:bg-slate-700" />
          <AvatarMenu user={user} onNavigate={go} />
        </header>

        {/* Mobile header */}
        <header className="lg:hidden sticky top-0 z-30 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/70 dark:border-slate-800" style={{ paddingTop: "env(safe-area-inset-top)" }}>
          <div className="flex items-center gap-3 px-4 h-14">
            <button data-testid="m-avatar" onClick={() => go("profile")}><Avatar user={user} size="h-9 w-9" /></button>
            {brandLogo ? (
              <div className="flex-1 min-w-0 flex items-center">
                <img src={brandLogo} alt={brandName} className="h-9 w-auto max-w-[160px] object-contain" data-testid="app-brand-logo" />
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-slate-400 flex items-center gap-1"><MapPin className="h-3 w-3 text-primary-600" /> Deliver to</p>
                <p className="text-sm font-bold text-slate-800 dark:text-white truncate leading-tight">{location}</p>
              </div>
            )}
            <NotificationBell testId="m-notif-btn" />
            <ThemeToggle />
          </div>
        </header>

        {/* Page content — FULL WIDTH */}
        <main className="px-4 lg:px-6 xl:px-8 py-4 lg:py-6 pb-28 lg:pb-10 max-w-[1720px] mx-auto w-full min-h-[calc(100vh-4rem)]">
          {children}
        </main>
      </div>

      {/* ============ MOBILE BOTTOM NAV ============ */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-t border-slate-200 dark:border-slate-800 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {primaryNav.map((n) => {
            const on = active === n.key;
            const badge = badges[n.key];
            return (
              <button key={n.key} data-testid={`m-nav-${n.key}`} onClick={() => go(n.key)}
                className={`relative flex flex-col items-center justify-center gap-0.5 py-2 h-16 azo-press ${on ? "text-primary-700 dark:text-primary-300" : "text-slate-400"}`}>
                <span className={`grid place-items-center h-8 w-12 rounded-full transition-colors ${on ? "bg-primary-100 dark:bg-primary-900/40" : ""}`}>
                  <n.icon className="h-[20px] w-[20px]" />
                  {badge > 0 && <span className="absolute top-1.5 right-[22%] h-4 min-w-[16px] px-1 rounded-full bg-rose-500 text-white text-[9px] font-bold grid place-items-center">{badge}</span>}
                </span>
                <span className="text-[10px] font-bold">{n.short || n.label}</span>
              </button>
            );
          })}
          <button data-testid="m-nav-more" onClick={() => setMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 py-2 h-16 azo-press ${moreNav.some((n) => n.key === active) ? "text-primary-700 dark:text-primary-300" : "text-slate-400"}`}>
            <span className="grid place-items-center h-8 w-12 rounded-full"><MoreHorizontal className="h-[20px] w-[20px]" /></span>
            <span className="text-[10px] font-bold">More</span>
          </button>
        </div>
      </nav>

      {/* ============ MOBILE MORE SHEET ============ */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-3xl" data-testid="more-sheet">
          <SheetHeader className="text-left mb-2"><SheetTitle>More</SheetTitle></SheetHeader>
          <div className="grid grid-cols-3 gap-3 pb-2">
            {moreNav.map((n) => {
              const on = active === n.key;
              return (
                <button key={n.key} data-testid={`more-${n.key}`} onClick={() => go(n.key)}
                  className={`flex flex-col items-center gap-2 rounded-2xl p-4 azo-press border ${on ? "border-primary-300 bg-primary-50 dark:bg-primary-900/20 dark:border-primary-700" : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900"}`}>
                  <span className="grid place-items-center h-11 w-11 rounded-xl bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300">
                    <n.icon className="h-5 w-5" />
                  </span>
                  <span className="text-xs font-semibold text-center text-slate-700 dark:text-slate-200">{n.label}</span>
                </button>
              );
            })}
          </div>
          <button data-testid="more-logout" onClick={logout} className="w-full mt-2 h-12 rounded-2xl bg-rose-50 dark:bg-rose-900/20 text-rose-600 font-bold flex items-center justify-center gap-2 azo-press">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </SheetContent>
      </Sheet>
    </div>
  );
}

/* Header global search — quick jump across modules */
function GlobalSearch({ nav, onNavigate }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const results = useMemo(() => {
    if (!q.trim()) return [];
    const t = q.toLowerCase();
    return nav.filter((n) => n.label.toLowerCase().includes(t)).slice(0, 6);
  }, [q, nav]);
  return (
    <div className="relative max-w-md">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <input
        data-testid="global-search"
        value={q}
        onChange={(e) => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search bookings, invoices, services…"
        className="w-full h-10 pl-9 pr-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40"
      />
      {open && results.length > 0 && (
        <div className="absolute top-12 left-0 right-0 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden azo-scale-in z-50">
          {results.map((n) => (
            <button key={n.key} onMouseDown={() => { onNavigate(n.key); setQ(""); setOpen(false); }}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
              <n.icon className="h-4 w-4 text-primary-600" /> Go to {n.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
