import { ArrowRight, Waves } from "lucide-react";

export default function Home() {
  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden px-6 py-8 md:px-12">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(55% 45% at 85% 15%, color-mix(in oklab, var(--wave-surf) 22%, transparent), transparent), radial-gradient(50% 50% at 10% 90%, color-mix(in oklab, var(--wave-tide) 20%, transparent), transparent)",
        }}
      />
      <header className="relative flex items-center gap-2">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-gradient-to-br from-tide to-surf text-white">
          <Waves className="h-4 w-4" strokeWidth={2.5} />
        </span>
        <span className="font-display text-lg font-semibold tracking-tight">Wave</span>
      </header>

      <section className="relative my-auto max-w-3xl py-20">
        <p className="animate-rise text-[12px] font-semibold uppercase tracking-[0.2em] text-muted">
          Location simulation · Virtual journeys
        </p>
        <h1
          className="animate-rise font-display mt-5 text-[44px] leading-[1.02] font-semibold tracking-[-0.035em] text-balance md:text-[76px]"
          style={{ animationDelay: "80ms" }}
        >
          Design a journey.
          <br />
          <span className="bg-gradient-to-r from-tide to-surf bg-clip-text text-transparent">
            Share it live.
          </span>
        </h1>
        <p
          className="animate-rise mt-6 max-w-xl text-lg leading-relaxed text-muted"
          style={{ animationDelay: "160ms" }}
        >
          Plan a route, choose how it moves, and send a link. Anyone can follow the simulated
          journey on a live map — no app, no account.
        </p>
        <a
          href="/journey/demo"
          className="animate-rise mt-10 inline-flex h-12 items-center gap-2 rounded-full bg-ink px-6 text-[15px] font-medium text-bg transition-transform active:scale-[0.97]"
          style={{ animationDelay: "240ms" }}
        >
          See a live demo <ArrowRight className="h-4 w-4" />
        </a>
      </section>

      <footer className="relative text-xs text-muted">
        Wave simulates positions inside Wave only. It never changes a device&apos;s real location.
      </footer>
    </main>
  );
}
