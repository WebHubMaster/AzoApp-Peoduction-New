import React, { createContext, useContext } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, mediaUrl } from "@/src/api/client";

export interface SiteBranding {
  site_name: string;
  tagline: string;
  logo_light?: string;
  logo_dark?: string;
}
export interface SiteConfig {
  branding: SiteBranding & { footer_text?: string; phone?: string; email?: string };
  theme: { primary: string; secondary: string; accent: string; default_mode?: string };
  stats?: Record<string, any>;
  apps?: Record<string, any>;
  seo?: Record<string, any>;
}

const DEFAULTS: SiteConfig = {
  branding: { site_name: "AzoApp", tagline: "Service at Your Door Steps" },
  theme: { primary: "#0659B2", secondary: "#1E7AD6", accent: "#F59E0B", default_mode: "light" },
  stats: {},
};

const Ctx = createContext<SiteConfig>(DEFAULTS);

export function useSiteConfigQuery() {
  return useQuery({
    queryKey: ["site-config"],
    queryFn: async () => {
      const raw = await api.get<any>("/site/config", { auth: false });
      const b = raw.branding || {};
      return {
        branding: {
          site_name: b.site_name || "AzoApp",
          tagline: b.tagline || "Service at Your Door Steps",
          logo_light: mediaUrl(b.logo_light) || "",
          logo_dark: mediaUrl(b.logo_dark) || "",
          footer_text: b.footer_text, phone: b.phone, email: b.email,
        },
        theme: { ...DEFAULTS.theme, ...(raw.theme || {}) },
        stats: raw.stats || {}, apps: raw.apps || {}, seo: raw.seo || {},
      } as SiteConfig;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export const BrandProvider = ({ value, children }: { value?: SiteConfig; children: React.ReactNode }) => (
  <Ctx.Provider value={value || DEFAULTS}>{children}</Ctx.Provider>
);

export const useSiteConfig = () => useContext(Ctx);
