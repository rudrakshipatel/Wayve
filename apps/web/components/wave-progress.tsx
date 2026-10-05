/** Progress drawn as a travelling sine wave — Wave's signature detail. */
export function WaveProgress({
  progress,
  active,
}: {
  readonly progress: number;
  readonly active: boolean;
}) {
  const width = 320;
  const height = 22;
  const periods = 7;
  let d = "";
  for (let x = 0; x <= width; x += 2) {
    const y = height / 2 + Math.sin((x / width) * periods * Math.PI * 2) * 5;
    d += `${x === 0 ? "M" : "L"}${x},${y.toFixed(2)}`;
  }
  const p = Math.min(1, Math.max(0, progress));
  const cx = p * width;
  const cy = height / 2 + Math.sin(p * periods * Math.PI * 2) * 5;
  return (
    <svg
      viewBox={`-8 0 ${width + 16} ${height}`}
      className="h-6 w-full overflow-visible"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(p * 100)}
      aria-label="Journey progress"
    >
      <defs>
        <linearGradient id="wave-progress" x1="0" x2="1">
          <stop offset="0" stopColor="var(--wave-tide)" />
          <stop offset="1" stopColor="var(--wave-surf)" />
        </linearGradient>
        <clipPath id="wave-progress-clip">
          <rect x="-8" y="0" width={cx + 8} height={height} />
        </clipPath>
      </defs>
      <path d={d} fill="none" stroke="var(--wave-border)" strokeWidth="2.5" strokeLinecap="round" />
      <path
        d={d}
        fill="none"
        stroke="url(#wave-progress)"
        strokeWidth="3"
        strokeLinecap="round"
        clipPath="url(#wave-progress-clip)"
      />
      <circle
        cx={cx}
        cy={cy}
        r="5"
        fill="var(--wave-surface-solid)"
        stroke="var(--wave-surf)"
        strokeWidth="3"
      >
        {active && (
          <animate attributeName="r" values="5;6.5;5" dur="1.6s" repeatCount="indefinite" />
        )}
      </circle>
    </svg>
  );
}
