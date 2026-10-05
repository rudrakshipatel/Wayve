import { Bike, Bus, Car, Footprints, TrainFront } from "lucide-react-native";
import type { TravelMode } from "@wave/types";

const ICONS = {
  walking: Footprints,
  cycling: Bike,
  driving: Car,
  bus: Bus,
  train: TrainFront,
} as const;

export function ModeIcon({
  mode,
  size = 18,
  color,
}: {
  mode: TravelMode;
  size?: number;
  color: string;
}) {
  const Icon = ICONS[mode];
  return <Icon size={size} color={color} strokeWidth={2} />;
}
