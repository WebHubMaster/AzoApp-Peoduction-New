import { useAuth } from "@/context/AuthContext";
import PartnerRegistration from "@/pages/partner/PartnerRegistration";
import PartnerDashboard from "@/pages/partner/PartnerDashboard";

/**
 * Gate for the partner panel. Until a partner's KYC is APPROVED, the whole
 * panel is replaced by the mandatory Profile Completion / KYC flow (which itself
 * renders the wizard for incomplete/rejected and an "Under Review" screen while
 * awaiting admin approval). Approved partners get the full dashboard.
 */
export default function PartnerRoot() {
  const { user } = useAuth();
  if (!user) return null;
  const approved = user.kyc_status === "approved" || user.verified_partner;
  return approved ? <PartnerDashboard /> : <PartnerRegistration />;
}
