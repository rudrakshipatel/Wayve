import type { ExpoConfig } from "expo/config";

const LOCATION_COPY =
  "Wave uses your location only to center the map while you pick places. It is never shared or simulated.";

export default (): ExpoConfig => ({
  name: "Wave",
  slug: "wave",
  scheme: "wave",
  version: "0.1.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: process.env["WAVE_IOS_BUNDLE_ID"] ?? "app.wave.mobile",
    supportsTablet: true,
    usesAppleSignIn: true,
    infoPlist: {
      NSLocationWhenInUseUsageDescription: LOCATION_COPY,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: process.env["WAVE_ANDROID_PACKAGE"] ?? "app.wave.mobile",
    adaptiveIcon: { foregroundImage: "./assets/adaptive-icon.png", backgroundColor: "#3B54F5" },
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
  },
  web: { bundler: "metro", output: "single", favicon: "./assets/icon.png" },
  plugins: [
    "expo-router",
    "expo-font",
    "expo-secure-store",
    "expo-web-browser",
    "expo-apple-authentication",
    "expo-localization",
    "@react-native-community/datetimepicker",
    ["expo-location", { locationWhenInUsePermission: LOCATION_COPY }],
    // The Mapbox SDK download token is read from RNMAPBOX_MAPS_DOWNLOAD_TOKEN at build time.
    "@rnmapbox/maps",
    [
      "expo-splash-screen",
      {
        image: "./assets/splash-icon.png",
        imageWidth: 120,
        backgroundColor: "#F3F4F8",
        dark: { backgroundColor: "#07080C" },
      },
    ],
  ],
  experiments: { typedRoutes: true },
  extra: { eas: { projectId: process.env["EAS_PROJECT_ID"] } },
});
