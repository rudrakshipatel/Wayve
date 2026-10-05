import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const config: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: [
    "@wave/client",
    "@wave/map-utils",
    "@wave/simulation-engine",
    "@wave/types",
    "@wave/ui",
  ],
  headers() {
    return Promise.resolve([
      { source: "/:path*", headers: securityHeaders },
      // Share pages must never be indexed or cached by intermediaries.
      {
        source: "/journey/:token*",
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ]);
  },
};

export default config;
