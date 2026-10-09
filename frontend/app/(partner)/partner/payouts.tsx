import React from "react";
import { BankKycScreen } from "@/src/components/BankKycScreen";

export default function PartnerPayouts() {
  return (
    <BankKycScreen
      financeBase="/partner/finance-kyc"
      uploadBase="/partner/registration"
      profileRoute="/(partner)/profile"
      queryPrefix="partner"
    />
  );
}
