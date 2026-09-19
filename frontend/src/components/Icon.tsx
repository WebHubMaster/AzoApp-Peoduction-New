import React from "react";
import MDIcon from "@react-native-vector-icons/material-design-icons";
import { useTheme } from "@/src/theme";

type MdiName = React.ComponentProps<typeof MDIcon>["name"];

export function Icon({
  name,
  size = 22,
  color,
}: {
  name: MdiName;
  size?: number;
  color?: string;
}) {
  const { colors } = useTheme();
  return <MDIcon name={name} size={size} color={color || colors.text} />;
}

export type { MdiName };
export default Icon;
