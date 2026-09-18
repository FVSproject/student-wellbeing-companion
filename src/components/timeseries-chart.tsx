import { cn } from '@/lib/utils';

type Point = { t: Date | string; v: number | null };

/**
 * Post-session time-series chart. Renders a full-width area chart with
 * a monotone cubic curve, gradient fill, subtle grid, and Y-axis tick
 * labels. Dependency-free (pure SVG) so it stays out of the client bundle.
 */
export function TimeSeriesChart({
  points,
  min,
  max,
  height = 200,
  label,
  unit,
  color = 'currentColor',
  emptyLabel = 'No data',
  className,
}: {
  points: Point[];
  min: number;
  max: number;
  height?: number;
  label?: string;
  unit?: string;
  color?: string;
  emptyLabel?: string;
  className?: string;
}) {
  const clean = points
    .filter((p): p is { t: Date | string; v: number } => p.v != null && Number.isFinite(p.v))
    .map((p) => ({ t: typeof p.t === 'string' ? new Date(p.t) : p.t, v: p.v }));

  const width = 720;
  const padL = 48;
  const padR = 20;
  const padT = 16;
  const padB = 28;

  if (clean.length < 2) {
    return (
      <ChartFrame label={label} unit={unit} className={className}>
        <div
          className="flex items-center justify-center text-xs italic text-muted-foreground"
          style={{ height }}
        >
          {emptyLabel}
        </div>
      </ChartFrame>
    );
  }

  const tMin = clean[0].t.getTime();
  const tMax = clean[clean.length - 1].t.getTime();
  const tRange = tMax - tMin || 1;
  const yRange = max - min || 1;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const xOf = (t: Date) => padL + ((t.getTime() - tMin) / tRange) * chartW;
  const yOf = (v: number) =>
    padT + chartH - ((Math.min(Math.max(v, min), max) - min) / yRange) * chartH;

  const pts = clean.map((p) => ({ x: xOf(p.t), y: yOf(p.v) }));
  const linePath = monotonePath(pts);
  const areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)},${(padT + chartH).toFixed(1)} L ${pts[0].x.toFixed(1)},${(padT + chartH).toFixed(1)} Z`;

  const latest = clean[clean.length - 1].v;
  const gradientId = `ts-grad-${Math.random().toString(36).slice(2, 8)}`;

  // Y-axis tick values (5 ticks: min, min+25%, mid, min+75%, max).
  const ticks = [
    { v: max, y: padT },
    { v: min + yRange * 0.75, y: padT + chartH * 0.25 },
    { v: min + yRange * 0.5, y: padT + chartH * 0.5 },
    { v: min + yRange * 0.25, y: padT + chartH * 0.75 },
    { v: min, y: padT + chartH },
  ];

  return (
    <ChartFrame label={label} unit={unit} latest={latest} className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-auto w-full"
        style={{ color }}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {ticks.map((tick, i) => (
          <line
            key={i}
            x1={padL}
            y1={tick.y}
            x2={width - padR}
            y2={tick.y}
            stroke="currentColor"
            strokeOpacity={i === 0 || i === ticks.length - 1 ? 0.15 : 0.06}
            strokeDasharray={i === 0 || i === ticks.length - 1 ? undefined : '2 3'}
          />
        ))}

        {/* Y-axis tick labels */}
        {ticks.map((tick, i) => (
          <text
            key={i}
            x={padL - 8}
            y={tick.y + 3}
            textAnchor="end"
            fontSize="10"
            fill="currentColor"
            fillOpacity="0.55"
          >
            {tick.v.toFixed(tick.v < 10 ? 1 : 0)}
          </text>
        ))}

        {/* Area under curve */}
        <path d={areaPath} fill={`url(#${gradientId})`} />

        {/* The line */}
        <path
          d={linePath}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* End dot */}
        <circle
          cx={pts[pts.length - 1].x}
          cy={pts[pts.length - 1].y}
          r="3.5"
          fill="currentColor"
        />
        <circle
          cx={pts[pts.length - 1].x}
          cy={pts[pts.length - 1].y}
          r="1.5"
          fill="white"
        />
      </svg>

      <div
        className="mt-1 flex justify-between text-[10px] text-muted-foreground"
        style={{ paddingLeft: padL, paddingRight: padR }}
      >
        <span>{fmtTime(clean[0].t)}</span>
        <span>{fmtTime(clean[clean.length - 1].t)}</span>
      </div>
    </ChartFrame>
  );
}

function ChartFrame({
  label,
  unit,
  latest,
  className,
  children,
}: {
  label?: string;
  unit?: string;
  latest?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-border bg-gradient-to-b from-white to-muted/10 p-4 shadow-sm',
        className
      )}
    >
      {(label || latest != null) && (
        <div className="mb-2 flex items-baseline justify-between">
          {label && (
            <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {label}
            </span>
          )}
          {latest != null && (
            <span className="font-mono text-sm tabular-nums text-foreground">
              {latest.toFixed(latest < 10 ? 1 : 0)}
              {unit && (
                <span className="ms-1 text-[10px] text-muted-foreground">{unit}</span>
              )}
            </span>
          )}
        </div>
      )}
      {children}
    </div>
  );
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------- Fritsch–Carlson monotone cubic (no overshoot on peaks) ----------

function monotonePath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x},${pts[0].y}`;
  const n = pts.length;
  const dx: number[] = [];
  const dy: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1].x - pts[i].x);
    dy.push(pts[i + 1].y - pts[i].y);
    m.push(dy[i] / (dx[i] || 1));
  }
  const t: number[] = new Array(n).fill(0);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0;
    else t[i] = (m[i - 1] + m[i]) / 2;
  }
  let d = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const x1 = pts[i].x + dx[i] / 3;
    const y1 = pts[i].y + (t[i] * dx[i]) / 3;
    const x2 = pts[i + 1].x - dx[i] / 3;
    const y2 = pts[i + 1].y - (t[i + 1] * dx[i]) / 3;
    d += ` C ${x1.toFixed(1)},${y1.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)} ${pts[i + 1].x.toFixed(1)},${pts[i + 1].y.toFixed(1)}`;
  }
  return d;
}
