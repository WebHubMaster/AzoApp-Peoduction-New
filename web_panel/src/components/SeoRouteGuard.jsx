import { useEffect, useState } from "react";
import { Helmet } from "react-helmet-async";
import { useLocation, useNavigate } from "react-router-dom";
import api from "@/lib/api";

const PRIVATE = ["/admin", "/account", "/partner", "/merchant", "/agent", "/login", "/book", "/payment"];
let _redirects = null;

// SPA-level redirect rules (admin-managed) + noindex for private dashboards.
export default function SeoRouteGuard() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [map, setMap] = useState(_redirects);

  useEffect(() => {
    if (_redirects) return;
    api.get("/seo/redirects").then((r) => {
      _redirects = Object.fromEntries((r.data || []).map((x) => [x.from_path, x.to_path]));
      setMap(_redirects);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!map) return;
    const key = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    const to = map[key];
    if (to && to !== key && to.startsWith("/")) {
      api.post("/seo/redirects/hit", { from_path: key }).catch(() => {});
      navigate(to, { replace: true });
    }
  }, [pathname, map, navigate]);

  const isPrivate = PRIVATE.some((p) => pathname === p || pathname.startsWith(p + "/"));
  if (!isPrivate) return null;
  return <Helmet><meta name="robots" content="noindex,nofollow" /></Helmet>;
}
