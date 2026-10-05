import * as Haptics from "expo-haptics";
import { ActivityIndicator, Platform, Pressable, View, type PressableProps } from "react-native";
import { cn } from "./cn";
import { Text } from "./Text";

const VARIANTS = {
  primary: { box: "bg-ink", text: "text-bg" },
  brand: { box: "bg-tide", text: "text-white" },
  secondary: { box: "bg-surface border border-line", text: "text-ink" },
  ghost: { box: "bg-transparent", text: "text-ink" },
  danger: { box: "bg-coral/10 border border-coral/30", text: "text-coral" },
} as const;

export interface ButtonProps extends Omit<PressableProps, "children"> {
  readonly label: string;
  readonly variant?: keyof typeof VARIANTS;
  readonly size?: "md" | "lg" | "sm";
  readonly icon?: React.ReactNode;
  readonly loading?: boolean;
  readonly className?: string;
}

export function Button({
  label,
  variant = "primary",
  size = "md",
  icon,
  loading,
  disabled,
  className,
  onPress,
  ...props
}: ButtonProps) {
  const v = VARIANTS[variant];
  const height = size === "lg" ? "h-14" : size === "sm" ? "h-9 px-3.5" : "h-12";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled || loading), busy: Boolean(loading) }}
      disabled={disabled || loading}
      onPress={(e) => {
        if (Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.(e);
      }}
      className={cn(
        "flex-row items-center justify-center gap-2 rounded-full px-5 active:opacity-80",
        height,
        v.box,
        (disabled || loading) && "opacity-50",
        className,
      )}
      {...props}
    >
      {loading ? <ActivityIndicator size="small" /> : icon ? <View>{icon}</View> : null}
      <Text variant="label" className={cn(v.text, size === "sm" && "text-[13px]")}>
        {label}
      </Text>
    </Pressable>
  );
}
