import React from "react";
import { StyleProp, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle } from "react-native-reanimated";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";

// Bottom bar that stays pinned to the screen bottom (behind the keyboard) while the
// root KeyboardAvoidingView lifts only the content above the keyboard.
export function KeyboardFixedBottom({ style, testID, children }: { style?: StyleProp<ViewStyle>; testID?: string; children: React.ReactNode }) {
  const { height } = useReanimatedKeyboardAnimation();
  const pin = useAnimatedStyle(() => ({ transform: [{ translateY: -height.value }] }));
  return <Animated.View testID={testID} style={[style, pin]}>{children}</Animated.View>;
}
