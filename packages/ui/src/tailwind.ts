import {
  colorsFor,
  palette,
  radius,
  typography,
  type ColorScheme,
  type SemanticColors,
} from "./tokens.ts";

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/** CSS custom properties for a colour scheme, e.g. `--wave-surface-raised`. */
export function cssVariables(scheme: ColorScheme): Record<string, string> {
  const colors = colorsFor(scheme);
  return Object.fromEntries(
    (Object.keys(colors) as (keyof SemanticColors)[]).map((k) => [`--wave-${kebab(k)}`, colors[k]]),
  );
}

/** Tailwind/NativeWind preset. Semantic colours resolve through CSS variables for dark mode. */
export const tailwindPreset = {
  theme: {
    extend: {
      colors: {
        ...palette,
        ...Object.fromEntries(
          (Object.keys(colorsFor("light")) as (keyof SemanticColors)[]).map((k) => [
            kebab(k),
            `var(--wave-${kebab(k)})`,
          ]),
        ),
      },
      borderRadius: Object.fromEntries(Object.entries(radius).map(([k, v]) => [k, `${v}px`])),
      fontFamily: {
        display: [typography.fontFamily.display, "system-ui", "sans-serif"],
        sans: [typography.fontFamily.body, "system-ui", "sans-serif"],
        mono: [typography.fontFamily.mono, "ui-monospace", "monospace"],
      },
    },
  },
} as const;
