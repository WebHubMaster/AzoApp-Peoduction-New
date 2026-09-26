/** Port of web ProfilePhotoPicker: pick → square crop → compress (<2 MB) → onChange(dataUrl). */
import React, { useState } from "react";
import { View, Pressable, ActivityIndicator } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Camera, User as UserIcon } from "lucide-react-native";
import { PRIMARY, SLATE, useTheme } from "../../theme";
import { useToast } from "../Toast";

export function ProfilePhotoPicker({ value, onChange, disabled = false, size = 80, testID = "profile-photo" }: { value?: string; onChange: (dataUrl: string) => void; disabled?: boolean; size?: number; testID?: string }) {
  const { c, isDark } = useTheme();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const pick = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return toast.error("Photo library permission denied");
      const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [1, 1], quality: 0.9 });
      if (res.canceled || !res.assets?.[0]) return;
      setBusy(true);
      const ctx = ImageManipulator.manipulate(res.assets[0].uri);
      ctx.resize({ width: 512 });
      const img = await ctx.renderAsync();
      const out = await img.saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
      if (!out.base64) throw new Error("no data");
      if (out.base64.length * 0.75 > 2 * 1024 * 1024) return toast.error("Image too large (max 2 MB). Please use a smaller photo.");
      onChange(`data:image/jpeg;base64,${out.base64}`);
      toast.success("Photo ready — don't forget to save.");
    } catch { toast.error("Could not read that image. Try another one."); }
    finally { setBusy(false); }
  };
  return (
    <View style={{ width: size, height: size }}>
      <View testID={testID} style={{ width: size, height: size, borderRadius: size / 2, overflow: "hidden", backgroundColor: c.primarySoft, borderWidth: 1, borderColor: isDark ? SLATE[700] : SLATE[200], alignItems: "center", justifyContent: "center" }}>
        {value ? <Image source={{ uri: value }} style={{ width: size, height: size }} contentFit="cover" /> : <UserIcon size={size * 0.4} color={PRIMARY[700]} />}
      </View>
      {!disabled ? (
        <Pressable testID={`${testID}-label`} onPress={pick} disabled={busy} style={({ pressed }) => ({ position: "absolute", bottom: -4, right: -4, height: 32, width: 32, borderRadius: 16, backgroundColor: pressed ? PRIMARY[800] : PRIMARY[700], alignItems: "center", justifyContent: "center", boxShadow: "0px 2px 6px rgba(0,0,0,0.2)" } as any)}>
          {busy ? <ActivityIndicator size="small" color="#fff" /> : <Camera size={16} color="#fff" />}
        </Pressable>
      ) : null}
    </View>
  );
}
