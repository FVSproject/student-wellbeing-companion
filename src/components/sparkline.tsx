export function Sparkline({
  values,
  min,
  max,
  height = 44,
  width = 240,
  label,
  color = 'currentColor',
}: {
  values: number[];
  min: number;
  max: number;
  height?: number;
  width?: number;
  label?: string;
  color?: string;
}) {
  const cleaned = values.filter((v) => Number.isFinite(v));

  if (cleaned.length < 2) {
    return (
      <div className="flex h-11 items-center text-xs text-muted-foreground">
        {label ? `${label} — ` : ''}Waiting for samples…
      </div>
    );
  }

  const range = max - min || 1;
  const step = width / (cleaned.length - 1);
  const points = cleaned
    .map((v, i) => {
      const y = height - ((Math.max(min, Math.min(max, v)) - min) / range) * height;
      return `${(i * step).toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  const latest = cleaned[cleaned.length - 1];

  return (
    <div>
      {label && (
        <div className="mb-1 flex items-center justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
          <span>{label}</span>
          <span className="font-mono text-foreground">{latest.toFixed(1)}</span>
        </div>
      )}
      <svg width={width} height={height} className="w-full" preserveAspectRatio="none" viewBox={`0 0 ${width} ${height}`}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
