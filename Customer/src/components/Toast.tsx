/** Toast — mirrors sonner <Toaster position="top-center" richColors /> used by the web panel. */
import React, { createContext, useContext, useCallback, useRef, useState } from "react";
import { Text, Animated, Pressable, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CheckCircle2, AlertCircle, Info } from "lucide-react-native";

type ToastKind = "success" | "error" | "info";
interface ToastItem { id: number; kind: ToastKind; message: string }
interface ToastCtx {
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

/* sonner richColors palette */
const META: Record<ToastKind, { bg: string; border: string; fg: string; Icon: any }> = {
  success: { bg: "#ECFDF3", border: "#D3F1DF", fg: "#008A2E", Icon: CheckCircle2 },
  error: { bg: "#FFF0F0", border: "#FFE0E1", fg: "#E60000", Icon: AlertCircle },
  info: { bg: "#F0F8FF", border: "#D3E5F5", fg: "#0973DC", Icon: Info },
};

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const insets = useSafeAreaInsets();
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);

  const hide = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setToast(null));
  }, [anim]);

  const show = useCallback((message: string, kind: ToastKind) => {
    if (timer.current) clearTimeout(timer.current);
    setToast({ id: Date.now(), kind, message });
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
    timer.current = setTimeout(hide, 4000);
  }, [anim, hide]);

  const value: ToastCtx = {
    success: (m) => show(m, "success"),
    error: (m) => show(m, "error"),
    info: (m) => show(m, "info"),
  };

  const m = toast ? META[toast.kind] : null;

  return (
    <Ctx.Provider value={value}>
      {children}
      {toast && m ? (
        <Animated.View
          pointerEvents="box-none"
          style={{ position: "absolute", top: insets.top + 12, left: 16, right: 16, zIndex: 9999, alignItems: "center",
            opacity: anim, transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-24, 0] }) }] }}
        >
          <Pressable testID="toast" onPress={hide}
            style={{ width: "100%", maxWidth: 356, flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: m.bg, borderRadius: 8,
              borderWidth: 1, borderColor: m.border, paddingHorizontal: 16, paddingVertical: 14, boxShadow: "0px 4px 12px rgba(0,0,0,0.10)", elevation: 6 }}>
            <View style={{ width: 20, alignItems: "center" }}><m.Icon size={18} color={m.fg} /></View>
            <Text testID="toast-message" style={{ flex: 1, color: m.fg, fontSize: 13, fontWeight: "500", lineHeight: 18 }}>{toast.message}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </Ctx.Provider>
  );
};

export function useToast(): ToastCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used within ToastProvider");
  return c;
}
