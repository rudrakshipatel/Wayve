/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        bg: "rgb(var(--wave-bg) / <alpha-value>)",
        surface: "rgb(var(--wave-surface) / <alpha-value>)",
        sunken: "rgb(var(--wave-sunken) / <alpha-value>)",
        line: "rgb(var(--wave-line) / <alpha-value>)",
        ink: "rgb(var(--wave-ink) / <alpha-value>)",
        muted: "rgb(var(--wave-muted) / <alpha-value>)",
        tide: "rgb(var(--wave-tide) / <alpha-value>)",
        surf: "rgb(var(--wave-surf) / <alpha-value>)",
        coral: "rgb(var(--wave-coral) / <alpha-value>)",
        amber: "rgb(var(--wave-amber) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Sora_600SemiBold"],
        "display-bold": ["Sora_700Bold"],
        sans: ["InstrumentSans_400Regular"],
        medium: ["InstrumentSans_500Medium"],
        semibold: ["InstrumentSans_600SemiBold"],
        mono: ["JetBrainsMono_500Medium"],
      },
      borderRadius: { panel: "28px", card: "20px" },
    },
  },
};
