import { useColorScheme } from "react-native";
import { colorsFor, travelModeColors, type SemanticColors } from "@wave/ui";

export function useWaveColors(): SemanticColors & { readonly scheme: "light" | "dark" } {
  const scheme = useColorScheme() === "dark" ? "dark" : "light";
  return { ...colorsFor(scheme), scheme };
}

export { travelModeColors };
