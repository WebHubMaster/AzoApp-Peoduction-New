import React from "react";
import { FinanceKycScreen } from "@/src/components/FinanceKyc";
export default function MerchantBankKyc() {
  return <FinanceKycScreen base="/merchant/panel/finance-kyc" queryKey="merchant-finance-kyc" />;
}
