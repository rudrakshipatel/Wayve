import { extendTailwindMerge } from "tailwind-merge";

/** Wave's semantic colour names, so conflicting text-/bg-/border- classes resolve correctly. */
const COLORS = [
  "bg",
  "surface",
  "sunken",
  "line",
  "ink",
  "muted",
  "tide",
  "surf",
  "coral",
  "amber",
  "white",
  "black",
];

const merge = extendTailwindMerge({
  extend: {
    theme: { colors: COLORS },
    classGroups: {
      "font-family": [{ font: ["display", "display-bold", "sans", "medium", "semibold", "mono"] }],
    },
  },
});

/** Joins class names; later classes win over earlier conflicting ones. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return merge(parts.filter(Boolean).join(" "));
}
