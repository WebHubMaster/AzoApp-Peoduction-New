import { useEffect, useState, useCallback, useMemo } from "react";
import { LayoutDashboard, ClipboardList, Wallet, RefreshCcw, Wrench, Store, Users, IndianRupee,
  Percent, Tag, Bell, Send, Ticket, Image, FileText, HelpCircle, ShieldCheck, Sparkles,
  Activity, MapPin, ShieldAlert, Boxes, Truck, Megaphone, Crown, Gift, ScrollText, ShieldQuestion, KeyRound,
  Layers, Award, GraduationCap, Briefcase, TrendingUp, Receipt, Coins, Handshake, BadgePercent,
  Globe, Route, FileSearch, MessageSquare, BarChart3, Lock, Settings, ClipboardCheck, Search, Radio, Banknote, Clock, Package, Star, Plus, QrCode, Smartphone } from "lucide-react";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import useTabParam from "@/hooks/useTabParam";
import { PanelLayout } from "@/components/PanelLayout";
import OnboardingTour from "@/components/tour/OnboardingTour";
import { AiChat } from "@/components/AiChat";
import * as S from "@/pages/admin/adminSections";
import * as P from "@/pages/admin/adminSectionsPro";
import { PageEditorPro, FaqManagerPro, BlogManagerPro } from "@/pages/admin/cms/CmsManagers";
import * as PM from "@/pages/admin/partnerAdminSections";
import { PerformanceManager, IncentivesManagerPro, PenaltiesManagerPro } from "@/pages/admin/partnerGrowthPro";
import RolesPermissions from "@/pages/admin/RolesPermissions";
import * as PR from "@/pages/admin/partnerRegAdminSections";
import { TemplateManager, IntegrationCenter } from "@/pages/admin/adminTemplateIntegration";
import { InvoiceManagement, BusinessConfigSettings } from "@/pages/admin/InvoiceAdmin";
import TestimonialsManager from "@/pages/admin/TestimonialsManager";
import RatingsReviews from "@/pages/admin/RatingsReviews";
import RateCardsManager from "@/pages/admin/RateCardsManager";
import StarterKitManager from "@/pages/admin/StarterKitManager";
import KycApprovals from "@/pages/admin/KycApprovals";
import PeopleList from "@/pages/admin/people/PeopleList";
import Person360 from "@/pages/admin/people/Person360";
import TransactionsHub from "@/pages/admin/TransactionsHub";
import RefundsHub from "@/pages/admin/RefundsHub";
import SupportInbox from "@/pages/admin/SupportInbox";
import FinancialReports from "@/pages/admin/FinancialReports";
import MembershipManager from "@/pages/admin/MembershipManager";
import GrowthCenter from "@/pages/admin/GrowthCenter";
import AppHomeManager from "@/pages/admin/AppHomeManager";
import CouponsManager from "@/components/marketing/CouponsManager";
import OffersManager from "@/components/marketing/OffersManager";
import MerchantWithdrawals from "@/pages/admin/MerchantWithdrawals";
import LivePartnerMap from "@/pages/admin/LivePartnerMap";
import CoverageMap from "@/pages/admin/CoverageMap";
import { AdminJobRequests, AreaPartners, RealtimeSettings, AdminDispatchFeed } from "@/pages/admin/adminRealtimeSections";
import { SurgeRulesManager, ServiceAreasManager, LaunchDemandManager } from "@/pages/admin/serviceOpsSections";
import AdminDashboardHome from "@/pages/admin/AdminDashboardHome";
import PerformanceCenter from "@/pages/admin/PerformanceCenter";
import CustomJobsAdmin from "@/pages/admin/CustomJobsAdmin";
import QRConfig, { AgentPayouts } from "@/pages/admin/QRConfig";

const NAV = [
  { group: "Overview", items: [{ key: "dashboard", label: "Dashboard", icon: LayoutDashboard }] },

  { group: "Bookings", icon: ClipboardList, items: [
    { key: "bookings", label: "Bookings", icon: ClipboardList },
  ] },
  { group: "Live Dispatch Feed", icon: Radio, items: [
    { key: "dispatch_feed", label: "Live Dispatch Feed", icon: Radio },
  ] },
  { group: "Live Operations", icon: Activity, items: [
    { key: "liveops", label: "Live Operations", icon: Activity },
  ]},
  { group: "Live Partner Map", icon: MapPin, items: [
    { key: "livemap", label: "Live Partner Map", icon: MapPin },
  ]},

  { group: "Services", icon: Layers, items: [
    { key: "services", label: "Services", icon: ClipboardList },
    { key: "addons", label: "Add-on Services", icon: Plus },
    { key: "custom_jobs", label: "Custom Job", icon: Wrench },
    { key: "categories", label: "Service Categories", icon: Tag },
    { key: "subcategories", label: "Sub-Categories", icon: Layers },
    { key: "ratings", label: "Ratings & Reviews", icon: Star },
  ]},

  { group: "Services Config", icon: Settings, items: [
    { key: "rate_cards", label: "Rate Cards", icon: IndianRupee },
    { key: "surge", label: "Surge Rules", icon: TrendingUp },
    { key: "service_areas", label: "Service Areas", icon: MapPin },
    { key: "coverage_map", label: "Coverage Map", icon: MapPin },
    { key: "launch_demand", label: "Launch Demand", icon: Users },
  ]},

  { group: "Partners", icon: Wrench, items: [
    { key: "partners", label: "Partners", icon: Wrench },
    { key: "kyc_approvals", label: "KYC Approvals", icon: ShieldCheck },
    { key: "pro_partners", label: "Pro Partner", icon: Crown },
    { key: "area_partners", label: "Area Partner", icon: MapPin },
  ]},
  { key: "starter_kit_admin", label: "Starter Kit", icon: Package },
  { group: "Notifications", icon: Bell, items: [
    { key: "notifications", label: "Add Notification", icon: Send },
    { key: "realtime_settings", label: "Real-time & Alerts", icon: Radio },
  ]},
  { group: "Partner Growth", icon: TrendingUp, items: [
    { key: "partner_performance", label: "Performance", icon: TrendingUp },
    { key: "pm_incentives", label: "Incentives", icon: Gift },
    { key: "pm_penalties", label: "Penalties", icon: ShieldAlert },
    { key: "pm_payout_log", label: "Payout Log", icon: Banknote },
  ]},

  { group: "Customers", icon: Users, items: [
    { key: "customers", label: "Customers", icon: Users },
    { key: "authcfg", label: "Auth & Profile", icon: ShieldCheck },
    { key: "addresscfg", label: "Addresses", icon: MapPin },
    { key: "deletions", label: "Account Deletions", icon: ShieldAlert },
  ]},

  { group: "Merchants", icon: Store, items: [
    { key: "merchants", label: "Merchants", icon: Store },
  ]},

  { group: "Physical QR Kit", icon: QrCode, items: [
    { key: "qr_batches", label: "QR Batches", icon: Layers },
    { key: "qr_map", label: "Map / Assign", icon: QrCode },
    { key: "qr_registry", label: "Registry", icon: QrCode },
    { key: "qr_agents", label: "Agents", icon: Users },
    { key: "qr_agent_payouts", label: "Agent Withdraw", icon: Banknote },
  ]},

  { group: "Finance", icon: Wallet, items: [
    { key: "pm_withdrawals", label: "Withdraw Requests", icon: Banknote },
    { key: "ledger", label: "Transactions", icon: Receipt },
    { key: "invoices", label: "Invoice Management", icon: Receipt },
    { key: "refunds", label: "Refunds", icon: RefreshCcw },
    { key: "fin_reports", label: "Financial Reports", icon: BarChart3 },
  ]},

  { group: "Marketing", icon: Megaphone, items: [
    { key: "coupons", label: "Coupons", icon: Tag },
    { key: "offers", label: "Offers", icon: BadgePercent },
    { key: "banners", label: "Banners & Sliders", icon: Image },
    { key: "memberships", label: "Membership", icon: Crown },
    { key: "growth", label: "Growth Center", icon: Sparkles },
  ]},

  { group: "Mobile App", icon: Smartphone, items: [
    { key: "app_home", label: "Customer App Home", icon: Smartphone },
  ]},

  { group: "Website / CMS", icon: Globe, items: [
    { key: "homepage", label: "Homepage Builder", icon: LayoutDashboard },
    { key: "media", label: "Media Library", icon: Image },
    { key: "about", label: "About Us", icon: FileText },
    { key: "contact", label: "Contact Us", icon: FileText },
    { key: "privacy", label: "Privacy Policy", icon: FileText },
    { key: "terms", label: "Terms & Conditions", icon: FileText },
    { key: "refund", label: "Refund Policy", icon: FileText },
    { key: "faqs", label: "FAQ", icon: HelpCircle },
    { key: "testimonials", label: "Testimonials", icon: MessageSquare },
    { key: "blogs", label: "Blog", icon: FileText },
  ]},

  { group: "SEO", icon: Search, items: [
    { key: "seo_dashboard", label: "SEO Dashboard", icon: Search },
    { key: "global_seo", label: "Global SEO", icon: Globe },
    { key: "sitemap", label: "Sitemap & Robots", icon: Route },
    { key: "redirects", label: "Redirects", icon: Route },
  ]},

  { key: "tickets", label: "Support Tickets", icon: Ticket },
  { key: "reg_templates", label: "Template Manager", icon: MessageSquare },

  { group: "Reports & Analytics", icon: BarChart3, items: [
    { key: "reports_overview", label: "Overview", icon: BarChart3 },
    { key: "export_center", label: "Export Center", icon: FileText },
    { key: "report_builder", label: "Report Builder", icon: FileText },
    { key: "scheduled_reports", label: "Scheduled Reports", icon: Clock },
  ]},

  { group: "Access Control", icon: Lock, items: [
    { key: "sysusers", label: "Admin Users", icon: Users },
    { key: "roles", label: "Roles & Permissions", icon: Lock },
  ]},

  { group: "System", icon: Settings, items: [
    { key: "integration_center", label: "Integration Center", icon: KeyRound },
    { key: "branding", label: "Branding & Theme", icon: Sparkles },
    { key: "settings_general", label: "General Settings", icon: Settings },
  ]},

  { group: "Platform", icon: Activity, items: [
    { key: "sys_performance", label: "Performance", icon: Activity },
  ]},
];

// ---- RBAC: map each nav group / standalone item to a permission module ----
const GROUP_MODULE = {
  "Overview": "dashboard", "Bookings": "bookings", "Live Operations": "live_operations",
  "Live Partner Map": "live_partner_map", "Services": "services", "Services Config": "services", "Partners": "partners",
  "Notifications": "notifications", "Partner Growth": "partner_growth", "Customers": "customers",
  "Merchants": "merchants", "Finance": "finance", "Marketing": "marketing",
  "Website / CMS": "website_cms", "Mobile App": "website_cms", "SEO": "seo", "Reports & Analytics": "reports_analytics",
  "Access Control": "access_control", "System": "system", "Platform": "system",
};
const ITEM_MODULE = { tickets: "communication", reg_templates: "communication", starter_kit_admin: "partners" };
// reverse: nav key -> module (for guarding the active section)
const KEY_MODULE = (() => {
  const m = { ...ITEM_MODULE };
  NAV.forEach((entry) => {
    if (entry.items) {
      const mod = GROUP_MODULE[entry.group];
      entry.items.forEach((it) => { if (mod) m[it.key] = mod; });
    }
  });
  return m;
})();
const KNOWN = new Set(["dashboard","bookings","payouts","refunds","partners","pro_partners","merchants","customers","app_home",
  "authcfg","addresscfg","deletions","categories","subcategories","services","addons","custom_jobs","ratings","homepage","media","branding","rate_cards",
  "about","contact","privacy","terms","refund","commission","pricing","surge","ledger","coupons","notifications","tickets","banners","blogs","testimonials","starter_kit_admin",
  "faqs","plans","sysusers","liveops","locations","campaigns","memberships","growth","spareparts","vendors",  "complaints","disputes","warranty","roles","flags","integrations","audit","ai","pm_workflow","pm_verify",
  "pm_skills","pm_certs","pm_withdrawals","payout_config","invoice_config","pm_incentives","pm_penalties","pm_payout_log","pm_training","pm_leaves","business","sms_templates",
  "service_requests","checklists","service_areas","launch_demand","coverage_map","partner_jobs","partner_performance","merchant_verification",
  "merchant_services","merchant_orders","merchant_settlements","taxes","settlements","fin_reports","offers","pages",
  "seo_dashboard","global_seo","category_seo","service_seo","sitemap","schema","redirects","channels",
  "reports_overview","export_center","login_activity","settings_general","storage_settings",
  "integration_center","reg_templates","reg_kyc_pending","reg_kyc_approved","reg_kyc_rejected",
  "reg_education","reg_experience","reg_notifications","area_partners","realtime_settings","dispatch_feed","sys_performance"]);

const SOON_TITLES = {
  service_requests: "Service Requests", checklists: "Service Checklists", service_areas: "Service Areas",
  partner_jobs: "Job Requests", partner_performance: "Partner Performance",
  merchant_verification: "Merchant Verification", merchant_services: "Merchant Services",
  merchant_orders: "Merchant Orders", merchant_settlements: "Merchant Settlements",
  taxes: "Tax Rules", settlements: "Settlements", fin_reports: "Financial Reports",
  offers: "Offers", pages: "Pages & Navigation", seo_dashboard: "SEO Dashboard", global_seo: "Global SEO",
  category_seo: "Category SEO", service_seo: "Service SEO", sitemap: "Sitemap & Robots.txt",
  schema: "Schema Markup", redirects: "Redirects", channels: "Push / Email / SMS",
  reports_overview: "Reports Overview", export_center: "Export Center", login_activity: "Login Activity",
  report_builder: "Report Builder", scheduled_reports: "Scheduled Reports",
  settings_general: "General Settings", storage_settings: "AWS / S3 Storage",
};

export default function AdminDashboard() {
  const { user } = useAuth();
  const isSuper = user?.is_super_admin !== false; // default true for legacy admins
  const perms = user?.permissions || null;
  const can = useCallback((mod, action = "view") => {
    if (isSuper || !perms) return true;
    return !!perms[mod]?.[action];
  }, [isSuper, perms]);

  const visibleNav = useMemo(() => {
    if (isSuper || !perms) return NAV;
    return NAV.map((entry) => {
      if (entry.items) {
        const mod = GROUP_MODULE[entry.group];
        if (mod && !can(mod, "view")) return null;
        return entry;
      }
      const mod = ITEM_MODULE[entry.key];
      if (mod && !can(mod, "view")) return null;
      return entry;
    }).filter(Boolean);
  }, [isSuper, perms, can]);

  const firstKey = useMemo(() => {
    const e = visibleNav[0];
    return e?.items ? e.items[0]?.key : e?.key;
  }, [visibleNav]);

  const [active, setActive] = useTabParam("dashboard");
  useEffect(() => {
    // if the current section is not permitted, jump to the first allowed one
    const mod = KEY_MODULE[active];
    if (!isSuper && perms && mod && !can(mod, "view") && firstKey) setActive(firstKey);
  }, [active, isSuper, perms, can, firstKey]);

  const [dash, setDash] = useState(null);
  const [openBooking, setOpenBooking] = useState(null);
  const [bookingDetailId, setBookingDetailId] = useState(null);
  const [bookingsTab, setBookingsTab] = useState("");
  const [viewUser, setViewUser] = useState(null);
  // Profile-update red dots: unread self-service profile changes per role (persisted server-side).
  const [peopleDots, setPeopleDots] = useState({});
  const [pendingCounts, setPendingCounts] = useState({});
  const loadDots = useCallback(() => api.get("/admin/people/unread-counts").then((r) => setPeopleDots({ customers: (r.data?.customer || 0) > 0, partners: (r.data?.partner || 0) > 0, merchants: (r.data?.merchant || 0) > 0 })).catch(() => {}), []);
  const loadPending = useCallback(() => api.get("/admin/people/pending-counts").then((r) => setPendingCounts({ partners: r.data?.partner || 0, merchants: r.data?.merchant || 0 })).catch(() => {}), []);
  useEffect(() => { loadDots(); loadPending(); const t = setInterval(() => { loadDots(); loadPending(); }, 60000); return () => clearInterval(t); }, [loadDots, loadPending]);

  const jumpToBookingStatus = (s) => {
    const known = ["pending", "assigned", "started", "completed", "paid", "cancelled", "searching", "arrived_shop", "arrived_customer", "on_hold"];
    setBookingsTab(known.includes((s || "").toLowerCase()) ? (s || "").toLowerCase() : "all");
    setBookingDetailId(null);
    setActive("bookings");
  };

  const loadDash = useCallback(() => api.get("/admin/dashboard").then((r) => setDash(r.data)), []);
  useEffect(() => { loadDash(); }, [loadDash]);

  const TITLES = { dashboard: "Dashboard", bookings: "Bookings", payouts: "Payment Requests", refunds: "Payment Refunds",
    partners: "Providers", merchants: "Merchants", categories: "Service Categories", services: "Services",
    custom_jobs: "Custom Job Requests",
    kyc_approvals: "KYC Approvals",
    pro_partners: "Pro Partners (AzoApp Pro)",
    commission: "Rate Card & Commission Rules", customers: "Customers", ledger: "Transactions & Ledger",
    pricing: "Pricing Rules", surge: "Surge Rules", launch_demand: "Launch Demand", coverage_map: "Coverage Map",
    coupons: "Promo Codes", notifications: "Notifications", tickets: "User Queries", banners: "Sliders / Banners",
    blogs: "Blog", faqs: "FAQs", plans: "Subscription Plans", sysusers: "System Users", ai: "AI Insights",
    liveops: "Live Operations", locations: "Locations", campaigns: "Marketing Campaigns", memberships: "Membership Tiers",
    spareparts: "Spare Parts Inventory", vendors: "Vendors", complaints: "Complaints",
    disputes: "Disputes", warranty: "Warranty Policies", roles: "Roles & Permissions", flags: "Feature Flags", audit: "Audit Logs",
    authcfg: "Authentication & Profile Settings", integrations: "Integrations / API Config",
    subcategories: "Sub-categories", homepage: "Homepage Builder", media: "Media Library", app_home: "Customer App · Home Page",
    branding: "Branding & Theme", about: "About Us", contact: "Contact Us",
    privacy: "Privacy Policy", terms: "Terms & Conditions", refund: "Refund Policy",
    business: "Business Settings", sms_templates: "SMS Templates",
    addresscfg: "Address Management Settings", deletions: "Account Deletion Requests",
    pm_verify: "Partner Verification Review", pm_workflow: "Verification Workflow Builder",
    pm_skills: "Skills & Assessment Engine", pm_certs: "Certificate Review",
    pm_withdrawals: "Withdrawal Requests", pm_incentives: "Partner Incentives",
    payout_config: "Payouts, Withdrawal Rules & Rewards",
    pm_penalties: "Partner Penalties", pm_training: "Training Videos",
    pm_payout_log: "Payout Log (Auto Payouts & Bonuses)",
    pm_leaves: "Leave Requests", area_partners: "Area Partner", realtime_settings: "Real-time & Alerts", dispatch_feed: "Live Dispatch Feed", sys_performance: "Performance", ...SOON_TITLES };

  const d = dash || {};
  const badges = {
    bookings: d.pending_bookings || d.pending_booking_count || 0,
    partners: pendingCounts.partners || 0,
    merchants: pendingCounts.merchants || 0,
    pm_verify: d.pending_partner_verification || d.pending_verifications || 0,
    pm_withdrawals: d.pending_withdrawals || 0,
    services: d.pending_service_approval || 0,
    tickets: d.open_tickets || 0,
    deletions: d.pending_deletions || 0,
  };

  return (
    <PanelLayout title={isSuper ? "Super Admin" : "Admin"} nav={visibleNav} active={active} badges={badges} dots={peopleDots} onNavigate={(k) => { setViewUser(null); setBookingDetailId(null); setActive(k); }}>
      <OnboardingTour />
      {viewUser && typeof viewUser === "object" ? (
        <Person360 role={viewUser.role} uid={viewUser.id} onBack={() => setViewUser(null)} onCountsChanged={() => { loadDots(); loadPending(); }} onOpenUser={setViewUser} />
      ) : viewUser ? (
        <S.UserProfile360 userId={viewUser} onBack={() => setViewUser(null)} />
      ) : bookingDetailId ? (
        <S.BookingDetailPage id={bookingDetailId} onBack={() => setBookingDetailId(null)} onChanged={loadDash} onJumpToStatus={jumpToBookingStatus} />
      ) : (
      <>
      {active === "dashboard" && <AdminDashboardHome onOpenBooking={(b) => setBookingDetailId(b.id)} onNavigate={(k) => { setViewUser(null); setBookingDetailId(null); setActive(k); }} />}
      {active === "bookings" && <S.BookingsSection onOpen={(b) => setBookingDetailId(b.id)} tab={bookingsTab} onTabChange={setBookingsTab} />}
      {active === "payouts" && <S.PayoutsSection />}
      {active === "refunds" && <RefundsHub />}
      {active === "partners" && <PeopleList role="partner" onView={setViewUser} onCountsChanged={loadDots} />}
      {active === "kyc_approvals" && <KycApprovals />}
      {active === "pro_partners" && <PeopleList role="partner" pro onView={setViewUser} onCountsChanged={loadDots} />}
      {active === "area_partners" && <AreaPartners onView={setViewUser} />}
      {active === "partner_jobs" && <AdminJobRequests onOpen={setOpenBooking} />}
      {active === "dispatch_feed" && <AdminDispatchFeed />}
      {active === "realtime_settings" && <RealtimeSettings />}
      {active === "merchants" && <PeopleList role="merchant" onView={setViewUser} onCountsChanged={loadDots} />}
      {active === "qr_batches" && <QRConfig section="batches" />}
      {active === "qr_map" && <QRConfig section="map" />}
      {active === "qr_registry" && <QRConfig section="registry" />}
      {active === "qr_agents" && <QRConfig section="agents" />}
      {active === "qr_agent_payouts" && <AgentPayouts />}
      {active === "customers" && <PeopleList role="customer" onView={setViewUser} onCountsChanged={loadDots} />}
      {active === "authcfg" && <S.AuthProfileSettings />}
      {active === "addresscfg" && <S.AddressConfigSettings />}
      {active === "deletions" && <S.DeletionRequestsSection />}
      {active === "categories" && <P.CategoriesManagerPro />}
      {active === "subcategories" && <P.SubCategoriesManager />}
      {active === "services" && <P.ServiceWizard />}
      {active === "addons" && <P.AddonsManager />}
      {active === "custom_jobs" && <CustomJobsAdmin />}
      {active === "ratings" && <RatingsReviews />}
      {active === "homepage" && <P.HomepageBuilder />}
      {active === "app_home" && <AppHomeManager />}
      {active === "media" && <P.MediaManager />}
      {active === "branding" && <P.BrandingSettings />}
      {active === "business" && <S.BusinessSettings />}
      {active === "sms_templates" && <S.SmsTemplates />}
      {active === "about" && <PageEditorPro pageKey="about" title="About Us" subtitle="Tell customers who you are. This content renders on the public About page." />}
      {active === "contact" && <PageEditorPro pageKey="contact" title="Contact Us" subtitle="Contact details & content shown on the public Contact page." />}
      {active === "privacy" && <PageEditorPro pageKey="privacy" title="Privacy Policy" subtitle="Your legal privacy policy — rendered on /privacy." />}
      {active === "terms" && <PageEditorPro pageKey="terms" title="Terms & Conditions" subtitle="Your terms of service — rendered on /terms." />}
      {active === "refund" && <PageEditorPro pageKey="refund" title="Refund Policy" subtitle="Your refund/cancellation policy — rendered on /refund." />}
      {active === "commission" && <S.CommissionSettings />}
      {active === "pricing" && <S.CmsManager title="Pricing Rule" endpoint="collection/pricing_rules"
        fields={[
          { key: "name", label: "Rule name", required: true },
          { key: "price_type", label: "Price type", type: "select", options: [{ label: "Fixed", value: "fixed" }, { label: "Per hour", value: "per_hour" }, { label: "Per person", value: "per_person" }, { label: "Per sq ft", value: "per_sqft" }] },
          { key: "base_price", label: "Base price (₹)", type: "number" },
          { key: "min_price", label: "Minimum price (₹)", type: "number" },
          { key: "service_category", label: "Apply to category (blank = all)" },
          { key: "status", label: "Status", type: "select", options: [{ label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }] },
        ]}
        columns={[{ key: "name", label: "Rule" }, { key: "price_type", label: "Type" }, { key: "base_price", label: "Base ₹" }, { key: "min_price", label: "Min ₹" }, { key: "service_category", label: "Category" }, { key: "status", label: "Status", render: (r) => <S.SBadge s={r.status || "active"} /> }]} />}
      {active === "surge" && <SurgeRulesManager />}
      {active === "ledger" && <TransactionsHub />}
      {active === "invoices" && <InvoiceManagement />}
      {active === "invoice_config" && <BusinessConfigSettings />}
      {active === "coupons" && <CouponsManager />}
      {active === "notifications" && <P.NotificationCenter />}
      {active === "tickets" && <SupportInbox />}
      {active === "banners" && <P.BannerManager />}
      {active === "testimonials" && <TestimonialsManager />}
      {active === "rate_cards" && <RateCardsManager />}
      {active === "starter_kit_admin" && <StarterKitManager />}
      {active === "blogs" && <BlogManagerPro />}
      {active === "faqs" && <FaqManagerPro />}
      {active === "sysusers" && <S.SystemUsersSection />}
      {active === "liveops" && <S.LiveOps />}
      {active === "livemap" && <LivePartnerMap />}
      {active === "locations" && <S.CmsManager title="Location" endpoint="collection/locations"
        fields={[{ key: "name", label: "City / Area", required: true }, { key: "state", label: "State" }, { key: "pincode", label: "Pincode" }]}
        columns={[{ key: "name", label: "Name" }, { key: "state", label: "State" }, { key: "pincode", label: "Pincode" }]} />}
      {active === "campaigns" && <S.CmsManager title="Campaign" endpoint="collection/campaigns"
        fields={[{ key: "name", label: "Campaign name", required: true }, { key: "channel", label: "Channel (whatsapp/sms/email/push)" }, { key: "audience", label: "Audience" }]}
        columns={[{ key: "name", label: "Name" }, { key: "channel", label: "Channel" }, { key: "audience", label: "Audience" }]} />}
      {active === "memberships" && <MembershipManager />}
      {active === "growth" && <GrowthCenter />}
      {active === "spareparts" && <S.CmsManager title="Spare Part" endpoint="collection/spare_parts"
        fields={[{ key: "name", label: "Part name", required: true }, { key: "sku", label: "SKU" }, { key: "selling_price", label: "Selling price", type: "number" }, { key: "stock", label: "Stock", type: "number" }]}
        columns={[{ key: "name", label: "Part" }, { key: "sku", label: "SKU" }, { key: "selling_price", label: "Price", render: (r) => "₹" + (r.selling_price || 0) }, { key: "stock", label: "Stock" }]} />}
      {active === "vendors" && <S.CmsManager title="Vendor" endpoint="collection/vendors"
        fields={[{ key: "name", label: "Vendor name", required: true }, { key: "gst", label: "GST" }, { key: "category", label: "Category" }]}
        columns={[{ key: "name", label: "Vendor" }, { key: "gst", label: "GST" }, { key: "category", label: "Category" }]} />}
      {active === "roles" && <RolesPermissions />}
      {active === "integrations" && <S.IntegrationsSettings />}
      {active === "ai" && <div className="max-w-2xl"><AiChat role="admin" title="Business Intelligence" hint="Poochein: 'Is month ka platform revenue kitna hai?' ya 'Top providers kaun hain?'" /></div>}
      {active === "pm_workflow" && <PM.VerificationWorkflowConfig />}
      {active === "pm_verify" && <PM.PartnerVerificationReview />}
      {active === "pm_skills" && <PM.SkillsCatalogManager />}
      {active === "pm_certs" && <PM.CertificatesReview />}
      {active === "pm_withdrawals" && <PM.WithdrawalsQueue />}
      {active === "payout_config" && <PM.WalletRewardConfig />}
      {active === "pm_incentives" && <IncentivesManagerPro />}
      {active === "pm_penalties" && <PenaltiesManagerPro />}
      {active === "pm_payout_log" && <PM.PayoutLog />}
      {active === "pm_training" && <PM.TrainingManager />}
      {active === "pm_leaves" && <PM.LeavesQueue />}
      {active === "reg_kyc_pending" && <PR.KycQueue status="pending" title="Pending KYC" onOpenProfile={setViewUser} />}
      {active === "reg_kyc_approved" && <PR.KycQueue status="approved" title="Approved KYC" onOpenProfile={setViewUser} />}
      {active === "reg_kyc_rejected" && <PR.KycQueue status="rejected" title="Rejected KYC" onOpenProfile={setViewUser} />}
      {active === "reg_education" && <PR.EducationManager />}
      {active === "reg_experience" && <PR.ExperienceManager />}
      {active === "reg_notifications" && <PR.NotificationConfig />}
      {active === "reg_templates" && <TemplateManager />}
      {active === "integration_center" && <IntegrationCenter onNavigate={(k) => { setViewUser(null); setActive(k); }} />}

      {/* ---- Phase 5: previously "coming soon" modules ---- */}
      {active === "service_requests" && <S.CmsManager title="Service Request" endpoint="collection/service_requests"
        fields={[{ key: "name", label: "Customer name", required: true }, { key: "phone", label: "Phone" }, { key: "service", label: "Service" }, { key: "detail", label: "Details", type: "textarea" }, { key: "status", label: "Status (open/assigned/closed)" }]}
        columns={[{ key: "name", label: "Customer" }, { key: "phone", label: "Phone" }, { key: "service", label: "Service" }, { key: "status", label: "Status", render: (r) => <S.SBadge s={r.status || "open"} /> }]} />}
      {active === "checklists" && <S.CmsManager title="Checklist" endpoint="collection/checklists"
        fields={[{ key: "title", label: "Checklist title", required: true }, { key: "service", label: "Service" }, { key: "items", label: "Items", type: "list" }, { key: "status", label: "Status (active)" }]}
        columns={[{ key: "title", label: "Checklist" }, { key: "service", label: "Service" }, { key: "items", label: "Items" }, { key: "status", label: "Status", render: (r) => <S.SBadge s={r.status || "active"} /> }]} />}
      {active === "service_areas" && <ServiceAreasManager />}
      {active === "launch_demand" && <LaunchDemandManager />}
      {active === "coverage_map" && <CoverageMap />}
      {active === "partner_performance" && <PerformanceManager />}
      {active === "merchant_verification" && <S.ReadOnlyTable title="Merchant Verification" endpoint="users?role=merchant"
        columns={[{ key: "name", label: "Merchant" }, { key: "shop_name", label: "Shop", render: (r) => r.shop_name || "—" }, { key: "phone", label: "Phone" }, { key: "kyc_status", label: "KYC", render: (r) => <S.SBadge s={r.kyc_status} /> }, { key: "status", label: "Status", render: (r) => <S.SBadge s={r.status} /> }]}
        searchKeys={["name", "shop_name", "phone"]} exportName="merchant-verification" emptyText="No merchants" />}
      {active === "merchant_services" && <S.CmsManager title="Merchant Service" endpoint="collection/merchant_services"
        fields={[{ key: "merchant", label: "Merchant", required: true }, { key: "service", label: "Service" }, { key: "price", label: "Price", type: "number" }, { key: "status", label: "Status (active)" }]}
        columns={[{ key: "merchant", label: "Merchant" }, { key: "service", label: "Service" }, { key: "price", label: "Price", render: (r) => "₹" + (r.price || 0) }, { key: "status", label: "Status", render: (r) => <S.SBadge s={r.status || "active"} /> }]} />}
      {active === "merchant_orders" && <S.CmsManager title="Merchant Order" endpoint="collection/merchant_orders"
        fields={[{ key: "order_no", label: "Order No", required: true }, { key: "merchant", label: "Merchant" }, { key: "amount", label: "Amount", type: "number" }, { key: "status", label: "Status" }]}
        columns={[{ key: "order_no", label: "Order" }, { key: "merchant", label: "Merchant" }, { key: "amount", label: "Amount", render: (r) => "₹" + (r.amount || 0) }, { key: "status", label: "Status", render: (r) => <S.SBadge s={r.status || "pending"} /> }]} />}
      {active === "merchant_settlements" && <MerchantWithdrawals />}
      {active === "taxes" && <S.CmsManager title="Tax" endpoint="collection/taxes"
        fields={[{ key: "name", label: "Tax name", required: true }, { key: "percentage", label: "Percentage", type: "number" }, { key: "applies_to", label: "Applies to (services/spare_parts)" }, { key: "status", label: "Status (active/inactive)" }]}
        columns={[{ key: "name", label: "Tax" }, { key: "percentage", label: "%", render: (r) => `${r.percentage || 0}%` }, { key: "applies_to", label: "Applies To" }, { key: "status", label: "Status", render: (r) => <S.SBadge s={r.status || "active"} /> }]} />}
      {active === "settlements" && <S.CmsManager title="Settlement" endpoint="collection/settlements"
        fields={[{ key: "partner", label: "Provider", required: true }, { key: "amount", label: "Amount", type: "number" }, { key: "period", label: "Period" }, { key: "status", label: "Status (pending/paid)" }]}
        columns={[{ key: "partner", label: "Provider" }, { key: "amount", label: "Amount", render: (r) => "₹" + (r.amount || 0) }, { key: "period", label: "Period" }, { key: "status", label: "Status", render: (r) => <S.SBadge s={r.status || "pending"} /> }]} />}
      {active === "fin_reports" && <FinancialReports />}
      {active === "offers" && <OffersManager />}
      {active === "seo_dashboard" && <S.SeoInfoPanel kind="seo" />}
      {active === "global_seo" && <S.SettingsForm title="Global SEO" skey="seo" note="These meta tags are used site-wide unless overridden per category/service."
        fields={[{ key: "site_title", label: "Site Title" }, { key: "meta_description", label: "Meta Description", type: "textarea" }, { key: "meta_keywords", label: "Meta Keywords", type: "keywords" }, { key: "og_image", label: "OG Image URL" }]} />}
      {active === "category_seo" && <S.CmsManager title="Category SEO" endpoint="collection/category_seo"
        fields={[{ key: "page", label: "Category", required: true }, { key: "title", label: "Meta title" }, { key: "description", label: "Meta description", type: "textarea" }, { key: "keywords", label: "Keywords", type: "keywords" }]}
        columns={[{ key: "page", label: "Category" }, { key: "title", label: "Meta Title" }, { key: "keywords", label: "Keywords" }]} />}
      {active === "service_seo" && <S.CmsManager title="Service SEO" endpoint="collection/service_seo"
        fields={[{ key: "page", label: "Service", required: true }, { key: "title", label: "Meta title" }, { key: "description", label: "Meta description", type: "textarea" }, { key: "keywords", label: "Keywords", type: "keywords" }]}
        columns={[{ key: "page", label: "Service" }, { key: "title", label: "Meta Title" }, { key: "keywords", label: "Keywords" }]} />}
      {active === "sitemap" && <S.SeoInfoPanel kind="sitemap" />}
      {active === "schema" && <S.CmsManager title="Schema" endpoint="collection/schema_markup"
        fields={[{ key: "name", label: "Name", required: true }, { key: "type", label: "Type (Organization/Service...)" }, { key: "code", label: "JSON-LD", type: "textarea" }]}
        columns={[{ key: "name", label: "Name" }, { key: "type", label: "Type" }]} />}
      {active === "redirects" && <S.CmsManager title="Redirect" endpoint="collection/redirects"
        fields={[{ key: "from_path", label: "From path", required: true }, { key: "to_path", label: "To path", required: true }, { key: "type", label: "Type (301/302)" }]}
        columns={[{ key: "from_path", label: "From" }, { key: "to_path", label: "To" }, { key: "type", label: "Type" }]} />}
      {active === "channels" && <S.CmsManager title="Channel" endpoint="collection/channels"
        fields={[{ key: "name", label: "Channel name", required: true }, { key: "type", label: "Type (sms/email/push)" }, { key: "status", label: "Status (active/inactive)" }]}
        columns={[{ key: "name", label: "Channel" }, { key: "type", label: "Type" }, { key: "status", label: "Status", render: (r) => <S.SBadge s={r.status || "active"} /> }]} />}
      {active === "reports_overview" && <S.ReportsPanel mode="overview" />}
      {active === "export_center" && <S.ExportCenter />}
      {active === "report_builder" && <S.ReportBuilder />}
      {active === "scheduled_reports" && <S.ScheduledReports />}
      {active === "settings_general" && <S.GeneralSettingsAdvanced />}
      {active === "sys_performance" && <PerformanceCenter />}
      {active === "storage_settings" && <S.SettingsForm title="Storage Settings" skey="storage" note="Choose where uploaded files are stored. Use S3 for production-scale media."
        fields={[{ key: "provider", label: "Provider", type: "select", options: ["local", "s3"] }, { key: "s3_bucket", label: "S3 Bucket" }, { key: "s3_region", label: "S3 Region" }, { key: "s3_access_key", label: "Access Key" }, { key: "s3_secret_key", label: "Secret Key" }]} />}

      </>
      )}

      <S.BookingDetailModal booking={openBooking} onClose={() => setOpenBooking(null)} onChanged={loadDash} />
    </PanelLayout>
  );
}

/* Services manager (category + service CRUD) */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmt } from "@/lib/api";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

function CategoriesManager() {
  const [rows, setRows] = useState([]);
  const [f, setF] = useState({ name: "", icon: "wrench", required_skill: "", image: "" });
  const load = () => api.get("/catalog/categories").then((r) => setRows(r.data));
  useEffect(() => { load(); }, []);
  const create = async () => {
    if (!f.name) return toast.error("Name required");
    await api.post("/catalog/categories", { ...f, description: `Professional ${f.name}`, status: "active" });
    toast.success("Category created"); setF({ ...f, name: "" }); load();
  };
  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2 h-fit" data-testid="create-category">
        <h3 className="font-heading font-bold">Add Category</h3>
        <Input data-testid="cat-name" placeholder="Category name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input data-testid="cat-skill" placeholder="Required skill (e.g. ac)" value={f.required_skill} onChange={(e) => setF({ ...f, required_skill: e.target.value })} />
        <Input data-testid="cat-image" placeholder="Image URL" value={f.image} onChange={(e) => setF({ ...f, image: e.target.value })} />
        <Button data-testid="cat-create" onClick={create} className="w-full bg-primary-700 hover:bg-primary-800">Create</Button>
      </div>
      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left"><tr>{["Category", "Skill", "Status"].map((h) => <th key={h} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>{rows.map((c) => <tr key={c.id} className="border-t border-slate-100"><td className="px-5 py-3 font-medium">{c.name}</td><td className="px-5 py-3 text-slate-500">{c.required_skill || "—"}</td><td className="px-5 py-3"><S.SBadge s={c.status} /></td></tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

function ServicesManager() {
  const [cats, setCats] = useState([]);
  const [services, setServices] = useState([]);
  const [f, setF] = useState({ category_id: "", name: "", short_description: "", base_price: 199, discounted_price: 0, tax_pct: 0, duration_min: 60, required_skill: "" });
  const load = () => { api.get("/catalog/categories").then((r) => setCats(r.data)); api.get("/catalog/services").then((r) => setServices(r.data)); };
  useEffect(() => { load(); }, []);
  const create = async () => {
    if (!f.category_id || !f.name) return toast.error("Category & name required");
    const cat = cats.find((c) => c.id === f.category_id);
    await api.post("/catalog/services", { ...f, base_price: Number(f.base_price), discounted_price: Number(f.discounted_price), tax_pct: Number(f.tax_pct), duration_min: Number(f.duration_min), required_skill: f.required_skill || cat?.required_skill || "", price_type: "fixed", addons: [], status: "active" });
    toast.success("Service created"); setF({ ...f, name: "", short_description: "" }); load();
  };
  const del = async (id) => { await api.delete(`/catalog/services/${id}`); load(); };
  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-2 h-fit" data-testid="create-service">
        <h3 className="font-heading font-bold">Add Service</h3>
        <Select value={f.category_id} onValueChange={(v) => setF({ ...f, category_id: v })}><SelectTrigger data-testid="svc-cat"><SelectValue placeholder="Category" /></SelectTrigger><SelectContent>{cats.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
        <Input data-testid="svc-name" placeholder="Service name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        <Input data-testid="svc-short" placeholder="Short description" value={f.short_description} onChange={(e) => setF({ ...f, short_description: e.target.value })} />
        <Input data-testid="svc-skill" placeholder="Required skill (e.g. ac)" value={f.required_skill} onChange={(e) => setF({ ...f, required_skill: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <Input data-testid="svc-price" type="number" placeholder="Base price" value={f.base_price} onChange={(e) => setF({ ...f, base_price: e.target.value })} />
          <Input data-testid="svc-discount" type="number" placeholder="Discounted price" value={f.discounted_price} onChange={(e) => setF({ ...f, discounted_price: e.target.value })} />
          <Input data-testid="svc-tax" type="number" placeholder="Tax %" value={f.tax_pct} onChange={(e) => setF({ ...f, tax_pct: e.target.value })} />
          <Input data-testid="svc-duration" type="number" placeholder="Duration (min)" value={f.duration_min} onChange={(e) => setF({ ...f, duration_min: e.target.value })} />
        </div>
        <Button data-testid="svc-create" onClick={create} className="w-full bg-primary-700 hover:bg-primary-800">Create</Button>
      </div>
      <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-left"><tr>{["Service", "Category", "Price", "Duration", ""].map((h) => <th key={h} className="px-5 py-3 font-semibold">{h}</th>)}</tr></thead>
          <tbody>
            {services.map((s) => <tr key={s.id} className="border-t border-slate-100"><td className="px-5 py-3 font-medium">{s.name}</td><td className="px-5 py-3 text-slate-500">{s.category_name}</td><td className="px-5 py-3">{fmt(s.base_price)}</td><td className="px-5 py-3">{s.duration_min} min</td><td className="px-5 py-3"><button data-testid={`del-svc-${s.id}`} onClick={() => del(s.id)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button></td></tr>)}
          </tbody>
        </table>
      </div>
    </div>
  );
}
