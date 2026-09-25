/** Same NAV + status helpers as web_panel/src/pages/customer/CustomerDashboard.jsx */
import { Home, Package, Wrench, Receipt, FileText, MapPin, Wallet, User, Gift, LifeBuoy, Sparkles } from "lucide-react-native";

export type NavKey = "home" | "orders" | "custom_jobs" | "refunds" | "invoices" | "addresses" | "wallet" | "profile" | "referral" | "support" | "ai";

export interface NavItem { key: NavKey; label: string; short: string; icon: any; route: string }

export const NAV: NavItem[] = [
  { key: "home", label: "Home", short: "Home", icon: Home, route: "/(customer)" },
  { key: "orders", label: "My Bookings", short: "Bookings", icon: Package, route: "/(customer)/orders" },
  { key: "custom_jobs", label: "Custom Requests", short: "Custom", icon: Wrench, route: "/(customer)/custom_jobs" },
  { key: "refunds", label: "Refunds", short: "Refunds", icon: Receipt, route: "/(customer)/refunds" },
  { key: "invoices", label: "My Invoices", short: "Invoices", icon: FileText, route: "/(customer)/invoices" },
  { key: "addresses", label: "My Addresses", short: "Address", icon: MapPin, route: "/(customer)/addresses" },
  { key: "wallet", label: "Wallet", short: "Wallet", icon: Wallet, route: "/(customer)/wallet" },
  { key: "profile", label: "My Profile", short: "Profile", icon: User, route: "/(customer)/profile" },
  { key: "referral", label: "Refer & Earn", short: "Refer", icon: Gift, route: "/(customer)/referral" },
  { key: "support", label: "Help & Support", short: "Support", icon: LifeBuoy, route: "/(customer)/support" },
  { key: "ai", label: "AI Assistant", short: "AI", icon: Sparkles, route: "/(customer)/ai" },
];

export const MOBILE_PRIMARY: NavKey[] = ["home", "orders", "wallet", "invoices"];

export const ACTIVE_STATES = ["pending", "pending_payment", "searching", "assigned", "arrived_shop", "arrived_customer", "started"];
export const DONE_STATES = ["completed", "paid"];

export const STATUS_TXT: Record<string, string> = {
  searching: "Finding your partner", pending: "Awaiting confirmation", assigned: "Partner assigned",
  arrived_shop: "Partner at shop", arrived_customer: "Partner has arrived", started: "Work in progress",
  completed: "Completed", paid: "Paid", cancelled: "Cancelled", refunded: "Refunded",
};

export type Tone = "green" | "blue" | "violet" | "rose" | "amber" | "slate";
export const statusTone = (s: string): Tone => {
  if (["completed", "paid", "payment_received"].includes(s)) return "green";
  if (s === "searching") return "blue";
  if (["assigned", "arrived_shop", "arrived_customer", "started"].includes(s)) return "violet";
  if (s === "cancelled") return "rose";
  return "amber";
};
export const statusText = (s: string) => STATUS_TXT[s] || (s || "").replace(/_/g, " ");
export const bkDate = (b: any) => b.scheduled_at || b.created_at;
