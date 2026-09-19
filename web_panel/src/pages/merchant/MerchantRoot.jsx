import { useAuth } from "@/context/AuthContext";
import MerchantRegistration from "@/pages/merchant/MerchantRegistration";
import MerchantDashboard from "@/pages/merchant/MerchantDashboard";

/**
 * Gate the merchant experience exactly like the partner flow:
 *   - NOT approved  -> full-screen premium registration/KYC wizard (Shell)
 *   - approved      -> the merchant dashboard (PanelLayout)
 */
export default function MerchantRoot() {
  const { user } = useAuth();
  if (!user) return null;
  const approved = user.kyc_status === "approved" || user.verified_merchant;
  return approved ? <MerchantDashboard /> : <MerchantRegistration />;
}
