/** Auth gate — mirrors the web Login "login-auth-loader": restore the saved session, then route. */
import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { useRouter } from "expo-router";
import { useAuth } from "@/src/context/AuthContext";
import { PRIMARY } from "@/src/theme";

export default function Gate() {
  const router = useRouter();
  const { booting, user } = useAuth();
  useEffect(() => {
    if (booting) return;
    router.replace(user ? "/(customer)" : "/login");
  }, [booting, user]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View testID="login-auth-loader" style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#fff" }}>
      <ActivityIndicator size="large" color={PRIMARY[700]} />
    </View>
  );
}
