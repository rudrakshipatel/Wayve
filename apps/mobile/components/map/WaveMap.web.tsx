import { forwardRef } from "react";
import { SchematicMap } from "./SchematicMap";
import type { WaveMapHandle, WaveMapProps } from "./types";

export const WaveMap = forwardRef<WaveMapHandle, WaveMapProps>(function WaveMap(props, ref) {
  return <SchematicMap ref={ref} {...props} />;
});
