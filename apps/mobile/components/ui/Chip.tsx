import { Pressable } from "react-native";
import { cn } from "./cn";
import { Text } from "./Text";

export function Chip({
  label,
  selected,
  onPress,
  icon,
  className,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: Boolean(selected) }}
      onPress={onPress}
      className={cn(
        "h-10 flex-row items-center gap-1.5 rounded-full border px-3.5 active:opacity-80",
        selected ? "border-ink bg-ink" : "border-line bg-surface",
        className,
      )}
    >
      {icon}
      <Text variant="label" className={cn("text-[14px]", selected ? "text-bg" : "text-ink")}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <Pressable className="flex-row rounded-full bg-sunken p-1" accessibilityRole="tablist">
      {options.map((o) => (
        <Pressable
          key={o.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: o.value === value }}
          onPress={() => {
            onChange(o.value);
          }}
          className={cn(
            "h-9 flex-1 items-center justify-center rounded-full",
            o.value === value && "bg-surface",
          )}
        >
          <Text variant="label" className={cn("text-[14px]", o.value !== value && "text-muted")}>
            {o.label}
          </Text>
        </Pressable>
      ))}
    </Pressable>
  );
}
