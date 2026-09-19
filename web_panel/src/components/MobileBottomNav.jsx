import { useNavigate, useLocation } from "react-router-dom";
import { Home, LayoutGrid, CalendarCheck, ShoppingBag, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useCart } from "@/context/CartContext";

const TABS = [
  { key: "home", label: "Home", icon: Home, to: "/" },
  { key: "services", label: "Services", icon: LayoutGrid, to: "/services" },
  { key: "cart", label: "Booking", icon: ShoppingBag, to: "/book" },
  { key: "bookings", label: "Orders", icon: CalendarCheck, to: "/account" },
  { key: "profile", label: "Profile", icon: User, to: "/account" },
];

export default function MobileBottomNav() {
  const navigate = useNavigate();
  const loc = useLocation();
  const { user } = useAuth();
  const { count } = useCart();
  const go = (t) => {
    if (["bookings", "profile"].includes(t.key)) {
      if (!user) return navigate("/login");
      // Route to the logged-in user's OWN dashboard (a partner/merchant/admin must
      // never be sent to the customer-only /account route, which would bounce them
      // to the login page).
      const dash = { customer: "/account", partner: "/partner", merchant: "/merchant", admin: "/admin" };
      return navigate(dash[user.role] || "/account");
    }
    navigate(t.to);
  };
  const isActive = (t) => (t.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(t.to));
  return (
    <>
      <div className="lg:hidden" aria-hidden style={{ height: "calc(4rem + env(safe-area-inset-bottom))" }} />
      <nav data-testid="mobile-bottom-nav" className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 flex items-stretch" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {TABS.map((t) => {
          const Icon = t.icon;
          const act = isActive(t);
          return (
            <button key={t.key} data-testid={`tab-${t.key}`} onClick={() => go(t)}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 ${act ? "text-primary-700" : "text-slate-400"}`}>
              <span className="relative">
                <Icon className="h-5 w-5" strokeWidth={act ? 2.3 : 1.7} />
                {t.key === "cart" && count > 0 && (
                  <span className="absolute -top-2 -right-2.5 h-4 min-w-4 px-1 rounded-full bg-primary-700 text-white text-[10px] font-bold flex items-center justify-center">{count}</span>
                )}
              </span>
              <span className="text-[10px] font-medium">{t.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
}
