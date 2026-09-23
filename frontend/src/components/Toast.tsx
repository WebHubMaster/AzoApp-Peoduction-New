import React, { createContext, useContext, useCallback, useRef, useState } from "react";
import { Text, View, Animated, Pressable } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme, radius, spacing, fontSize } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";

type ToastKind = "success" | "error" | "info";
type ToastAction = { label: string; onPress: () => void };
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
  action?: ToastAction;
}
interface ToastCtx {
  show: (message: string, kind?: ToastKind, action?: ToastAction) => void;
  success: (m: string, action?: ToastAction) => void;
  error: (m: string, action?: ToastAction) => void;
  info: (m: string, action?: ToastAction) => void;
}

const Ctx = createContext<ToastCtx | null>(null);

export const ToastProvider = ({ children }: { children: React.ReactNode }) => {
  const [toast, setToast] = useState<ToastItem | null>(null);
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<any>(null);

  const hide = useCallback(() => {
    Animated.timing(anim, { toValue: 0, duration: 180, useNativeDriver: true }).start(() => setToast(null));
  }, [anim]);

  const show = useCallback(
    (message: string, kind: ToastKind = "info", action?: ToastAction) => {
      if (timer.current) clearTimeout(timer.current);
      setToast({ id: Date.now(), kind, message, action });
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 8 }).start();
      timer.current = setTimeout(hide, action ? 6000 : 2800);
    },
    [anim, hide],
  );

  const api: ToastCtx = {
    show,
    success: (m, action) => show(m, "success", action),
    error: (m, action) => show(m, "error", action),
    info: (m, action) => show(m, "info", action),
  };

  const kindMeta: Record<ToastKind, { icon: MdiName; color: string }> = {
    success: { icon: "check-circle", color: colors.success },
    error: { icon: "alert-circle", color: colors.danger },
    info: { icon: "information", color: colors.info },
  };

  return (
    <Ctx.Provider value={api}>
      {children}
      {toast ? (
        <Animated.View
          style={{
            position: "absolute",
            top: insets.top + 8,
            left: spacing.lg,
            right: spacing.lg,
            zIndex: 9999,
            pointerEvents: "box-none",
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-20, 0] }) }],
          }}
        >
          <Pressable
            onPress={hide}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              backgroundColor: colors.surface,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.border,
              padding: spacing.md,
              boxShadow: "0px 6px 16px rgba(15,23,42,0.15)",
              elevation: 8,
            }}
          >
            <Icon name={kindMeta[toast.kind].icon} size={22} color={kindMeta[toast.kind].color} />
            <Text style={{ flex: 1, color: colors.text, fontSize: fontSize.sm, fontWeight: "600" }}>{toast.message}</Text>
            {toast.action ? (
              <Pressable
                testID="toast-action"
                onPress={() => { const a = toast.action; hide(); a?.onPress(); }}
                hitSlop={8}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.sm, backgroundColor: kindMeta[toast.kind].color }}
              >
                <Text style={{ color: "#fff", fontSize: fontSize.sm, fontWeight: "800" }}>{toast.action.label}</Text>
              </Pressable>
            ) : null}
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
