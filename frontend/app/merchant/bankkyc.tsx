/* Merchant Bank & KYC — reuses the exact partner Bank & KYC design (shared
 * BankKycScreen) pointed at merchant endpoints. `embedded` hides the internal
 * AppShellHeader because the merchant stack already renders MerchantTopBar. */
import React from "react";
import { BankKycScreen } from "@/src/components/BankKycScreen";

export default function MerchantBankKyc() {
  return (
    <BankKycScreen
      financeBase="/merchant/panel/finance-kyc"
      uploadBase="/merchant/registration"
      profileRoute="/(merchant)/profile"
      queryPrefix="merchant"
      embedded
    />
  );
}
