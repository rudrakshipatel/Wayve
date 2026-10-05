import { Pressable, View, type ViewProps } from "react-native";
import { cn } from "./cn";

export function Card({ className, ...props }: ViewProps & { className?: string }) {
  return (
    <View className={cn("rounded-card border border-line bg-surface p-4", className)} {...props} />
  );
}

export function PressableCard({
  className,
  onPress,
  children,
  accessibilityLabel,
}: {
  className?: string;
  onPress: () => void;
  children: React.ReactNode;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      className={cn("rounded-card border border-line bg-surface p-4 active:opacity-80", className)}
    >
      {children}
    </Pressable>
  );
}
