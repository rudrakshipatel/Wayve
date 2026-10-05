import { Bike, Bus, Car, Footprints, TrainFront, type LucideProps } from "lucide-react";
import type { TravelMode } from "@wave/types";

const ICONS = {
  walking: Footprints,
  cycling: Bike,
  driving: Car,
  bus: Bus,
  train: TrainFront,
} as const;

export function ModeIcon({ mode, ...props }: { readonly mode: TravelMode } & LucideProps) {
  const Icon = ICONS[mode];
  return <Icon aria-hidden {...props} />;
}
