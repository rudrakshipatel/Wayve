/**
 * Messaging apps only distribute the Wave link; Wave never uses their location features.
 */
export type ShareTarget = "whatsapp" | "sms" | "telegram" | "email";

export function shareMessage(url: string, title: string): string {
  return `Follow my simulated journey "${title}" live on Wave: ${url}`;
}

export function shareTargetUrl(
  target: ShareTarget,
  url: string,
  title: string,
  platform: "ios" | "android" | "web" = "ios",
): string {
  const text = encodeURIComponent(shareMessage(url, title));
  switch (target) {
    case "whatsapp":
      return `https://wa.me/?text=${text}`;
    case "sms":
      // iOS uses "&body=", Android "?body=".
      return platform === "android" ? `sms:?body=${text}` : `sms:&body=${text}`;
    case "telegram":
      return `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(
        `Follow "${title}" live on Wave`,
      )}`;
    case "email":
      return `mailto:?subject=${encodeURIComponent(`Live journey: ${title}`)}&body=${text}`;
  }
}

export const SHARE_TTL_OPTIONS = [
  { hours: 1, label: "1 hour" },
  { hours: 8, label: "8 hours" },
  { hours: 24, label: "1 day" },
  { hours: 24 * 7, label: "1 week" },
] as const;
