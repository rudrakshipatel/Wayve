import type { Metadata, Viewport } from "next";
import { Instrument_Sans, JetBrains_Mono, Sora } from "next/font/google";
import { Analytics } from "@/components/analytics";
import "./globals.css";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const instrument = Instrument_Sans({
  subsets: ["latin"],
  variable: "--font-instrument",
  display: "swap",
});
const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Wave — simulated journeys, shared live", template: "%s · Wave" },
  description:
    "Design a simulated journey and share a live, view-only map with anyone. No app needed to watch.",
  applicationName: "Wave",
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://wave.app"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f8" },
    { media: "(prefers-color-scheme: dark)", color: "#07080c" },
  ],
};

export default function RootLayout({ children }: { readonly children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${instrument.variable} ${jetbrains.variable}`}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
