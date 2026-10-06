import { useCallback, useRef } from "react";
import { QueryClient, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";

const PARTNER_LIVE_KEYS = [
  "partner-wallet", "partner-wallet-ledger", "partner-withdrawals", "partner-invoices",
  "partner-earn-ledger", "partner-earnings", "partner-dashboard", "partner-stats",
  "partner-joblist", "partner-active", "partner-jobs",
];

export const LIVE_EVENTS = ["finance_update", "booking_update", "job_cancelled", "job_accepted", "__resync__"];

export function refreshPartnerLive(qc: QueryClient) {
  PARTNER_LIVE_KEYS.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
}

// Refetch the given queries whenever the screen regains focus (skips the first mount).
export function useRefreshOnFocus(keys: string[]) {
  const qc = useQueryClient();
  const first = useRef(true);
  const keysRef = useRef(keys);
  useFocusEffect(useCallback(() => {
    if (first.current) { first.current = false; return; }
    keysRef.current.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
  }, [qc]));
}
