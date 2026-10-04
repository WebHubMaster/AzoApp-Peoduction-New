/** Mobile site header: logo · membership · location · cart · profile (per approved order). */
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, ActivityIndicator, Dimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, usePathname } from "expo-router";
import { Image } from "expo-image";
import { MapPin, ChevronDown, ShoppingBag, User, CheckCircle2, AlertTriangle, Home, LayoutGrid, Wrench } from "lucide-react-native";
import { CustomJobWizard } from "../../../app/(customer)/custom_jobs";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useSiteConfig } from "@/src/context/BrandContext";
import { useCart } from "@/src/context/CartContext";
import { PRIMARY, SLATE, EMERALD, ROSE, useTheme, TC } from "@/src/theme";
import { useRawLocation, setLocationName, detectLocation } from "@/src/lib/location";

const CROWN = require("../../../assets/membership-crown.png"); // eslint-disable-line @typescript-eslint/no-require-imports

// Full-width dropdown metrics: the location icon sits 112px from the screen's
// right edge (paddingRight 16 + profile 40 + gap 8 + cart 40 + gap 8). We push
// the panel out to leave a 12px margin on each side so it spans full width.
const SIDE_MARGIN = 12;
const ICON_RIGHT_GAP = 112;

export function LocationButton({ testID = "nav-location", iconOnly = false }: { testID?: string; iconOnly?: boolean }) {
  const loc = useRawLocation();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [status, setStatus] = useState<"idle" | "locating" | "error" | "out_of_area">("idle");
  const [err, setErr] = useState("");
  const [oos, setOos] = useState<any>(null);
  const [pinCov, setPinCov] = useState<any>(null);
  const [pinChecking, setPinChecking] = useState(false);
  const isPin = /^\d{6}$/.test(val.trim());
  const hasLoc = !!(loc && loc !== "Your area");
  useEffect(() => {
    if (!isPin) { setPinCov(null); setPinChecking(false); return; }
    let alive = true; setPinChecking(true);
    api.get(`/geo/serviceability?pincode=${val.trim()}`, { auth: false }).then((r) => alive && setPinCov(r)).catch(() => alive && setPinCov(null)).finally(() => alive && setPinChecking(false));
    return () => { alive = false; };
  }, [val, isPin]);
  const save = () => { if (!val.trim()) return; setLocationName(val.trim()); setOpen(false); };
  const detect = async () => {
    setStatus("locating"); setErr(""); setOos(null);
    const r = await detectLocation();
    if (r.ok) { setStatus("idle"); setOpen(false); return; }
    if ("outOfArea" in r) { setOos(r.outOfArea); setStatus("out_of_area"); return; }
    setStatus("error"); setErr(r.error);
  };
  const Trigger = iconOnly ? (
    <Pressable testID={testID} onPress={() => setOpen((o) => !o)} style={{ width: 40, height: 40, borderRadius: 6, borderWidth: 1, borderColor: TC.border, alignItems: "center", justifyContent: "center" }}>
      <MapPin size={20} color={hasLoc ? PRIMARY[700] : TC.text2} />
      {hasLoc ? <View testID={`${testID}-dot`} style={{ position: "absolute", top: 6, right: 6, height: 8, width: 8, borderRadius: 4, backgroundColor: EMERALD[500], borderWidth: 1.5, borderColor: TC.surface }} /> : null}
    </Pressable>
  ) : (
    <Pressable testID={testID} onPress={() => setOpen((o) => !o)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 12, borderRadius: 6, backgroundColor: TC.bg, borderWidth: 1, borderColor: TC.border, maxWidth: 200, alignSelf: "flex-start" }}>
      <MapPin size={16} color={TC.primaryText} /><Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "500", color: TC.text2, flexShrink: 1 }}>{loc || "Select location"}</Text><ChevronDown size={16} color={TC.textFaint} />
    </Pressable>
  );
  return (
    <View style={iconOnly ? { position: "relative", zIndex: 60 } : undefined}>
      {Trigger}
      {open ? (
        <View testID={`${testID}-panel`} style={{ marginTop: 8, width: iconOnly ? Dimensions.get("window").width - SIDE_MARGIN * 2 : 288, backgroundColor: TC.surface, borderWidth: 1, borderColor: TC.border, borderRadius: 6, padding: 16, boxShadow: "0px 20px 25px -5px rgba(0,0,0,0.15)", ...(iconOnly ? { position: "absolute", top: 44, right: -(ICON_RIGHT_GAP - SIDE_MARGIN), zIndex: 100 } : {}) } as any}>
          {status === "out_of_area" && oos ? (
            <View testID="out-of-area">
              <Text style={{ fontSize: 14, fontWeight: "700", color: TC.text }}>We&apos;re not in {oos.city} yet</Text>
              <Text style={{ fontSize: 12, color: TC.textMuted, marginTop: 4 }}>Currently serving: {(oos.servicedCities || []).join(", ") || "select cities"}.</Text>
              <Pressable onPress={() => { setStatus("idle"); setOos(null); }} style={{ marginTop: 10 }}><Text style={{ color: TC.primaryText, fontWeight: "600", fontSize: 13 }}>Close</Text></Pressable>
            </View>
          ) : (
            <>
              {hasLoc ? (
                <View testID={`${testID}-current`} style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 10, alignSelf: "flex-start", backgroundColor: TC.primarySoft, borderRadius: 6, paddingHorizontal: 10, height: 30 }}>
                  <MapPin size={13} color={TC.primaryText} /><Text style={{ fontSize: 12.5, fontWeight: "700", color: PRIMARY[800] }}>{loc}</Text>
                  <View style={{ height: 5, width: 5, borderRadius: 3, backgroundColor: EMERALD[500] }} /><Text style={{ fontSize: 10.5, color: EMERALD[700], fontWeight: "600" }}>Current</Text>
                </View>
              ) : null}
              <Text style={{ fontSize: 14, fontWeight: "600", color: TC.text, marginBottom: 8 }}>Where do you need service?</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput testID={`${testID}-input`} value={val} onChangeText={setVal} onSubmitEditing={save} placeholder="City or pincode" placeholderTextColor={TC.textFaint} numberOfLines={1} style={{ height: 40, paddingHorizontal: 12, flex: 1, borderRadius: 6, borderWidth: 1, borderColor: TC.border, fontSize: 14, color: TC.text }} />
                <Pressable testID={`${testID}-set`} onPress={save} style={{ height: 40, paddingHorizontal: 16, borderRadius: 6, backgroundColor: PRIMARY[700], justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "500", fontSize: 14 }}>Set</Text></Pressable>
              </View>
              {isPin ? (
                <View testID={`${testID}-pincode-badge`} style={{ marginTop: 8, flexDirection: "row" }}>
                  {pinChecking ? <Text style={{ fontSize: 12, fontWeight: "600", color: TC.textMuted, backgroundColor: TC.surfaceAlt, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4 }}>Checking availability…</Text>
                    : pinCov?.serviceable === true ? <View testID={`${testID}-pincode-serviceable`} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: EMERALD[100], borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4 }}><CheckCircle2 size={14} color={EMERALD[700]} /><Text style={{ fontSize: 12, fontWeight: "600", color: EMERALD[700] }}>We serve your area</Text></View>
                    : pinCov?.serviceable === false ? <View testID={`${testID}-pincode-blocked`} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: ROSE[100], borderRadius: 6, paddingHorizontal: 12, paddingVertical: 4 }}><AlertTriangle size={14} color={ROSE[700]} /><Text style={{ fontSize: 12, fontWeight: "600", color: ROSE[700] }}>Not in service area yet</Text></View> : null}
                </View>
              ) : null}
              <Pressable testID={`${testID}-detect`} onPress={detect} disabled={status === "locating"} style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6, opacity: status === "locating" ? 0.7 : 1 }}>
                {status === "locating" ? <ActivityIndicator size="small" color={TC.primaryText} /> : <MapPin size={16} color={TC.primaryText} />}
                <Text style={{ fontSize: 14, color: TC.primaryText, fontWeight: "500" }}>{status === "locating" ? "Detecting your location…" : "Use my current location"}</Text>
              </Pressable>
              {status === "error" ? <Text style={{ marginTop: 8, fontSize: 12, color: "#DC2626", lineHeight: 18 }}>{err} <Text onPress={detect} style={{ textDecorationLine: "underline", fontWeight: "500" }}>Retry</Text></Text> : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function SiteNavbar({ hideSearch = false }: { hideSearch?: boolean } = {}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { branding } = useSiteConfig();
  const { count: cartCount } = useCart();
  const { isDark } = useTheme();
  const logo = (isDark ? branding.logo_dark || branding.logo_light : branding.logo_light || branding.logo_dark) || "";
  const account = () => router.push(user ? "/(customer)" : "/login");
  // Existing membership / subscription screen (see clarification).
  const membership = () => router.push((user ? "/(customer)/subscriptions" : "/(site)/membership") as any);
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: TC.surface, borderBottomWidth: 1, borderBottomColor: "rgba(226,232,240,0.7)", zIndex: 50 }}>
      <View style={{ height: 64, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16 }}>
        <Pressable testID="site-logo" onPress={() => router.push("/(site)")} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {logo ? <Image source={{ uri: logo }} style={{ height: 36, width: 120 }} contentFit="contain" contentPosition="left" /> : (
            <View style={{ width: 36, height: 36, borderRadius: 6, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>{(branding.site_name || "A")[0]}</Text></View>
          )}
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable testID="nav-membership-mobile" onPress={membership} style={{ width: 40, height: 40, borderRadius: 6, backgroundColor: TC.surface, borderWidth: 1, borderColor: "#FDE68A", alignItems: "center", justifyContent: "center" }}><Image source={CROWN} style={{ width: 24, height: 24 }} contentFit="contain" /></Pressable>
        <LocationButton testID="nav-location" iconOnly />
        <Pressable testID="nav-cart" onPress={() => router.push("/(site)/book")} style={{ width: 40, height: 40, borderRadius: 6, borderWidth: 1, borderColor: TC.border, alignItems: "center", justifyContent: "center" }}>
          <ShoppingBag size={20} color={TC.text2} />
          {cartCount > 0 ? <View style={{ position: "absolute", top: -6, right: -6, height: 20, minWidth: 20, borderRadius: 6, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{cartCount}</Text></View> : null}
        </Pressable>
        <Pressable testID={user ? "nav-account-mobile" : "nav-login-mobile"} onPress={account} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 6, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], alignItems: "center", justifyContent: "center" })}><User size={20} color="#fff" /></Pressable>
      </View>
    </View>
  );
}

const TABS = [
  { key: "home", label: "Home", icon: Home, to: "/(site)" },
  { key: "services", label: "Services", icon: LayoutGrid, to: "/(site)/services" },
  { key: "cart", label: "Booking", icon: ShoppingBag, to: "/(site)/book" },
  { key: "custom", label: "Custom Service", icon: Wrench, to: "" },
  { key: "profile", label: "Profile", icon: User, to: "/(customer)" },
];

export function MobileBottomNav() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { count } = useCart();
  const [customOpen, setCustomOpen] = useState(false);
  const go = (t: typeof TABS[number]) => {
    if (t.key === "custom") { setCustomOpen(true); return; }
    if (["profile"].includes(t.key) && !user) { router.push("/login"); return; }
    router.push(t.to as any);
  };
  const isActive = (t: typeof TABS[number]) =>
    t.key === "home" ? pathname === "/" || pathname === "/(site)" || pathname === ""
      : t.key === "services" ? pathname.includes("/services")
        : t.key === "cart" ? pathname.includes("/book")
          : t.key === "custom" ? customOpen
            : t.key === "profile" ? pathname.includes("/profile")
              : false;
  return (
    <View testID="mobile-bottom-nav" style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: TC.surface, borderTopWidth: 1, borderTopColor: TC.border, flexDirection: "row", paddingBottom: insets.bottom }}>
      {TABS.map((t) => {
        const act = isActive(t);
        const color = act ? PRIMARY[700] : SLATE[400];
        return (
          <Pressable key={t.key} testID={`tab-${t.key}`} onPress={() => go(t)} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 8, height: 64 }}>
            <View>
              <t.icon size={20} color={color} strokeWidth={act ? 2.3 : 1.7} />
              {t.key === "cart" && count > 0 ? (
                <View testID="tab-cart-count" style={{ position: "absolute", top: -8, right: -12, height: 16, minWidth: 16, paddingHorizontal: 4, borderRadius: 6, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{count}</Text>
                </View>
              ) : null}
            </View>
            <Text numberOfLines={1} style={{ fontSize: 10, fontWeight: "500", color }}>{t.label}</Text>
          </Pressable>
        );
      })}
      <CustomJobWizard open={customOpen} onClose={() => setCustomOpen(false)} onSubmitted={() => {}} />
    </View>
  );
}
