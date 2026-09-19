import React from "react";
import { useLocation } from "react-router-dom";
import { AlertTriangle } from "lucide-react";
import { useSiteConfig } from "@/context/SiteConfigContext";

/**
 * App-wide maintenance banner shown to customers (and public/site pages) when the
 * admin turns on Maintenance Mode in General Settings. Hidden on the admin panel so
 * operators can still manage the platform. The message is admin-configurable and
 * updates live via the SiteConfig poll.
 */
export default function MaintenanceBanner() {
  const { maintenance } = useSiteConfig();
  const { pathname } = useLocation();
  if (!maintenance?.enabled) return null;
  if (pathname.startsWith("/admin")) return null; // keep admin UI clean

  return (
    <div
      data-testid="maintenance-banner"
      className="sticky top-0 z-[60] w-full bg-amber-500 text-amber-950 shadow-md"
      role="alert"
    >
      <div className="max-w-7xl mx-auto flex items-center gap-3 px-4 py-2.5 text-sm font-medium">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span className="flex-1">{maintenance.message}</span>
        <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider bg-amber-950/10 rounded-full px-2.5 py-0.5">
          Maintenance
        </span>
      </div>
    </div>
  );
}
