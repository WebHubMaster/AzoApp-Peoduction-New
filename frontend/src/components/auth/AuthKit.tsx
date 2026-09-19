import React from "react";
import { View, Text, TextInput, Pressable, ActivityIndicator, TextInputProps } from "react-native";
import { useTheme, palette } from "@/src/theme";
import { Icon, MdiName } from "@/src/components/Icon";
import { TW } from "@/src/components/partner/home/tw";

/* Web shadcn <Input>: h-11 rounded-md border-slate-200 px-3 text-sm */
export const AuthInput = React.forwardRef<TextInput, TextInputProps & { icon?: MdiName; testID?: string }>(({ icon, style, ...p }, ref) => {
  const { colors } = useTheme();
  return (
    <View style={{ position: "relative", justifyContent: "center" }}>
      {icon ? <View style={{ position: "absolute", left: 12, zIndex: 1 }}><Icon name={icon} size={16} color={TW.slate400} /></View> : null}
      <TextInput ref={ref} placeholderTextColor={TW.slate400} {...p}
        style={[{ height: 44, borderRadius: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, paddingLeft: icon ? 36 : 12, paddingRight: 12, color: colors.text, fontSize: 14 }, style]} />
    </View>
  );
});
AuthInput.displayName = "AuthInput";

/* Web <Button className="bg-primary-700 hover:bg-primary-800 h-11"> */
export function AuthButton({ title, onPress, busy, disabled, icon, testID, variant = "primary" }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean; icon?: MdiName; testID?: string; variant?: "primary" | "outline" }) {
  const { colors } = useTheme();
  const P = palette(colors.primary);
  const off = !!busy || !!disabled;
  const primary = variant === "primary";
  return (
    <Pressable testID={testID} onPress={onPress} disabled={off} style={({ pressed }) => ({ height: 44, borderRadius: 6, backgroundColor: primary ? (pressed ? P[800] : P[700]) : colors.surface, borderWidth: primary ? 0 : 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4, opacity: off ? 0.5 : 1 })}>
      {busy ? <ActivityIndicator size="small" color={primary ? "#fff" : P[700]} /> : (
        <>
          <Text style={{ color: primary ? "#fff" : colors.textSecondary, fontSize: 14, fontWeight: "500" }}>{title}</Text>
          {icon ? <Icon name={icon} size={16} color={primary ? "#fff" : colors.textSecondary} /> : null}
        </>
      )}
    </Pressable>
  );
}

/* text-xs slate-500 link buttons ("← Change number", "Forgot password?") */
export function TextLink({ title, onPress, testID, primary, align = "flex-start" }: { title: string; onPress: () => void; testID?: string; primary?: boolean; align?: "flex-start" | "center" }) {
  const { colors } = useTheme();
  return (
    <Pressable testID={testID} onPress={onPress} hitSlop={8} style={{ alignSelf: align }}>
      <Text style={{ color: primary ? colors.primaryHover : TW.slate500, fontSize: 12, fontWeight: primary ? "600" : "400" }}>{title}</Text>
    </Pressable>
  );
}

/* Web card: p-5 rounded-2xl border border-slate-200 bg-slate-50/60 (or bg-white) */
export function AuthCard({ children, subtle, testID, style }: { children: React.ReactNode; subtle?: boolean; testID?: string; style?: any }) {
  const { colors, mode } = useTheme();
  return <View testID={testID} style={[{ padding: 20, borderRadius: 16, borderWidth: 1, borderColor: colors.border, backgroundColor: subtle ? (mode === "dark" ? colors.surfaceSubtle : "rgba(248,250,252,0.6)") : colors.surface, gap: 12 }, style]}>{children}</View>;
}
