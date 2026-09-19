import { useEffect, useState, useCallback } from "react";
import {
  LayoutDashboard, Network, Wallet, Store, TrendingUp, QrCode, Bell, LifeBuoy,
  ShieldCheck, Lock, ArrowRight, Share2, Copy, ClipboardCheck,
  Users, Sparkles, FileText, CreditCard,
} from "lucide-react";
import SupportCenter from "@/components/SupportCenter";
import MerchantHome from "@/pages/merchant/MerchantHome";
import MerchantAnalytics from "@/pages/merchant/MerchantAnalytics";
import api from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import OnboardingTour from "@/components/tour/OnboardingTour";
import useTabParam from "@/hooks/useTabParam";
import { PanelLayout } from "@/components/PanelLayout";
import MerchantRegistration from "@/pages/merchant/MerchantRegistration";
import { OverviewKPIs, ScanQR } from "@/pages/merchant/MerchantPanels";
import MerchantReferralCustomers from "@/pages/merchant/referral/MerchantReferralCustomers";
import MerchantPartners from "@/pages/merchant/referral/MerchantPartners";
import MerchantCommission from "@/pages/merchant/referral/MerchantCommission";
import WalletModule from "@/pages/merchant/finance/WalletModule";
import MerchantFinanceKyc from "@/pages/merchant/MerchantFinanceKyc";
import ScanQRModule from "@/pages/merchant/scanqr/ScanQRModule";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

// Mobile app-style bottom tabs (4 + "More")
const MERCHANT_TABS = ["overview", "customers", "scanqr", "wallet"];

const NAV = [
  { key: "overview", label: "Home", icon: LayoutDashboard },
  { key: "onboarding", label: "Profile & KYC", short: "Profile", icon: Store },
  { key: "customers", label: "My Customers", short: "Customers", icon: Users, gated: true },
  { key: "scanqr", label: "Scan QR", icon: QrCode, gated: true },
  { key: "network", label: "My Partners", short: "Partners", icon: Network, gated: true },
  { key: "earnings", label: "Commission", icon: TrendingUp, gated: true },
  { key: "wallet", label: "Wallet & Withdraw", short: "Wallet", icon: Wallet, gated: true },
  { key: "bankkyc", label: "Bank & KYC", short: "Bank & KYC", icon: CreditCard, gated: true },
  { key: "analytics", label: "Analytics", icon: Sparkles, gated: true },
  { key: "support", label: "Help & Support", short: "Support", icon: LifeBuoy },
];

export default function MerchantDashboard() {
  const { user, refresh } = useAuth();
  const [active, setActive] = useTabParam("overview");
  const [access, setAccess] = useState(null);
  const [ov, setOv] = useState(null);
  const [code, setCode] = useState("");
  const [badges, setBadges] = useState({});

  const load = useCallback(() => {
    api.get("/merchant/panel/access").then((r) => setAccess(r.data)).catch(() => {});
    api.get("/merchant/my-code").then((r) => setCode(r.data.merchant_code)).catch(() => {});
    api.get("/merchant/overview").then((r) => setOv(r.data)).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  const approved = access?.approved || user?.kyc_status === "approved";
  const goTo = (k) => { setActive(k); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const shopName = user?.shop_name || user?.name || "My Shop";

  const lockedCard = () => (
    <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-8 text-center" data-testid="feature-locked">
      <div className="h-14 w-14 rounded-2xl bg-amber-50 text-amber-600 grid place-items-center mx-auto mb-3"><Lock className="h-7 w-7" /></div>
      <h3 className="font-heading font-bold text-lg text-slate-900 dark:text-white">Feature locked</h3>
      <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-sm mx-auto">Yeh feature tab unlock hoga jab aapka profile 100% complete ho aur admin approve kar de.</p>
      <div className="mt-3 inline-flex items-center gap-2 text-sm">
        <span className="font-bold text-primary-700 dark:text-primary-300">{access?.completion ?? 0}%</span>
        <span className="text-slate-400">complete · {access?.status?.replace("_", " ")}</span>
      </div>
      <Button onClick={() => goTo("onboarding")} className="mt-4 h-11 bg-primary-700 hover:bg-primary-800" data-testid="goto-profile">
        Complete Profile <ArrowRight className="h-4 w-4 ml-1" />
      </Button>
    </div>
  );

  const gatedNav = NAV.map((n) => ({ ...n, locked: n.gated && !approved }));
  const renderGated = (node) => (approved ? node : lockedCard());

  return (
    <PanelLayout title="Merchant" nav={gatedNav} active={active} onNavigate={goTo} appMode primaryTabs={MERCHANT_TABS} badges={badges}>
      <OnboardingTour />
      {/* Header for non-overview */}
      {active !== "overview" && active !== "scanqr" && active !== "customers" && active !== "network" && active !== "earnings" && (
        <div className="flex items-center gap-2 mb-4 lg:mb-6">
          <div className="min-w-0">
            <h1 className="font-heading font-extrabold text-xl lg:text-2xl text-slate-900 dark:text-white truncate">{NAV.find((n) => n.key === active)?.label}</h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs lg:text-sm flex items-center gap-1.5"><Store className="h-3.5 w-3.5 text-primary-700" /> {shopName}</p>
          </div>
        </div>
      )}

      {/* Approval banner (not approved) */}
      {!approved && active === "overview" && (
        <div data-testid="merchant-approval-banner" className="mb-6 rounded-2xl bg-primary-700 text-white p-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-9 w-9 shrink-0" />
            <div className="flex-1">
              <p className="font-heading font-bold text-lg">Complete your merchant verification</p>
              <p className="text-primary-100 text-sm">Profile {access?.completion ?? 0}% complete · {access?.status?.replace("_", " ")}. All premium features unlock only after approval.</p>
            </div>
            <Button onClick={() => goTo("onboarding")} className="bg-white text-primary-700 hover:bg-primary-50 shrink-0" data-testid="goto-merchant-onboarding">Complete now</Button>
          </div>
        </div>
      )}

      {/* OVERVIEW */}
      {active === "overview" && (
        approved ? (
          <MerchantHome user={user} code={code} onNavigate={goTo} />
        ) : (
          <div className="space-y-5">
            <OverviewKPIs ov={ov} />
          </div>
        )
      )}

      {/* PROFILE & KYC */}
      {active === "onboarding" && (
        <MerchantRegistration embedded onComplete={() => { load(); refresh?.(); }} />
      )}

      {/* GATED FEATURES */}
      {active === "customers" && renderGated(<MerchantReferralCustomers shopName={shopName} />)}
      {active === "scanqr" && renderGated(<ScanQRModule code={code} shopName={shopName} user={user} />)}
      {active === "network" && renderGated(<MerchantPartners shopName={shopName} />)}
      {active === "earnings" && renderGated(<MerchantCommission />)}
      {active === "wallet" && renderGated(<WalletModule onNavigate={goTo} />)}
      {active === "bankkyc" && renderGated(<MerchantFinanceKyc />)}
      {active === "analytics" && renderGated(<MerchantAnalytics title="Business Analytics" />)}

      {/* SUPPORT */}
      {active === "support" && <SupportCenter />}
    </PanelLayout>
  );
}

/* Advanced Scan QR — premium card + share + copy + download/print (reuses ScanQR poster). */
function AdvancedScanQR({ code, shopName }) {
  const [copied, setCopied] = useState(false);
  const link = `${window.location.origin}/?ref=${code || ""}`;
  const share = async () => {
    const shareData = { title: shopName, text: `Book home services with ${shopName} on AzoApp`, url: link };
    try {
      if (navigator.share) await navigator.share(shareData);
      else { await navigator.clipboard.writeText(link); toast.success("Link copied — share it anywhere"); }
    } catch (e) { /* user cancelled */ }
  };
  const copy = async () => { await navigator.clipboard.writeText(link); setCopied(true); toast.success("Link copied"); setTimeout(() => setCopied(false), 1500); };
  const waShare = () => window.open(`https://wa.me/?text=${encodeURIComponent(`Book home services with ${shopName}: ${link}`)}`, "_blank");
  return (
    <div className="space-y-4" data-testid="advanced-scanqr">
      <div className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-4">
        <div className="flex items-center gap-2 mb-1"><ShieldCheck className="h-4 w-4 text-emerald-600" /><p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Verified Merchant QR</p></div>
        <p className="text-xs text-slate-500 break-all mb-3">{link}</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Button onClick={share} className="h-10 bg-primary-700 hover:bg-primary-800" data-testid="qr-share"><Share2 className="h-4 w-4 mr-1" /> Share</Button>
          <Button onClick={waShare} variant="outline" className="h-10 text-emerald-600 border-emerald-200"><Share2 className="h-4 w-4 mr-1" /> WhatsApp</Button>
          <Button onClick={copy} variant="outline" className="h-10" data-testid="qr-copy">{copied ? <ClipboardCheck className="h-4 w-4 mr-1 text-emerald-600" /> : <Copy className="h-4 w-4 mr-1" />} Copy Link</Button>
        </div>
      </div>
      {/* Existing premium themed poster with Download PNG / high-res / print */}
      <ScanQR code={code} shopName={shopName} />
    </div>
  );
}
