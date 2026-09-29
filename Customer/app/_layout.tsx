import React, { useEffect } from "react";
import { View, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider, KeyboardAvoidingView } from "react-native-keyboard-controller";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { setupNotificationHandler, onNotificationTap } from "../src/lib/push";
import { setupAndroidChannels, requestNotificationPermission } from "../src/lib/notifications";
import { RealtimeProvider } from "@/src/context/RealtimeContext";
import { RescheduleAlertOverlay } from "@/src/components/customer/RescheduleAlertOverlay";
import { useNavigate } from "../src/lib/navigate";
setupNotificationHandler();
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";

import { ThemeProvider, TC } from "@/src/theme";
import { CartProvider } from "../src/context/CartContext";
import { AuthProvider } from "@/src/context/AuthContext";
import { BrandProvider, useSiteConfigQuery } from "@/src/context/BrandContext";
import { ToastProvider } from "@/src/components/Toast";
import { PaymentWebViewHost } from "@/src/components/PaymentWebViewHost";
import { PUBLIC_SANS_FONTS, installGlobalFont } from "@/src/lib/globalFont";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 30 * 1000, refetchOnWindowFocus: false } } });

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
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
  useEffect(() => { setupAndroidChannels().catch(() => {}); requestNotificationPermission().catch(() => {}); }, []);
  if (!fontsLoaded) return null;
  return (
    <ThemeProvider brandPrimary={data?.theme?.primary}>
      <BrandProvider value={data}>
        <AuthProvider><CartProvider>
          <RealtimeProvider>
            <ToastProvider>
              <PaymentWebViewHost />
              <PushTapBridge />
              <RescheduleAlertOverlay />
              <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}><Stack screenOptions={{ headerShown: false, animation: "fade" }}>
                <Stack.Screen name="index" />
                <Stack.Screen name="(site)" />
                <Stack.Screen name="login" options={{ animation: "slide_from_bottom" }} />
                <Stack.Screen name="(customer)" />
              </Stack></KeyboardAvoidingView>
            </ToastProvider>
          </RealtimeProvider>
        </CartProvider></AuthProvider>
      </BrandProvider>
    </ThemeProvider>
  );
}

function PushTapBridge() {
  const navigate = useNavigate();
  useEffect(() => onNotificationTap((link) => navigate(link)), [navigate]);
  return null;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts(PUBLIC_SANS_FONTS);
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
