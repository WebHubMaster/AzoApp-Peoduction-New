/** Mobile view of web_panel/src/components/site/SiteNavbar.jsx + LocationButton + MobileBottomNav.jsx */
import React, { useEffect, useState } from "react";
import { View, Text, Pressable, TextInput, Modal, ActivityIndicator } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter, usePathname } from "expo-router";
import { Image } from "expo-image";
import { MapPin, Search, ChevronDown, Menu, X, ShoppingBag, User, CheckCircle2, AlertTriangle, Home, LayoutGrid, CalendarCheck } from "lucide-react-native";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/context/AuthContext";
import { useSiteConfig } from "@/src/context/BrandContext";
import { useCart } from "@/src/context/CartContext";
import { PRIMARY, SLATE, EMERALD, ROSE, useTheme } from "@/src/theme";
import { useRawLocation, setLocationName, detectLocation } from "@/src/lib/location";
import { ServiceSearch } from "@/src/components/site/ServiceSearch";

const CROWN = require("../../../assets/membership-crown.png"); // eslint-disable-line @typescript-eslint/no-require-imports

export function LocationButton({ testID = "nav-location" }: { testID?: string }) {
  const loc = useRawLocation();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const [status, setStatus] = useState<"idle" | "locating" | "error" | "out_of_area">("idle");
  const [err, setErr] = useState("");
  const [oos, setOos] = useState<any>(null);
  const [pinCov, setPinCov] = useState<any>(null);
  const [pinChecking, setPinChecking] = useState(false);
  const isPin = /^\d{6}$/.test(val.trim());
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
  return (
    <View>
      <Pressable testID={testID} onPress={() => setOpen((o) => !o)} style={{ flexDirection: "row", alignItems: "center", gap: 6, height: 40, paddingHorizontal: 12, borderRadius: 12, backgroundColor: SLATE[50], borderWidth: 1, borderColor: SLATE[200], maxWidth: 200, alignSelf: "flex-start" }}>
        <MapPin size={16} color={PRIMARY[700]} /><Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "500", color: SLATE[700], flexShrink: 1 }}>{loc || "Select location"}</Text><ChevronDown size={16} color={SLATE[400]} />
      </Pressable>
      {open ? (
        <View style={{ marginTop: 8, width: 288, backgroundColor: "#fff", borderWidth: 1, borderColor: SLATE[200], borderRadius: 16, padding: 16, boxShadow: "0px 20px 25px -5px rgba(0,0,0,0.1)" }}>
          {status === "out_of_area" && oos ? (
            <View testID="out-of-area">
              <Text style={{ fontSize: 14, fontWeight: "700", color: SLATE[800] }}>We&apos;re not in {oos.city} yet</Text>
              <Text style={{ fontSize: 12, color: SLATE[500], marginTop: 4 }}>Currently serving: {(oos.servicedCities || []).join(", ") || "select cities"}.</Text>
              <Pressable onPress={() => { setStatus("idle"); setOos(null); }} style={{ marginTop: 10 }}><Text style={{ color: PRIMARY[700], fontWeight: "600", fontSize: 13 }}>Close</Text></Pressable>
            </View>
          ) : (
            <>
              <Text style={{ fontSize: 14, fontWeight: "600", color: SLATE[800], marginBottom: 8 }}>Where do you need service?</Text>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TextInput testID={`${testID}-input`} value={val} onChangeText={setVal} onSubmitEditing={save} placeholder="City or pincode" placeholderTextColor={SLATE[400]} style={{ height: 40, paddingHorizontal: 12, flex: 1, borderRadius: 8, borderWidth: 1, borderColor: SLATE[200], fontSize: 14, color: SLATE[900] }} />
                <Pressable testID={`${testID}-set`} onPress={save} style={{ height: 40, paddingHorizontal: 16, borderRadius: 6, backgroundColor: PRIMARY[700], justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "500", fontSize: 14 }}>Set</Text></Pressable>
              </View>
              {isPin ? (
                <View testID={`${testID}-pincode-badge`} style={{ marginTop: 8, flexDirection: "row" }}>
                  {pinChecking ? <Text style={{ fontSize: 12, fontWeight: "600", color: SLATE[600], backgroundColor: SLATE[100], borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>Checking availability…</Text>
                    : pinCov?.serviceable === true ? <View testID={`${testID}-pincode-serviceable`} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: EMERALD[100], borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}><CheckCircle2 size={14} color={EMERALD[700]} /><Text style={{ fontSize: 12, fontWeight: "600", color: EMERALD[700] }}>We serve your area</Text></View>
                    : pinCov?.serviceable === false ? <View testID={`${testID}-pincode-blocked`} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: ROSE[100], borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}><AlertTriangle size={14} color={ROSE[700]} /><Text style={{ fontSize: 12, fontWeight: "600", color: ROSE[700] }}>Not in service area yet</Text></View> : null}
                </View>
              ) : null}
              <Pressable testID={`${testID}-detect`} onPress={detect} disabled={status === "locating"} style={{ marginTop: 12, flexDirection: "row", alignItems: "center", gap: 6, opacity: status === "locating" ? 0.7 : 1 }}>
                {status === "locating" ? <ActivityIndicator size="small" color={PRIMARY[700]} /> : <MapPin size={16} color={PRIMARY[700]} />}
                <Text style={{ fontSize: 14, color: PRIMARY[700], fontWeight: "500" }}>{status === "locating" ? "Detecting your location…" : "Use my current location"}</Text>
              </Pressable>
              {status === "error" ? <Text style={{ marginTop: 8, fontSize: 12, color: "#DC2626", lineHeight: 18 }}>{err} <Text onPress={detect} style={{ textDecorationLine: "underline", fontWeight: "500" }}>Retry</Text></Text> : null}
            </>
          )}
        </View>
      ) : null}
    </View>
  );
}

export default function SiteNavbar() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { branding } = useSiteConfig();
  const { count: cartCount } = useCart();
  const { isDark } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const logo = (isDark ? branding.logo_dark || branding.logo_light : branding.logo_light || branding.logo_dark) || "";
  const account = () => router.push(user ? "/(customer)" : "/login");
  return (
    <View style={{ paddingTop: insets.top, backgroundColor: "rgba(255,255,255,0.95)", borderBottomWidth: 1, borderBottomColor: "rgba(226,232,240,0.7)", zIndex: 50 }}>
      <View style={{ height: 64, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16 }}>
        <Pressable testID="site-logo" onPress={() => router.push("/(site)")} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {logo ? <Image source={{ uri: logo }} style={{ height: 36, width: 120 }} contentFit="contain" contentPosition="left" /> : (
            <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontWeight: "900", fontSize: 18 }}>{(branding.site_name || "A")[0]}</Text></View>
          )}
        </Pressable>
        <View style={{ flex: 1 }} />
        <Pressable testID="nav-membership-mobile" onPress={() => router.push("/(site)/membership")} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}><Image source={CROWN} style={{ width: 36, height: 36 }} contentFit="contain" /></Pressable>
        <Pressable testID="nav-search-mobile" onPress={() => setSearchOpen(true)} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: SLATE[200], alignItems: "center", justifyContent: "center" }}><Search size={20} color={SLATE[700]} /></Pressable>
        <Pressable testID="nav-cart" onPress={() => router.push("/(site)/book")} style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], alignItems: "center", justifyContent: "center" }}>
          <ShoppingBag size={20} color={SLATE[700]} />
          {cartCount > 0 ? <View style={{ position: "absolute", top: -6, right: -6, height: 20, minWidth: 20, borderRadius: 10, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}><Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>{cartCount}</Text></View> : null}
        </Pressable>
        <Pressable testID={user ? "nav-account-mobile" : "nav-login-mobile"} onPress={account} style={({ pressed }) => ({ width: 40, height: 40, borderRadius: 20, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], alignItems: "center", justifyContent: "center" })}><User size={20} color="#fff" /></Pressable>
        <Pressable testID="nav-menu" onPress={() => setMenuOpen((o) => !o)} style={{ width: 40, height: 40, borderRadius: 12, borderWidth: 1, borderColor: SLATE[200], alignItems: "center", justifyContent: "center" }}>{menuOpen ? <X size={20} color={SLATE[600]} /> : <Menu size={20} color={SLATE[600]} />}</Pressable>
      </View>
      {menuOpen ? (
        <View testID="nav-mobile-menu" style={{ borderTopWidth: 1, borderTopColor: SLATE[200], paddingHorizontal: 16, paddingVertical: 12, gap: 12, backgroundColor: "#fff" }}>
          <LocationButton />
          <Pressable onPress={() => { setMenuOpen(false); router.push("/(site)/services"); }}><Text style={{ fontSize: 14, fontWeight: "600", color: SLATE[700] }}>All Services</Text></Pressable>
          <Pressable onPress={() => { setMenuOpen(false); router.push("/(site)/membership"); }} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Image source={CROWN} style={{ width: 22, height: 22 }} contentFit="contain" /><Text style={{ fontSize: 14, fontWeight: "600", color: "#D97706" }}>Membership</Text></Pressable>
        </View>
      ) : null}
      <Modal visible={searchOpen} transparent animationType="fade" onRequestClose={() => setSearchOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: "rgba(15,23,42,0.4)" }} onPress={() => setSearchOpen(false)} />
        <View testID="mobile-search-modal" style={{ position: "absolute", top: 0, left: 0, right: 0, paddingTop: insets.top + 16, backgroundColor: "#fff", borderBottomLeftRadius: 16, borderBottomRightRadius: 16, padding: 16 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ flex: 1 }}><ServiceSearch variant="navbar" autoFocus placeholder="Search services…" onDone={() => setSearchOpen(false)} /></View>
            <Pressable testID="mobile-search-close" onPress={() => setSearchOpen(false)} style={{ height: 40, paddingHorizontal: 12, justifyContent: "center" }}><Text style={{ fontSize: 14, fontWeight: "600", color: SLATE[600] }}>Cancel</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const TABS = [
  { key: "home", label: "Home", icon: Home, to: "/(site)" },
  { key: "services", label: "Services", icon: LayoutGrid, to: "/(site)/services" },
  { key: "cart", label: "Booking", icon: ShoppingBag, to: "/(site)/book" },
  { key: "bookings", label: "Orders", icon: CalendarCheck, to: "/(customer)/orders" },
  { key: "profile", label: "Profile", icon: User, to: "/(customer)/profile" },
];

export function MobileBottomNav() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const { count } = useCart();
  const go = (t: typeof TABS[number]) => {
    if (["bookings", "profile"].includes(t.key) && !user) { router.push("/login"); return; }
    router.push(t.to as any);
  };
  const isActive = (t: typeof TABS[number]) =>
    t.key === "home" ? pathname === "/" || pathname === "/(site)" || pathname === ""
      : t.key === "services" ? pathname.includes("/services")
        : t.key === "cart" ? pathname.includes("/book")
          : t.key === "bookings" ? pathname.includes("/orders")
            : t.key === "profile" ? pathname.includes("/profile")
              : false;
  return (
    <View testID="mobile-bottom-nav" style={{ position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "rgba(255,255,255,0.95)", borderTopWidth: 1, borderTopColor: SLATE[200], flexDirection: "row", paddingBottom: insets.bottom }}>
      {TABS.map((t) => {
        const act = isActive(t);
        const color = act ? PRIMARY[700] : SLATE[400];
        return (
          <Pressable key={t.key} testID={`tab-${t.key}`} onPress={() => go(t)} style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 2, paddingVertical: 8, height: 64 }}>
            <View>
              <t.icon size={20} color={color} strokeWidth={act ? 2.3 : 1.7} />
              {t.key === "cart" && count > 0 ? (
                <View testID="tab-cart-count" style={{ position: "absolute", top: -8, right: -12, height: 16, minWidth: 16, paddingHorizontal: 4, borderRadius: 8, backgroundColor: PRIMARY[700], alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>{count}</Text>
                </View>
              ) : null}
            </View>
            <Text style={{ fontSize: 10, fontWeight: "500", color }}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
