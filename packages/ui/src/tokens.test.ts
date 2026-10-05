import { describe, expect, it } from "vitest";
import { TRAVEL_MODES } from "@wave/types";
import {
  cssVariables,
  darkColors,
  lightColors,
  tailwindPreset,
  travelModeColors,
} from "./index.ts";

const hex = /^#[0-9A-F]{6}$/i;

describe("design tokens", () => {
  it("defines both schemes with the same keys", () => {
    expect(Object.keys(darkColors).sort()).toEqual(Object.keys(lightColors).sort());
  });
  it("covers every travel mode", () => {
    for (const mode of TRAVEL_MODES) expect(travelModeColors[mode]).toMatch(hex);
  });
  it("emits CSS variables and a tailwind preset", () => {
    expect(cssVariables("dark")["--wave-surface-raised"]).toBe(darkColors.surfaceRaised);
    expect(tailwindPreset.theme.extend.colors).toMatchObject({
      "text-muted": "var(--wave-text-muted)",
    });
  });
});
