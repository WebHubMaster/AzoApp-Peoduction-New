/** Web-style link → expo-router path (used by CMS links like /services, /service/ID, /account?tab=orders, /offers). */
import { useRouter } from "expo-router";
import { useAuth } from "../context/AuthContext";

export function useNavigate() {
  const router = useRouter();
  const { user } = useAuth();
  return (to: string) => {
    if (!to) return;
    if (/^https?:/i.test(to)) return;
    let path = to.startsWith("/") ? to : `/${to}`;
    if (path.startsWith("/account")) {
      const tab = /tab=([a-z_]+)/.exec(path)?.[1];
      if (!user) { router.push("/login"); return; }
      router.push((tab && tab !== "home" ? `/(customer)/${tab}` : "/(customer)") as any);
      return;
    }
    if (path === "/login") { router.push("/login"); return; }
    if (path === "/" || path === "/home") { router.replace("/(site)"); return; }
    router.push(`/(site)${path}` as any);
  };
}
