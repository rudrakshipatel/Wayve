import { Text as RNText, type TextProps } from "react-native";
import { cn } from "./cn";

const VARIANTS = {
  hero: "font-display-bold text-[34px] leading-[38px] tracking-tight text-ink",
  title: "font-display text-[24px] leading-[29px] tracking-tight text-ink",
  heading: "font-display text-[18px] leading-[24px] text-ink",
  body: "font-sans text-[16px] leading-[23px] text-ink",
  label: "font-semibold text-[15px] leading-[20px] text-ink",
  caption: "font-medium text-[13px] leading-[18px] text-muted",
  overline: "font-semibold text-[11px] leading-[14px] uppercase tracking-[1.6px] text-muted",
  stat: "font-mono text-[16px] leading-[22px] text-ink",
  eta: "font-display-bold text-[40px] leading-[44px] tracking-tight text-ink",
} as const;

export type TextVariant = keyof typeof VARIANTS;

export function Text({
  variant = "body",
  className,
  ...props
}: TextProps & { variant?: TextVariant; className?: string }) {
  return <RNText className={cn(VARIANTS[variant], className)} {...props} />;
}
