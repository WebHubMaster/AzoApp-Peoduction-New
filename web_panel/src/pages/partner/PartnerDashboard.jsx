import { useEffect, useState, useCallback, useRef } from "react";
import SchedulePicker from "@/components/site/SchedulePicker";
import { Briefcase, Wallet, TrendingUp, Power, MapPin, Star, CheckCircle2, Navigation, ShieldCheck, Award, Gift, GraduationCap, CalendarClock, FileText, LineChart, Crown, Zap, BadgeCheck, CalendarHeart } from "lucide-react";
import MerchantInvoices from "@/pages/merchant/finance/MerchantInvoices";
import PremiumAnalytics from "@/components/PremiumAnalytics";
import api, { fmt } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import useTabParam from "@/hooks/useTabParam";
import { useRealtime } from "@/context/RealtimeContext";
import { PanelLayout } from "@/components/PanelLayout";
import OnboardingTour from "@/components/tour/OnboardingTour";
import PartnerOnboarding from "@/pages/partner/PartnerOnboarding";
import PartnerProfileView from "@/pages/partner/PartnerProfileView";
import IncomingJobRing from "@/components/partner/IncomingJobRing";
import RescheduleRing from "@/components/booking/RescheduleRing";
import PartnerAlertsPanel from "@/components/partner/PartnerAlertsPanel";
import MissedRingRecovery from "@/components/partner/MissedRingRecovery";
import ServiceBreakdown from "@/components/booking/ServiceBreakdown";
import { VerificationSection, SkillsSection, IncentivesSection, TrainingSection, AvailabilitySection } from "@/pages/partner/PartnerModule3";
import { ChallengesRewards } from "@/pages/partner/ChallengesRewards";
import PartnerSubscriptions from "@/pages/partner/PartnerSubscriptions";
import { PartnerHome } from "@/pages/partner/PartnerHomeV2";
import { LayoutDashboard, CreditCard } from "lucide-react";
import { LifeBuoy } from "lucide-react";
import SupportCenter from "@/components/SupportCenter";
import JobWizard from "@/components/partner/JobWizard";
import BookingChat from "@/components/booking/BookingChat";
import HelpSOS from "@/components/booking/HelpSOS";
import { useChatUnread, UnreadPill } from "@/context/ChatContext";
import ScheduledCard from "@/components/booking/ScheduledCard";
import ScheduleAlerts from "@/components/booking/ScheduleAlerts";
import { Phone, MessageCircle, Camera, ChevronDown, Clock, User as UserIcon, Circle, Lock, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, Wrench, AlertTriangle, Trash2, Package } from "lucide-react";
import PartnerStarterKit from "@/pages/partner/PartnerStarterKit";
import JobRequest from "@/pages/partner/modules/JobRequest";
import PartnerWalletV2 from "@/pages/partner/modules/PartnerWalletV2";
import BankKyc from "@/pages/partner/modules/BankKyc";
import EarningsLedger from "@/pages/partner/modules/EarningsLedger";
import { StatusBadge } from "@/components/partner/ui/kit";
import { toast } from "sonner";

const NAV = [
  { key: "home", label: "Dashboard", icon: LayoutDashboard },
  { key: "jobs", label: "Job Request", icon: Briefcase },
  { key: "active", label: "Active Job", icon: Navigation },
  { key: "subscriptions", label: "Maid Subscriptions", icon: CalendarHeart },
  { key: "availability", label: "My Availability", icon: CalendarClock },
  { key: "wallet", label: "Wallet & Withdraw", icon: Wallet },
  { key: "bankkyc", label: "Bank & KYC", icon: CreditCard },
  { key: "earnings", label: "Earnings Ledger", icon: TrendingUp },
  { key: "invoices", label: "My Invoice", icon: FileText },
  { key: "incentives", label: "Rewards & Challenges", icon: Gift },
  { key: "analytics", label: "Analytics", icon: LineChart },
  { key: "starterkit", label: "Starter Kit", icon: Package },
  { key: "onboarding", label: "Profile & KYC", icon: CheckCircle2 },
  { key: "support", label: "Help & Support", icon: LifeBuoy },
];

// Bottom-nav primary tabs for the mobile "app" experience (rest live under "More").
const PARTNER_TABS = ["home", "jobs", "active", "wallet"];

export default function PartnerDashboard() {
  const { user, setUser, refresh } = useAuth();
  const { subscribe, playSound, browserNotify, requestPermission, connected } = useRealtime();
  const [active, setActive] = useTabParam(user?.onboarding_submitted || user?.kyc_status === "approved" ? "jobs" : "onboarding");
  const [jobs, setJobs] = useState([]);
  const [mine, setMine] = useState([]);
  const [online, setOnline] = useState(user?.partner_status === "online");
  const [kit, setKit] = useState(null);
  const [proOpen, setProOpen] = useState(false);
  const prevJobs = useRef(null);

  const loadKit = useCallback(() => {
    api.get("/starter-kit/me").then((r) => setKit(r.data)).catch(() => {});
  }, []);
  useEffect(() => { loadKit(); }, [loadKit]);

  const load = useCallback(() => {
    api.get("/bookings/partner/jobs").then((r) => {
      prevJobs.current = r.data.map((j) => j.id);
      setJobs(r.data);
    }).catch(() => {});
    api.get("/bookings").then((r) => setMine(r.data)).catch(() => {});
  }, []);

  // Initial load + ask for browser-notification permission (real-time, no polling)
  useEffect(() => { load(); requestPermission(); }, [load, requestPermission]);

  // Live GPS ping while online (for the admin live map). Uses browser geolocation.
  useEffect(() => {
    if (!online || !navigator.geolocation) return undefined;
    const send = (pos) => api.post("/partner/location", { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {});
    navigator.geolocation.getCurrentPosition(send, () => {}, { enableHighAccuracy: true });
    const id = navigator.geolocation.watchPosition(send, () => {}, { enableHighAccuracy: true, maximumAge: 30000 });
    return () => navigator.geolocation.clearWatch(id);
  }, [online]);

  // Live job dispatch over SSE — dashboard updates without any page refresh.
  useEffect(() => subscribe((ev) => {
    if (ev.type === "job_request") {
      playSound();
      const d = ev.data || {};
      browserNotify("🔔 New Job Request", `${d.service_name || "New service request"}${d.city ? " · " + d.city : ""}`);
      toast.success("🔔 New job request available", { description: `${d.service_name || ""}${d.city ? " · " + d.city : ""}` });
      load();
    } else if (ev.type === "job_taken") {
      setJobs((prev) => prev.filter((j) => j.id !== ev.data?.id));
    } else if (["job_accepted", "booking_update", "__resync__"].includes(ev.type)) {
      load();
    }
  }), [subscribe, load, playSound, browserNotify]);

  useEffect(() => {
    const h = (e) => setActive(e.detail);
    window.addEventListener("partner-nav", h);
    return () => window.removeEventListener("partner-nav", h);
  }, []);

  const toggleOnline = async (v) => {
    setOnline(v);
    try {
      const { data } = await api.put("/auth/partner/online-status", { online: v });
      setUser({ ...data, partner_status: v ? "online" : "offline" });
      toast.success(v ? "You are online" : "You are offline");
      if (v) { try { window.dispatchEvent(new Event("azo-partner-online")); } catch { /* ignore */ } }
    } catch (e) {
      // Roll back the optimistic UI toggle and surface a helpful message.
      setOnline(!v);
      toast.error(e?.response?.data?.detail || "Could not update status");
    }
  };

  const accept = async (id) => { await api.post(`/bookings/${id}/accept`); toast.success("Job accepted!"); setActive("active"); load(); };
  const decline = async (id) => {
    try { await api.post(`/bookings/${id}/reject`, { reason: "" }); toast.success("Job declined"); setJobs((prev) => prev.filter((j) => j.id !== id)); load(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Could not decline"); }
  };
  const activeJobs = mine.filter((b) => ["assigned", "arrived_shop", "arrived_customer", "started"].includes(b.status));
  const completedJobs = mine.filter((b) => ["completed", "paid"].includes(b.status));
  const [jobView, setJobView] = useState("active"); // "active" | "completed"

  // Starter Kit mandatory-area LOCK: partner must buy the kit before using the app.
  if (kit?.locked) {
    const LOCKED_NAV = [{ group: "Get Started", icon: Package, items: [{ key: "starterkit", label: "Starter Kit", icon: Package }] }];
    return (
      <PanelLayout title="Partner" nav={LOCKED_NAV} active="starterkit" onNavigate={() => {}}>
        <PartnerStarterKit status={kit} locked onPurchased={() => { loadKit(); refresh(); }} />
      </PanelLayout>
    );
  }

  // Maid partners get a work-focused menu — hide "Rewards & Challenges" for them.
  // Non-maid partners don't see "Maid Subscriptions" (parity with the mobile partner app).
  const isMaid = (user?.skills || []).includes("maid");
  const partnerNav = isMaid
    ? NAV.filter((n) => n.key !== "incentives")
    : NAV.filter((n) => n.key !== "subscriptions");

  return (
    <>
    <PanelLayout title="Partner" nav={partnerNav} active={active} onNavigate={setActive}
      appMode primaryTabs={PARTNER_TABS} badges={{ jobs: jobs.length, active: activeJobs.length }}>
      <OnboardingTour />
      <div className={`${active === "home" ? "hidden" : active === "invoices" ? "hidden" : "hidden lg:flex"} items-center justify-between mb-6`}>
        <div>
          {active === "home" ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">Welcome, {user?.name?.split(" ")[0]}</h1>
              </div>
            </>
          ) : (
            <>
              <h1 className="font-heading font-extrabold text-2xl text-slate-900 dark:text-white">{NAV.find((n) => n.key === active)?.label || "Dashboard"}</h1>
              <p className="text-slate-500 text-sm">Manage your {(NAV.find((n) => n.key === active)?.label || "").toLowerCase()}</p>
            </>
          )}
        </div>
      </div>

      {active === "home" && <div className="mb-6"><MissedRingRecovery onAccepted={() => { setActive("active"); load(); }} /></div>}

      {active === "home" && (user?.premium_partner || kit?.purchased) && (
        <div data-testid="pro-perks-section" className="mb-8 rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-white p-5">
          <button
            type="button"
            data-testid="pro-perks-toggle"
            aria-expanded={proOpen}
            onClick={() => setProOpen((v) => !v)}
            className="w-full flex items-center gap-2 text-left"
          >
            <div className="h-9 w-9 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 text-white flex items-center justify-center shadow-sm"><Crown className="h-5 w-5" /></div>
            <div className="flex-1 min-w-0">
              <p className="font-heading font-bold text-slate-900">{user?.partner_badge || kit?.badge_label || "AzoApp Pro"} perks</p>
              <p className="text-xs text-slate-500">Exclusive benefits for Pro members</p>
            </div>
            <ChevronDown className={`h-5 w-5 text-amber-500 shrink-0 transition-transform duration-200 ${proOpen ? "rotate-180" : ""}`} />
          </button>
          {proOpen && (
            <div className="grid sm:grid-cols-3 gap-3 mt-4">
              <div className="rounded-xl bg-white border border-amber-100 p-4">
                <Zap className="h-5 w-5 text-amber-500" />
                <p className="font-semibold text-sm text-slate-800 mt-2">Priority job access</p>
                <p className="text-[12px] text-slate-500 mt-0.5">You see &amp; can accept new jobs a 30-second head-start before non-Pro partners.</p>
              </div>
              <div className="rounded-xl bg-white border border-amber-100 p-4">
                <BadgeCheck className="h-5 w-5 text-amber-500" />
                <p className="font-semibold text-sm text-slate-800 mt-2">Pro badge on profile</p>
                <p className="text-[12px] text-slate-500 mt-0.5">Customers see your gold Pro badge — builds trust and wins more bookings.</p>
              </div>
              <div className="rounded-xl bg-white border border-amber-100 p-4">
                <ShieldCheck className="h-5 w-5 text-amber-500" />
                <p className="font-semibold text-sm text-slate-800 mt-2">Priority support</p>
                <p className="text-[12px] text-slate-500 mt-0.5">Faster help from our team whenever you need assistance.</p>
              </div>
            </div>
          )}
        </div>
      )}


      {active === "onboarding" && (
        user?.kyc_status === "approved" || user?.verified_partner ? (
          <PartnerProfileView user={user} kit={kit} />
        ) : (
          <PartnerOnboarding onDone={() => { refresh(); setActive("jobs"); }} />
        )
      )}

      {active !== "onboarding" && !user?.onboarding_submitted && user?.kyc_status !== "approved" && (
        <div data-testid="onboarding-banner" className="mb-6 rounded-2xl bg-primary-700 text-white p-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3"><ShieldCheck className="h-8 w-8" /><div><p className="font-heading font-bold text-lg">Complete your verification</p><p className="text-primary-100 text-sm">Finish onboarding &amp; KYC to start receiving jobs.</p></div></div>
          <Button data-testid="goto-onboarding" onClick={() => setActive("onboarding")} className="bg-white text-primary-700 hover:bg-primary-50">Complete now</Button>
        </div>
      )}

      {active === "jobs" && (
        <JobRequest
          jobs={jobs}
          loading={false}
          partnerId={user?.id}
          online={online}
          connected={connected}
          onAccept={accept}
          onDecline={decline}
          onReload={load}
        />
      )}

      {active === "active" && (
        <div data-testid="active-jobs">
          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              data-testid="job-view-active"
              onClick={() => setJobView("active")}
              className={`h-9 px-4 rounded-lg text-sm font-semibold transition ${jobView === "active" ? "bg-primary-700 text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"}`}
            >
              Active{activeJobs.length ? ` (${activeJobs.length})` : ""}
            </button>
            <button
              type="button"
              data-testid="job-view-completed"
              onClick={() => setJobView("completed")}
              className={`h-9 px-4 rounded-lg text-sm font-semibold transition ${jobView === "completed" ? "bg-emerald-600 text-white shadow-sm" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"}`}
            >
              Completed{completedJobs.length ? ` (${completedJobs.length})` : ""}
            </button>
          </div>

          {jobView === "active" ? (
            <div className="grid gap-4 xl:grid-cols-2">
              {activeJobs.length === 0 && <div className="xl:col-span-2"><Empty text="No active jobs. Accept a request to get started." /></div>}
              {activeJobs.map((b) => <ActiveJob key={b.id} b={b} onUpdate={load} />)}
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2" data-testid="completed-jobs">
              {completedJobs.length === 0 && <div className="xl:col-span-2"><Empty text="No completed jobs yet. Finished jobs will appear here." /></div>}
              {completedJobs.map((b) => <CompletedJob key={b.id} b={b} />)}
            </div>
          )}
        </div>
      )}

      {active === "earnings" && <EarningsLedger />}

      {active === "verification" && <VerificationSection />}
      {active === "home" && <PartnerHome onNavigate={setActive} user={user} kit={kit} online={online} onToggleOnline={toggleOnline} connected={connected} />}
      {active === "home" && <div className="mt-6"><PartnerAlertsPanel /></div>}
      {active === "bankkyc" && <BankKyc />}
      {active === "skills" && <SkillsSection />}
      {active === "training" && <TrainingSection />}
      {active === "availability" && <AvailabilitySection />}
      {active === "wallet" && <PartnerWalletV2 onNavigate={setActive} />}
      {active === "incentives" && <ChallengesRewards />}
      {active === "subscriptions" && <PartnerSubscriptions />}
      {active === "analytics" && <PremiumAnalytics role="partner" title="Earnings Analytics" />}
      {active === "invoices" && <MerchantInvoices role="partner" shopName={user?.name || "Partner"} title="My Invoices" subtitle="Booking, earnings, settlement & withdrawal documents" />}
      {active === "support" && <SupportCenter />}
      {active === "starterkit" && <PartnerStarterKit status={kit} onPurchased={() => { loadKit(); refresh(); }} />}
    </PanelLayout>
    <IncomingJobRing onAccepted={() => { setActive("active"); load(); }} onChanged={load} />
    <ScheduleAlerts role="partner" onChanged={load} />
    <RescheduleRing onResolved={load} />
    </>
  );
}

const ActiveJob = ({ b, onUpdate }) => {
  const [chatOpen, setChatOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const chatUnread = useChatUnread(b.id);
  const [showResched, setShowResched] = useState(false);
  const [reschedVal, setReschedVal] = useState("");
  const [reschedBusy, setReschedBusy] = useState(false);
  const [nowTs, setNowTs] = useState(Date.now());
  useEffect(() => {
    if (b.status !== "started") return undefined;
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [b.status]);
  const reject = async () => {
    if (!window.confirm("Reject this job? It will be sent back to admin for re-assignment.")) return;
    try { await api.post(`/bookings/${b.id}/reject`, { reason: "" }); toast.success("Job rejected"); onUpdate(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed to reject"); }
  };
  const [sharing, setSharing] = useState(false);
  const shareLocation = () => {
    if (!navigator.geolocation) return toast.error("Geolocation not supported on this device");
    setSharing(true);
    const send = (pos) => api.post(`/bookings/${b.id}/location`, { lat: pos.coords.latitude, lng: pos.coords.longitude }).catch(() => {});
    const onErr = (e) => {
      setSharing(false);
      toast.error(e && e.code === 1
        ? "Location permission denied. Allow location access to share your live location."
        : "Couldn't get your location. Please check GPS and try again.");
    };
    navigator.geolocation.getCurrentPosition(send, onErr, { enableHighAccuracy: true, timeout: 10000 });
    const id = navigator.geolocation.watchPosition(send, () => {}, { enableHighAccuracy: true });
    toast.success("Sharing live location with customer");
    setTimeout(() => { navigator.geolocation.clearWatch(id); setSharing(false); }, 120000);
  };

  const a = b.address || {};
  const hasGeo = a.lat && a.lng;
  const dest = hasGeo ? `${a.lat},${a.lng}` : encodeURIComponent(`${a.line || ""}, ${a.city || ""} ${a.pincode || ""}`);
  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
  const det = (b.eligible_detail || {})[b.partner_id] || {};
  const schedLabel = b.scheduled_at
    ? new Date(b.scheduled_at).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
    : "Now";
  const last4 = String(b.customer_phone || "").replace(/\D/g, "").slice(-4);
  const maskedPhone = last4 ? `+91 XXXXX X${last4}` : "";
  const startedAt = (b.timeline || []).filter((t) => ["started", "in_progress"].includes(t.status)).map((t) => t.at).pop();
  const elapsedMs = startedAt ? Math.max(0, nowTs - new Date(startedAt).getTime()) : 0;
  const es = Math.floor(elapsedMs / 1000);
  const elapsed = `${String(Math.floor(es / 3600)).padStart(2, "0")}:${String(Math.floor((es % 3600) / 60)).padStart(2, "0")}:${String(es % 60).padStart(2, "0")}`;
  const arrived = ["arrived_shop", "arrived_customer"].includes(b.status);
  const inProgress = b.status === "started";
  const sched = b.schedule || {};
  const commLocked = !!sched.comm_locked;
  const pendingReq = b.reschedule_request && b.reschedule_request.status === "pending" ? b.reschedule_request : null;
  const iRequested = pendingReq && pendingReq.requested_by_role === "partner";
  const theyRequested = pendingReq && pendingReq.requested_by_role === "customer";
  const showSchedule = !["completed", "paid", "cancelled"].includes(b.status);
  const canRequestResched = !pendingReq && ["assigned", "arrived_shop", "arrived_customer"].includes(b.status);
  const requestResched = async () => {
    if (!reschedVal) return toast.error("Pick a new date & time");
    setReschedBusy(true);
    try {
      await api.post(`/bookings/${b.id}/reschedule/request`, { scheduled_at: reschedVal });
      toast.success("Reschedule request sent to the customer");
      setShowResched(false); setReschedVal(""); onUpdate();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not send request"); }
    finally { setReschedBusy(false); }
  };
  const respondResched = async (action) => {
    setReschedBusy(true);
    try {
      await api.post(`/bookings/${b.id}/reschedule/respond`, { action });
      toast.success(action === "accept" ? "Reschedule accepted" : "Reschedule declined");
      onUpdate();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not respond"); }
    finally { setReschedBusy(false); }
  };
  const cancelResched = async () => {
    setReschedBusy(true);
    try {
      await api.post(`/bookings/${b.id}/reschedule/cancel`);
      toast.success("Reschedule request withdrawn");
      onUpdate();
    } catch (e) { toast.error(e?.response?.data?.detail || "Could not withdraw"); }
    finally { setReschedBusy(false); }
  };
  const openChat = () => {
    if (commLocked) { toast.info("Chat unlocks 30 minutes before the scheduled time"); return; }
    setChatOpen(true);
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-[0_8px_30px_rgba(2,32,71,0.06)] overflow-hidden" data-testid={`active-job-${b.code}`}>
      {/* State banner */}
      {inProgress ? (
        <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-5 py-3 flex items-center gap-3">
          <span className="relative flex h-2.5 w-2.5"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/70" /><span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-white" /></span>
          <div className="min-w-0 flex-1">
            <p className="font-heading font-extrabold text-sm leading-none">WORK IN PROGRESS</p>
            <p className="text-[11.5px] text-amber-50/90 mt-0.5 truncate">{b.service_name}{startedAt ? ` · started ${new Date(startedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : ""}</p>
          </div>
          {startedAt && <span data-testid={`elapsed-${b.code}`} className="font-mono font-bold text-sm tabular-nums bg-white/20 rounded-lg px-2 py-1 shrink-0">{elapsed}</span>}
        </div>
      ) : arrived ? (
        <div className="bg-gradient-to-r from-violet-600 to-primary-700 text-white px-5 py-3 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" /><p className="font-heading font-bold text-sm">You&apos;ve arrived — verify the customer to start</p>
        </div>
      ) : (
        <div className="bg-gradient-to-r from-primary-700 to-primary-500 text-white px-5 py-3 flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0" /><p className="font-heading font-bold text-sm">New job assigned — head to the customer</p>
        </div>
      )}

      <div className="p-5 space-y-4">
        {/* Header (click → job wizard): soft tinted band, gradient icon tile, big status pill */}
        <button type="button" data-testid={`job-card-${b.code}`} onClick={() => setWizardOpen(true)}
          className={`w-full text-left -mx-4 -mt-4 px-4 pt-4 pb-3.5 rounded-t-[20px] transition ${inProgress ? "bg-emerald-50 dark:bg-emerald-900/15 hover:bg-emerald-100/70" : "bg-primary-50/70 dark:bg-primary-900/15 hover:bg-primary-100/60"}`} style={{ width: "calc(100% + 2rem)" }}>
          <div className="flex items-center gap-3">
            <span className={`h-12 w-12 rounded-2xl grid place-items-center text-white shrink-0 shadow-md ${inProgress ? "bg-gradient-to-br from-emerald-600 to-emerald-500 shadow-emerald-600/25" : "bg-gradient-to-br from-primary-700 to-primary-500 shadow-primary-700/25"}`}><Wrench className="h-5.5 w-5.5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-heading font-extrabold text-slate-900 dark:text-white leading-snug break-words text-[16px]">{b.service_name}</p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[11px] font-mono font-bold text-slate-500 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-2 py-0.5">#{b.code}</span>
                {b.category_name && <span className="text-[11.5px] text-slate-500">{b.category_name}</span>}
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <span data-testid={`status-pill-${b.code}`} className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-full text-white text-[12.5px] font-extrabold capitalize ${inProgress ? "bg-emerald-600" : "bg-primary-600"}`}>
              <span className="h-2 w-2 rounded-full bg-white/90" />{inProgress ? "Work in progress" : String(b.status || "").replace(/_/g, " ")}
            </span>
            <span className={`font-extrabold text-[15px] ${inProgress ? "text-emerald-700" : "text-primary-700"}`}>{fmt(b.breakdown?.total || b.total || 0)}</span>
          </div>
        </button>

        {/* Customer location (no map) */}
        <div className="flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3.5 py-3">
          <MapPin className="h-4 w-4 text-primary-600 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-slate-800 dark:text-slate-100 leading-snug">{a.line || "Address unavailable"}{a.city ? `, ${a.city}` : ""}</p>
            <p className="text-[11.5px] text-slate-400 mt-0.5">{a.pincode || ""}{det.distance_km != null ? ` · ~${det.distance_km} km` : ""}{det.eta_min != null ? ` · ~${det.eta_min} min` : ""}</p>
          </div>
        </div>

        {/* Progress stepper */}
        <JobStepper status={b.status} />

        {showSchedule && <ScheduledCard schedule={sched} role="partner" />}

        {pendingReq && (
          <div data-testid={`reschedule-pending-${b.code}`} className="rounded-2xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-4">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 dark:text-amber-300 flex items-center gap-1.5"><Clock className="h-4 w-4" /> Reschedule request · pending</p>
            <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{pendingReq.requester_name} · {b.service_name}</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/70 dark:bg-slate-900/40 p-2.5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current schedule</p>
                <p className="text-[13px] font-bold text-slate-700 dark:text-slate-200">{pendingReq.old_date}</p>
                <p className="text-[13px] font-bold text-slate-700 dark:text-slate-200">{pendingReq.old_time}</p>
              </div>
              <div className="rounded-xl bg-white/70 dark:bg-slate-900/40 p-2.5 ring-1 ring-amber-200">
                <p className="text-[10px] font-bold uppercase tracking-wider text-amber-500">New request</p>
                <p className="text-[13px] font-black text-amber-700 dark:text-amber-300">{pendingReq.new_date}</p>
                <p className="text-[13px] font-black text-amber-700 dark:text-amber-300">{pendingReq.new_time}</p>
              </div>
            </div>
            {theyRequested ? (
              <div className="mt-3 flex gap-2">
                <Button size="sm" disabled={reschedBusy} data-testid={`reschedule-accept-${b.code}`} onClick={() => respondResched("accept")} className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold">Accept reschedule</Button>
                <Button size="sm" variant="outline" disabled={reschedBusy} data-testid={`reschedule-reject-${b.code}`} onClick={() => respondResched("reject")} className="flex-1 rounded-xl border-rose-200 text-rose-600 hover:bg-rose-50">Reject</Button>
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-[12px] text-amber-700 dark:text-amber-200">Waiting for the customer to accept.</p>
                <Button size="sm" variant="outline" disabled={reschedBusy} data-testid={`reschedule-withdraw-${b.code}`} onClick={cancelResched} className="rounded-xl">Withdraw</Button>
              </div>
            )}
          </div>
        )}

        {/* Primary CTA — Navigate (opens device navigation, NO embedded map) */}
        <div>
          {commLocked ? (
            <button type="button" disabled data-testid={`navigate-locked-${b.code}`}
              className="w-full h-12 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 font-semibold flex items-center justify-center gap-2 cursor-not-allowed">
              <Lock className="h-5 w-5" /> Navigation locked
            </button>
          ) : (
            <a href={navUrl} target="_blank" rel="noreferrer" data-testid={`navigate-${b.code}`}
              className="w-full h-12 rounded-xl bg-primary-700 hover:bg-primary-800 active:scale-[0.99] transition text-white font-semibold flex items-center justify-center gap-2 shadow-sm">
              <Navigation className="h-5 w-5" /> Navigate to Customer
            </a>
          )}
          <p className="text-[11.5px] text-slate-400 text-center mt-1.5">{commLocked ? "Available 30 minutes before the scheduled time" : "Opens directions to the customer's location"}</p>
        </div>

        {/* Contact */}
        <div className="grid grid-cols-2 gap-2">
          {commLocked ? (
            <span data-testid={`call-locked-${b.code}`} className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 font-semibold text-sm flex items-center justify-center gap-1.5"><Lock className="h-4 w-4" /> Call</span>
          ) : b.customer_phone ? (
            <a href={`tel:${b.customer_phone}`} data-testid={`call-cust-${b.code}`} className="h-11 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-semibold text-sm flex items-center justify-center gap-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 azo-press"><Phone className="h-4 w-4" /> Call</a>
          ) : (
            <span className="h-11 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-300 dark:text-slate-600 font-semibold text-sm flex items-center justify-center gap-1.5"><Phone className="h-4 w-4" /> Call</span>
          )}
          <button type="button" onClick={openChat} disabled={commLocked} data-testid={`chat-cust-${b.code}`} className="h-11 rounded-xl border border-primary-200 dark:border-primary-800 text-primary-700 dark:text-primary-300 font-semibold text-sm flex items-center justify-center gap-1.5 hover:bg-primary-50 dark:hover:bg-primary-900/20 azo-press disabled:opacity-50">{commLocked ? <Lock className="h-4 w-4" /> : <MessageCircle className="h-4 w-4" />} Chat{!commLocked && <UnreadPill count={chatUnread} testId={`chat-unread-${b.code}`} />}</button>
        </div>

        {/* Job & customer details (collapsible) */}
        <Collapse title="Job & customer details" icon={UserIcon} testid={`details-collapse-${b.code}`}>
          <div className="grid grid-cols-2 gap-2">
            <InfoItem icon={UserIcon} label="Customer" value={b.customer_name} />
            <InfoItem icon={Wrench} label="Service" value={b.service_name} />
            <InfoItem icon={CalendarClock} label="Schedule" value={schedLabel} />
            <InfoItem icon={CheckCircle2} label="Job value" value={fmt((b.breakdown && b.breakdown.total) || b.total || (b.pricing && b.pricing.total) || 0)} />
          </div>
          {/* Point #9 — every service + add-on in this order, itemised (excl. GST) +
              applicable Visiting/Emergency charges + Total Service Amount (excl. GST) */}
          <ServiceBreakdown booking={b} fmt={fmt} className="mt-3" showCharges hidePlatformFees
            title="Services to do" compact />
          {maskedPhone && <p className="text-[12px] text-slate-400 mt-2 flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {maskedPhone} <span className="text-slate-300 dark:text-slate-600">· number protected</span></p>}
        </Collapse>

        {/* Job timeline (collapsible) */}
        {(b.timeline || []).length > 0 && (
          <Collapse title="Job timeline" icon={Clock} testid={`timeline-collapse-${b.code}`}>
            <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-1.5 space-y-3 pt-1">
              {(b.timeline || []).map((t, i) => (
                <li key={i} className="ml-4">
                  <span className="absolute -left-[7px] mt-0.5 h-3 w-3 rounded-full bg-primary-600 ring-4 ring-primary-100 dark:ring-primary-900/40" />
                  <p className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 capitalize">{String(t.status || "").replace(/_/g, " ")}</p>
                  <p className="text-[11px] text-slate-400">{t.at ? new Date(t.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</p>
                </li>
              ))}
            </ol>
          </Collapse>
        )}

        {/* Wizard entry — Details → Selfie check-in → Before proof + Start OTP → After proof + Complete OTP */}
        <button type="button" data-testid={`open-job-${b.code}`} onClick={() => setWizardOpen(true)}
          className={`w-full h-12 rounded-xl text-white font-extrabold flex items-center justify-center gap-2 shadow-sm azo-press ${inProgress ? "bg-emerald-600 hover:bg-emerald-700" : "bg-primary-600 hover:bg-primary-700"}`}>
          {inProgress ? <CheckCircle2 className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
          {inProgress ? "Continue · Complete Job" : b.checkin ? "Continue · Start Job" : "Continue · Check-in & Start"}
          <ChevronDown className="h-5 w-5 -rotate-90" />
        </button>

        {/* Secondary actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {b.status === "assigned" && (
            <Button data-testid={`reject-${b.code}`} size="sm" variant="outline" className="flex-1 h-11 rounded-xl border-red-200 text-red-600 hover:bg-red-50" onClick={reject}>Reject Job</Button>
          )}
          {canRequestResched && (
            <Button data-testid={`reschedule-${b.code}`} size="sm" variant="outline" className="flex-1 h-11 rounded-xl" onClick={() => setShowResched(true)}>
              <Clock className="h-4 w-4 mr-1.5" /> Request Reschedule
            </Button>
          )}
          {["arrived_customer", "started", "assigned"].includes(b.status) && (
            <Button data-testid={`share-loc-${b.code}`} size="sm" variant="outline" onClick={shareLocation} disabled={sharing} className="flex-1 h-11 rounded-xl">
              <Navigation className="h-4 w-4 mr-1.5" /> {sharing ? "Sharing…" : "Share Location"}
            </Button>
          )}
        </div>

        {["assigned", "arrived_shop", "arrived_customer", "started"].includes(b.status) && (
          <HelpSOS booking={b} role="partner" />
        )}

        {showResched && (
          <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/50 p-4" onClick={() => setShowResched(false)}>
            <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-2xl max-h-[88vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} data-testid={`reschedule-modal-${b.code}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-heading font-bold text-slate-900 dark:text-white">Request reschedule</h3>
                <button onClick={() => setShowResched(false)} className="h-8 w-8 grid place-items-center rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><XIcon className="h-4 w-4" /></button>
              </div>
              <p className="text-[12.5px] text-slate-500 dark:text-slate-400">Current: <b>{sched.is_scheduled ? `${sched.scheduled_date} · ${sched.scheduled_time}` : "Now (instant)"}</b>. The booking time changes only after the customer accepts.</p>
              <label className="block mt-3 mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">Pick a new date &amp; time slot</label>
              <SchedulePicker value={reschedVal || null} onChange={setReschedVal} />
              <Button data-testid={`reschedule-confirm-${b.code}`} disabled={reschedBusy || !reschedVal} onClick={requestResched}
                className="w-full mt-4 h-11 rounded-xl bg-primary-700 hover:bg-primary-800 font-semibold disabled:opacity-50">{reschedBusy ? "Sending…" : "Send reschedule request"}</Button>
            </div>
          </div>
        )}

        {/* Controlled chat sheet (no duplicate action bar) */}
        <BookingChat booking={b} role="partner" open={chatOpen} onOpenChange={setChatOpen} hideBar />
        {wizardOpen && <JobWizard booking={b} onClose={() => { setWizardOpen(false); onUpdate(); }} onUpdate={onUpdate} />}

      </div>
    </div>
  );
};

const CompletedJob = ({ b }) => {
  const a = b.address || {};
  const completedAt = (b.timeline || []).filter((t) => t.status === "completed").map((t) => t.at).pop() || b.updated_at;
  const earning = (b.commission && b.commission.partner_earning) != null
    ? b.commission.partner_earning
    : null;
  const jobValue = b.total || (b.pricing && b.pricing.total) || 0;
  return (
    <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-[0_8px_30px_rgba(2,32,71,0.06)] overflow-hidden" data-testid={`completed-job-${b.code}`}>
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-500 text-white px-5 py-3 flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-heading font-extrabold text-sm leading-none">JOB COMPLETED</p>
          <p className="text-[11.5px] text-emerald-50/90 mt-0.5 truncate">
            {completedAt ? new Date(completedAt).toLocaleString("en-IN", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
          </p>
        </div>
      </div>

      <div className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <span className="h-11 w-11 rounded-2xl grid place-items-center text-white shrink-0" style={{ background: "#059669" }}><Wrench className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="font-heading font-bold text-slate-900 dark:text-white leading-snug break-words">{b.service_name}</p>
              <p className="text-xs text-slate-400 font-mono mt-0.5">#{b.code}</p>
            </div>
          </div>
          <StatusBadge status={b.status} />
        </div>

        <div className="flex items-start gap-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 px-3.5 py-3">
          <MapPin className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[13.5px] font-semibold text-slate-800 dark:text-slate-100 leading-snug">{a.line || "Address unavailable"}{a.city ? `, ${a.city}` : ""}</p>
            <p className="text-[11.5px] text-slate-400 mt-0.5">{a.pincode || ""}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <InfoItem icon={UserIcon} label="Customer" value={b.customer_name} />
          <InfoItem icon={CheckCircle2} label="Job value" value={fmt(jobValue)} />
        </div>

        {earning != null && (
          <div className="rounded-xl border-2 border-emerald-100 dark:border-emerald-900/40 bg-emerald-50/50 dark:bg-emerald-900/10 px-4 py-3 flex items-center justify-between">
            <p className="text-[12.5px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5"><TrendingUp className="h-4 w-4" /> You earned</p>
            <p className="font-heading font-extrabold text-lg text-emerald-700 dark:text-emerald-300">{fmt(earning)}</p>
          </div>
        )}

        {(b.timeline || []).length > 0 && (
          <Collapse title="Job timeline" icon={Clock} testid={`completed-timeline-${b.code}`}>
            <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-1.5 space-y-3 pt-1">
              {(b.timeline || []).map((t, i) => (
                <li key={i} className="ml-4">
                  <span className="absolute -left-[7px] mt-0.5 h-3 w-3 rounded-full bg-emerald-600 ring-4 ring-emerald-100 dark:ring-emerald-900/40" />
                  <p className="text-[12.5px] font-semibold text-slate-700 dark:text-slate-200 capitalize">{String(t.status || "").replace(/_/g, " ")}</p>
                  <p className="text-[11px] text-slate-400">{t.at ? new Date(t.at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}</p>
                </li>
              ))}
            </ol>
          </Collapse>
        )}
      </div>
    </div>
  );
};

const STAGE_STEPS = [
  { key: "assigned", label: "Assigned", match: ["assigned"] },
  { key: "arrived", label: "Arrived", match: ["arrived_shop", "arrived_customer"] },
  { key: "started", label: "In Progress", match: ["started"] },
  { key: "completed", label: "Completed", match: ["completed"] },
];
const stageIndex = (status) => {
  const i = STAGE_STEPS.findIndex((s) => s.match.includes(status));
  return i < 0 ? 0 : i;
};

function JobStepper({ status }) {
  const cur = stageIndex(status);
  return (
    <div className="flex items-start" data-testid="job-stepper">
      {STAGE_STEPS.map((s, i) => {
        const done = i < cur;
        const current = i === cur;
        return (
          <div key={s.key} className="flex-1 flex flex-col items-center">
            <div className="flex items-center w-full">
              <div className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : done || current ? "bg-primary-600" : "bg-slate-200 dark:bg-slate-700"}`} />
              <div className={`grid place-items-center h-6 w-6 rounded-full shrink-0 transition-colors ${done ? "bg-primary-600 text-white" : current ? "bg-primary-600 text-white ring-4 ring-primary-100 dark:ring-primary-900/40" : "bg-slate-200 dark:bg-slate-700 text-slate-400"}`}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : current ? <span className="h-2 w-2 rounded-full bg-white" /> : <Circle className="h-2 w-2" />}
              </div>
              <div className={`h-0.5 flex-1 ${i === STAGE_STEPS.length - 1 ? "opacity-0" : done ? "bg-primary-600" : "bg-slate-200 dark:bg-slate-700"}`} />
            </div>
            <span className={`text-[10px] font-semibold mt-1.5 text-center leading-tight ${current ? "text-primary-700 dark:text-primary-300" : done ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600"}`}>{s.label}</span>
          </div>
        );
      })}
    </div>
  );
}

function Collapse({ title, icon: Icon, children, defaultOpen = false, testid }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
      <button type="button" data-testid={testid} onClick={() => setOpen((o) => !o)} className="w-full flex items-center gap-2 px-3.5 py-3 text-left">
        {Icon && <Icon className="h-4 w-4 text-slate-400 shrink-0" />}
        <span className="text-[13px] font-bold text-slate-700 dark:text-slate-200 flex-1">{title}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.22 }} className="overflow-hidden">
            <div className="px-3.5 pb-3.5 pt-0.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">{Icon && <Icon className="h-3 w-3" />}{label}</p>
      <p className="text-[13.5px] font-semibold text-slate-800 dark:text-slate-100 mt-0.5 truncate">{value || "—"}</p>
    </div>
  );
}

const Empty = ({ text }) => <div className="bg-white rounded-xl border border-dashed border-slate-200 p-10 text-center text-slate-400">{text}</div>;
