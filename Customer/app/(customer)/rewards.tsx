/** Reward & Cashback — dedicated screen listing all scratch cards + cashback (opened from Wallet "View All" / side menu). */
import React from "react";
import { View } from "react-native";
import { ScratchCardsPanel } from "@/src/components/customer/ScratchCards";
import { useToast } from "@/src/components/Toast";

export default function RewardsScreen() {
  const toast = useToast();
  return (
    <View testID="rewards-page">
      <ScratchCardsPanel gridOnly toast={toast} />
    </View>
  );
}
