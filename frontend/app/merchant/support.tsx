/* Merchant Help & Support — reuses the exact partner/customer support design
 * (shared SupportList). `embedded` hides the internal AppShellHeader because the
 * merchant stack already renders MerchantTopBar. */
import React from "react";
import SupportList from "@/app/support/index";

export default function MerchantSupport() {
  return <SupportList embedded />;
}
