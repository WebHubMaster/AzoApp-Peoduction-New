import React, { useEffect } from "react";
import { View, Text, AppState } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider, KeyboardAvoidingView } from "react-native-keyboard-controller";
import { QueryClient, QueryClientProvider, focusManager } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { useAuth } from "../src/context/AuthContext";
import { setupNotificationHandler } from "../src/lib/push";
import { setTapHandler } from "../src/lib/notifTap";
import { setupAndroidChannels } from "../src/lib/notifications";
import { RealtimeProvider } from "@/src/context/RealtimeContext";
import { CustomerAlertOverlay } from "@/src/components/customer/CustomerAlertOverlay";
import { RateServiceProvider } from "@/src/components/customer/RateService";
import { useNavigate } from "../src/lib/navigate";
import { onCityChange } from "@/src/lib/location";
setupNotificationHandler();
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";

import { ThemeProvider, TC } from "@/src/theme";
import { CartProvider } from "../src/context/CartContext";
import { AuthProvider } from "@/src/context/AuthContext";
import { BrandProvider, useSiteConfigQuery } from "@/src/context/BrandContext";
import { ToastProvider } from "@/src/components/Toast";
import { RefreshNoteHost } from "@/src/components/RefreshNote";
import { PaymentWebViewHost } from "@/src/components/PaymentWebViewHost";
import AppUpdateGate from "@/src/components/AppUpdateGate";
import { initCrashReporter, reportError } from "@/src/lib/crashReporter";
import { APP_FONTS, installGlobalFont } from "@/src/lib/globalFont";

SplashScreen.preventAutoHideAsync().catch(() => {});
initCrashReporter("customer");

// Pause react-query polling while backgrounded; refresh on return (saves CPU/battery, smoother resume).
focusManager.setEventListener((handle) => {
  const sub = AppState.addEventListener("change", (s) => handle(s === "active"));
  return () => sub.remove();
});

const queryClient = new QueryClient({ defaultOptions: { queries: {
  retry: 1,
  retryDelay: (attempt: number) => Math.min(1000 * 2 ** attempt, 4000),
  staleTime: 2 * 60 * 1000,
  gcTime: 24 * 60 * 60 * 1000,
  refetchOnWindowFocus: false,
} } });
// Location switch → refetch everything so city-disabled categories/services drop out.
onCityChange(() => { queryClient.invalidateQueries(); });

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error) { try { reportError("customer", error, true); } catch { /* noop */ } }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: TC.surface }}>
          <Text style={{ color: TC.text, fontSize: 18, fontWeight: "800", marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ color: TC.textMuted, textAlign: "center" }}>{String(this.state.error?.message || this.state.error)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function ThemedRoot({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { data } = useSiteConfigQuery();
  useEffect(() => { if (fontsLoaded) SplashScreen.hideAsync().catch(() => {}); }, [fontsLoaded]);
  // Create the loud full-screen ring channels + ask for notification permission at
  // app open so the reschedule alert can render on the very first event.
  useEffect(() => { setupAndroidChannels().catch(() => {}); }, []);
  if (!fontsLoaded) return null;
  return (
    <ThemeProvider brandPrimary={data?.theme?.primary}>
      <BrandProvider value={data}>
        <AuthProvider><CartProvider>
          <RealtimeProvider>
            <ToastProvider>
              <PaymentWebViewHost />
              <PushTapBridge />
              <CustomerAlertOverlay />
              <AppUpdateGate />
              <RateServiceProvider><KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}><Stack screenOptions={{ headerShown: false, animation: "fade" }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(site)" />
                <Stack.Screen name="login" options={{ animation: "slide_from_bottom" }} />
                <Stack.Screen name="permissions" />
                <Stack.Screen name="(customer)" />
              </Stack></KeyboardAvoidingView></RateServiceProvider>
              <RefreshNoteHost />
            </ToastProvider>
          </RealtimeProvider>
        </CartProvider></AuthProvider>
      </BrandProvider>
    </ThemeProvider>
  );
}

function PushTapBridge() {
  const navigate = useNavigate();
  const router = useRouter();
  const { user, booting } = useAuth();
  useEffect(() => {
    if (booting) return undefined;
    setTapHandler(({ data: d }) => {
      if (!user) { router.push("/login"); return; }
      const bid = String(d.booking_id || "");
      const code = String(d.code || d.booking_code || "");
      if ((d.type === "chat_message" || d.event === "chat_message") && bid) router.push({ pathname: "/(customer)/orders", params: { chat: bid, focus: code } });
      else if (bid || code) router.push({ pathname: "/(customer)/orders", params: { open: bid, focus: code } });
      else if (d.link && d.link !== "/" && !/^\/(partner|merchant|admin)/.test(d.link)) navigate(String(d.link));
      else router.push("/(customer)/notifications");
    });
    return () => setTapHandler(null);
  }, [user?.id, booting]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(APP_FONTS);
  if (fontsLoaded) installGlobalFont();
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <KeyboardProvider>
          <QueryClientProvider client={queryClient}>
            <ErrorBoundary>
              <ThemedRoot fontsLoaded={fontsLoaded} />
            </ErrorBoundary>
          </QueryClientProvider>
        </KeyboardProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
