import React, { useEffect } from "react";
import { View, Text } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { KeyboardProvider } from "react-native-keyboard-controller";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";

import { ThemeProvider } from "@/src/theme";
import { AuthProvider } from "@/src/context/AuthContext";
import { BrandProvider, useSiteConfigQuery } from "@/src/context/BrandContext";
import { ToastProvider } from "@/src/components/Toast";
import { PUBLIC_SANS_FONTS, installGlobalFont } from "@/src/lib/globalFont";

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 30 * 1000, refetchOnWindowFocus: false } } });

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: "#fff" }}>
          <Text style={{ color: "#0F172A", fontSize: 18, fontWeight: "800", marginBottom: 8 }}>Something went wrong</Text>
          <Text style={{ color: "#64748B", textAlign: "center" }}>{String(this.state.error?.message || this.state.error)}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function ThemedRoot({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { data } = useSiteConfigQuery();
  useEffect(() => { if (fontsLoaded) SplashScreen.hideAsync().catch(() => {}); }, [fontsLoaded]);
  if (!fontsLoaded) return null;
  return (
    <ThemeProvider>
      <BrandProvider value={data}>
        <AuthProvider>
          <ToastProvider>
            <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="(site)" />
              <Stack.Screen name="login" options={{ animation: "slide_from_bottom" }} />
              <Stack.Screen name="(customer)" />
            </Stack>
          </ToastProvider>
        </AuthProvider>
      </BrandProvider>
    </ThemeProvider>
  );
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
