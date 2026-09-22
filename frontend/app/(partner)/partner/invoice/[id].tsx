/* Deep-link route (web: /merchant?invoice=<id>) → opens My Invoices with the viewer for this invoice */
import { useEffect } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function InvoiceDeepLink() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => { router.replace({ pathname: "/partner/invoices", params: { invoice: id } } as any); }, [id, router]);
  return null;
}
