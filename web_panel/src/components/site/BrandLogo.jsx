import React from "react";
import { Link } from "react-router-dom";
import { Zap } from "lucide-react";
import { useSiteConfig } from "@/context/SiteConfigContext";
import { useTheme } from "@/context/ThemeContext";

/**
 * BrandLogo — shows the admin-set logo everywhere, automatically choosing the
 * light or dark upload based on the current app theme.
 *   - variant="auto" (default): follow app theme (dark mode → logo_dark, else logo_light)
 *   - variant="dark":  force the dark-background logo (use on dark hero/footer)
 *   - variant="light": force the light-background logo
 * Falls back to the default Zap mark + site name when no logo is configured.
 * Pass to={null} to render without a link wrapper.
 */
export default function BrandLogo({
  to = "/",
  className = "",
  variant = "auto",
  imgClass = "h-8 w-auto max-w-[150px] object-contain",
  textClass = "font-heading font-extrabold text-lg text-slate-900",
}) {
  const { branding } = useSiteConfig();
  const { isDark } = useTheme();
  const dark = variant === "dark" ? true : variant === "light" ? false : isDark;
  const name = branding?.site_name || "AzoApp";
  const logo = dark
    ? (branding?.logo_dark || branding?.logo_light)
    : (branding?.logo_light || branding?.logo_dark);
  const inner = logo ? (
    <img src={logo} alt={name} className={imgClass} />
  ) : (
    <>
      <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${dark ? "bg-white/15 backdrop-blur" : "bg-primary-700"}`}>
        <Zap className="h-4 w-4 text-white" />
      </div>
      <span className={dark ? "font-heading font-extrabold text-lg text-white" : textClass}>{name}</span>
    </>
  );
  if (to === null) return <div className={`flex items-center gap-2 ${className}`}>{inner}</div>;
  return <Link to={to} className={`flex items-center gap-2 ${className}`}>{inner}</Link>;
}
