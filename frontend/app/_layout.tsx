import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { View, Text } from "react-native";

import { ThemeProvider } from "@/src/theme";
import { AuthProvider } from "@/src/context/AuthContext";
import { RealtimeProvider } from "@/src/context/RealtimeContext";
import { ChatProvider } from "@/src/context/ChatContext";
import { ChatNotifier } from "@/src/components/ChatNotifier";
import { ToastProvider } from "@/src/components/Toast";
import { BrandProvider, useSiteConfigQuery, SiteConfig } from "@/src/context/BrandContext";
import { setupAndroidChannels } from "@/src/lib/notifications";
import { PUBLIC_SANS_FONTS, installGlobalFont } from "@/src/lib/globalFont";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 30 * 1000, refetchOnWindowFocus: false },
  },
});

/** Simple error boundary so a screen crash never white-screens the whole app. */
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#0B1120" }}>
          <Text style={{ color: "#fff", fontSize: 18, fontWeight: "800", marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ color: "#94A3B8", textAlign: "center" }}>{String(this.state.error?.message || this.state.error)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function ThemedRoot({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { data, isLoading } = useSiteConfigQuery();
  const cfg: SiteConfig | undefined = data;

  useEffect(() => {
    if (fontsLoaded && !isLoading) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, isLoading]);

  useEffect(() => {
    setupAndroidChannels().catch(() => {});
  }, []);

  if (!fontsLoaded) return null;

  const themeCfg = cfg?.theme || { primary: "#0D47A1", secondary: "#1565C0", accent: "#F59E0B", default_mode: "light" };
  const mode = themeCfg.default_mode === "dark" ? "dark" : themeCfg.default_mode === "system" ? undefined : "light";

  const brandCfg: SiteConfig =
    cfg || {
      branding: { site_name: "AzoApp", tagline: "Service at Your Door Steps", logo: "" },
      theme: themeCfg as any,
      currency: "INR",
    };

  return (
    <ThemeProvider brand={themeCfg} forcedMode={mode as any}>
      <BrandProvider value={brandCfg}>
        <AuthProvider>
          <RealtimeProvider>
          <ChatProvider>
          <ChatNotifier />
          <ToastProvider>
            <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="onboarding/notifications" />
              <Stack.Screen name="(auth)/login" />
              <Stack.Screen name="(partner)" />
              <Stack.Screen name="(merchant)" />
              <Stack.Screen name="chat/[id]" options={{ animation: "slide_from_right" }} />
            </Stack>
          </ToastProvider>
          </ChatProvider>
          </RealtimeProvider>
        </AuthProvider>
      </BrandProvider>
    </ThemeProvider>
  );
}

export default function RootLayout() {
  // Load the Material Design Icons font up-front so icons render in Expo Go (Android/iOS).
  const [fontsLoaded] = useFonts({
    MaterialDesignIcons: require("@react-native-vector-icons/material-design-icons/fonts/MaterialDesignIcons.ttf"),
    ...PUBLIC_SANS_FONTS,
  });

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
