export const kmhToMps = (kmh: number): number => kmh / 3.6;
export const mpsToKmh = (mps: number): number => mps * 3.6;

export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters) || meters < 0) return "—";
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km < 100 ? km.toFixed(1) : Math.round(km).toString()} km`;
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 59_500) return `${Math.round(ms / 1000)} s`;
  const totalMin = Math.round(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

export function formatSpeed(mps: number): string {
  if (!Number.isFinite(mps) || mps < 0) return "—";
  return `${Math.round(mpsToKmh(mps))} km/h`;
}

export function formatClockTime(epochMs: number, locale?: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(epochMs);
}
