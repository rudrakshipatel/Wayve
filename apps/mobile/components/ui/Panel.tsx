import { View, type ViewProps } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { cn } from "./cn";

/** Floating glass sheet anchored to the bottom of a map screen. */
export function Panel({ className, children, ...props }: ViewProps & { className?: string }) {
  return (
    <Animated.View entering={FadeInDown.springify().damping(22).stiffness(220)} style={{ flex: 1 }}>
      <View
        className={cn(
          "flex-1 rounded-t-panel border border-line bg-surface px-5 pt-2.5",
          className,
        )}
        style={{
          shadowColor: "#0A0C12",
          shadowOpacity: 0.16,
          shadowRadius: 28,
          shadowOffset: { width: 0, height: -6 },
          elevation: 16,
        }}
        {...props}
      >
        <View className="mb-3 h-1 w-10 self-center rounded-full bg-line" />
        {children}
      </View>
    </Animated.View>
  );
}
