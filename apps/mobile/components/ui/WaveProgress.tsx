import Svg, { Circle, ClipPath, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { useWaveColors } from "@/lib/theme";

/** Progress as a travelling sine wave — Wave's signature detail. */
export function WaveProgress({ progress }: { progress: number }) {
  const colors = useWaveColors();
  const width = 320;
  const height = 22;
  const periods = 7;
  let d = "";
  for (let x = 0; x <= width; x += 2) {
    const y = height / 2 + Math.sin((x / width) * periods * Math.PI * 2) * 5;
    d += `${x === 0 ? "M" : "L"}${x},${y.toFixed(2)}`;
  }
  const p = Math.min(1, Math.max(0, progress));
  const cx = p * width;
  const cy = height / 2 + Math.sin(p * periods * Math.PI * 2) * 5;
  return (
    <Svg
      viewBox={`-8 0 ${width + 16} ${height}`}
      width="100%"
      height={24}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(p * 100) }}
    >
      <Defs>
        <LinearGradient id="wp" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={colors.primary} />
          <Stop offset="1" stopColor={colors.accent} />
        </LinearGradient>
        <ClipPath id="wpc">
          <Path d={`M-8 0H${cx.toFixed(2)}V${height}H-8Z`} />
        </ClipPath>
      </Defs>
      <Path d={d} fill="none" stroke={colors.border} strokeWidth={2.5} strokeLinecap="round" />
      <Path
        d={d}
        fill="none"
        stroke="url(#wp)"
        strokeWidth={3}
        strokeLinecap="round"
        clipPath="url(#wpc)"
      />
      <Circle cx={cx} cy={cy} r={5} fill={colors.surface} stroke={colors.accent} strokeWidth={3} />
    </Svg>
  );
}
