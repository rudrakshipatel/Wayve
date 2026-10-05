import type { TravelMode } from "@wave/types";

/**
 * Wave design tokens. Platform-agnostic: consumed by the Tailwind preset (web),
 * NativeWind (mobile) and Mapbox style expressions.
 */
export const palette = {
  // Brand: a deep "tide" indigo blending into a bright "surf" teal.
  tide: {
    50: "#EEF1FF",
    100: "#DDE3FF",
    200: "#BAC6FF",
    300: "#8FA2FF",
    400: "#6178FF",
    500: "#3B54F5",
    600: "#2A3FD6",
    700: "#2232AA",
    800: "#1C2A85",
    900: "#141E5C",
  },
  surf: {
    50: "#E8FBF8",
    100: "#C6F5EE",
    200: "#8DEADC",
    300: "#4FDAC6",
    400: "#22C4AE",
    500: "#12A893",
    600: "#0C8676",
    700: "#0B6A5E",
    800: "#0B544B",
    900: "#083933",
  },
  ink: {
    0: "#FFFFFF",
    50: "#F6F7FA",
    100: "#ECEEF3",
    200: "#D9DDE6",
    300: "#B5BCCB",
    400: "#8A93A8",
    500: "#646D83",
    600: "#4A5266",
    700: "#333A4B",
    800: "#1F2431",
    900: "#131620",
    950: "#0A0C12",
  },
  coral: { 400: "#FF7A66", 500: "#F25C47", 600: "#D4432F" },
  amber: { 400: "#FFC24D", 500: "#F5A623", 600: "#D48806" },
  mint: { 400: "#4ADE9B", 500: "#22C47D", 600: "#16A265" },
} as const;

export interface SemanticColors {
  readonly background: string;
  readonly surface: string;
  readonly surfaceRaised: string;
  readonly surfaceSunken: string;
  readonly border: string;
  readonly text: string;
  readonly textMuted: string;
  readonly textInverse: string;
  readonly primary: string;
  readonly primaryText: string;
  readonly accent: string;
  readonly success: string;
  readonly warning: string;
  readonly danger: string;
  readonly mapRoute: string;
  readonly mapRouteCasing: string;
  readonly mapMarker: string;
  readonly mapMarkerHalo: string;
}

export const lightColors: SemanticColors = {
  background: palette.ink[50],
  surface: palette.ink[0],
  surfaceRaised: palette.ink[0],
  surfaceSunken: palette.ink[100],
  border: palette.ink[200],
  text: palette.ink[900],
  textMuted: palette.ink[500],
  textInverse: palette.ink[0],
  primary: palette.tide[500],
  primaryText: palette.ink[0],
  accent: palette.surf[400],
  success: palette.mint[500],
  warning: palette.amber[500],
  danger: palette.coral[500],
  mapRoute: palette.tide[500],
  mapRouteCasing: palette.ink[0],
  mapMarker: palette.tide[500],
  mapMarkerHalo: "rgba(59, 84, 245, 0.22)",
};

export const darkColors: SemanticColors = {
  background: palette.ink[950],
  surface: palette.ink[900],
  surfaceRaised: palette.ink[800],
  surfaceSunken: "#07080C",
  border: palette.ink[700],
  text: palette.ink[50],
  textMuted: palette.ink[400],
  textInverse: palette.ink[900],
  primary: palette.tide[400],
  primaryText: palette.ink[0],
  accent: palette.surf[300],
  success: palette.mint[400],
  warning: palette.amber[400],
  danger: palette.coral[400],
  mapRoute: palette.surf[300],
  mapRouteCasing: palette.ink[950],
  mapMarker: palette.surf[300],
  mapMarkerHalo: "rgba(79, 218, 198, 0.25)",
};

export const travelModeColors: Readonly<Record<TravelMode, string>> = {
  walking: palette.mint[500],
  cycling: palette.surf[500],
  driving: palette.tide[500],
  bus: palette.amber[500],
  train: palette.coral[500],
};

export const travelModeGlyphs: Readonly<Record<TravelMode, string>> = {
  walking: "🚶",
  cycling: "🚲",
  driving: "🚗",
  bus: "🚌",
  train: "🚆",
};

export const radius = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
} as const;

export const typography = {
  fontFamily: {
    display: "Sora",
    body: "Inter",
    mono: "JetBrains Mono",
  },
  size: {
    caption: { fontSize: 12, lineHeight: 16 },
    footnote: { fontSize: 13, lineHeight: 18 },
    body: { fontSize: 16, lineHeight: 24 },
    callout: { fontSize: 18, lineHeight: 26 },
    title3: { fontSize: 20, lineHeight: 26 },
    title2: { fontSize: 24, lineHeight: 30 },
    title1: { fontSize: 30, lineHeight: 36 },
    hero: { fontSize: 40, lineHeight: 44 },
  },
  weight: { regular: "400", medium: "500", semibold: "600", bold: "700" },
} as const;

export const motion = {
  duration: { instant: 90, fast: 160, base: 240, slow: 380, map: 900 },
  /** Cubic-bezier control points. */
  easing: {
    standard: [0.2, 0, 0, 1],
    enter: [0, 0, 0, 1],
    exit: [0.3, 0, 1, 1],
  },
  /** Spring configs for Reanimated (`withSpring`). */
  spring: {
    snappy: { damping: 22, stiffness: 320, mass: 1 },
    gentle: { damping: 26, stiffness: 180, mass: 1 },
    sheet: { damping: 30, stiffness: 260, mass: 1 },
  },
} as const;

export const elevation = {
  card: { shadowColor: "#0A0C12", shadowOpacity: 0.08, shadowRadius: 16, shadowOffsetY: 6 },
  floating: { shadowColor: "#0A0C12", shadowOpacity: 0.16, shadowRadius: 28, shadowOffsetY: 12 },
} as const;

export type ColorScheme = "light" | "dark";

export const colorsFor = (scheme: ColorScheme): SemanticColors =>
  scheme === "dark" ? darkColors : lightColors;
