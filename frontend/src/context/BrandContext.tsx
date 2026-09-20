import React, { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/src/api/client";

const BACKEND = (process.env.EXPO_PUBLIC_BACKEND_URL || "").replace(/\/+$/, "");
/** Backend media URLs may be relative ("/api/media/..."); make them absolute so
 * expo-image can load them on the device. */
const absUrl = (u?: string) => {
  if (!u) return u || "";
  const s = String(u);
  if (/^(https?:|data:)/i.test(s)) return s;
  return `${BACKEND}${s.startsWith("/") ? "" : "/"}${s}`;
};

export interface SiteBranding {
  site_name: string;
  tagline: string;
  logo: string;
  logo_light?: string;
  logo_dark?: string;
  phone?: string;
  email?: string;
}

export interface SiteConfig {
  branding: SiteBranding;
  theme: { primary: string; secondary: string; accent: string; default_mode?: string };
  currency: string;
  business?: { site_name?: string; support_phone?: string; support_email?: string };
}

const DEFAULTS: SiteConfig = {
  branding: { site_name: "AzoApp", tagline: "Service at Your Door Steps", logo: "" },
  theme: { primary: "#0659B2", secondary: "#1E7AD6", accent: "#F59E0B", default_mode: "light" },
  currency: "INR",
};

const Ctx = createContext<SiteConfig>(DEFAULTS);

export function useSiteConfigQuery() {
  return useQuery({
    queryKey: ["site-config"],
    queryFn: async () => {
      const raw = await api.get<any>("/site/config", { auth: false });
      const b = raw.branding || {};
      const cfg: SiteConfig = {
        branding: {
          site_name: b.site_name || b.name || "AzoApp",
          tagline: b.tagline || raw.business?.tagline || "Service at Your Door Steps",
          logo: absUrl(b.logo || b.logo_light || raw.seo?.logo || ""),
          logo_light: absUrl(b.logo_light),
          logo_dark: absUrl(b.logo_dark),
          phone: b.phone || raw.business?.support_phone,
          email: b.email || raw.business?.support_email,
        },
        theme: {
          primary: raw.theme?.primary || DEFAULTS.theme.primary,
          secondary: raw.theme?.secondary || DEFAULTS.theme.secondary,
          accent: raw.theme?.accent || DEFAULTS.theme.accent,
          default_mode: raw.theme?.default_mode || "light",
        },
        currency: raw.currency || "INR",
        business: raw.business,
      };
      return cfg;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export const BrandProvider = ({
  value,
  children,
}: {
  value: SiteConfig;
  children: React.ReactNode;
}) => <Ctx.Provider value={value}>{children}</Ctx.Provider>;

export function useBrand(): SiteConfig {
  return useContext(Ctx);
}
