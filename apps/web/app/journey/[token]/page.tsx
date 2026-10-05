import type { Metadata } from "next";
import { JourneyViewer } from "@/components/journey-viewer";

// Generic metadata on purpose: link previews in chat apps never reveal journey details.
export const metadata: Metadata = {
  title: "Live journey",
  description: "Someone shared a simulated journey with you on Wave. Open to watch it live.",
  robots: { index: false, follow: false },
  openGraph: {
    title: "A live journey was shared with you",
    description: "Open to follow it on a live map. No app or account needed.",
    siteName: "Wave",
  },
};

export default async function JourneyPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const { state } = await searchParams;
  return <JourneyViewer token={token} demoState={typeof state === "string" ? state : null} />;
}
