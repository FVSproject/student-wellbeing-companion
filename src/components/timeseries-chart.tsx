import { cn } from '@/lib/utils';

type Point = { t: Date | string; v: number | null };

/**
 * SVG time-series chart with labeled axes. Container-width responsive
 * via viewBox. Deliberately dependency-free — no recharts, no d3.
 */
export function TimeSeriesChart({
  points,
  min,
  max,
  height = 180,
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

  const width = 640;
  const padL = 40;
  const padR = 16;
  const padT = 12;
  const padB = 24;

  if (clean.length < 2) {
    return (
      <ChartFrame label={label} unit={unit} className={className}>
        <div
          className="flex items-center justify-center text-xs text-muted-foreground"
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

  const polyline = clean.map((p) => `${xOf(p.t).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(' ');
  const areaPath = `M ${xOf(clean[0].t).toFixed(1)},${(padT + chartH).toFixed(1)} L ${polyline} L ${xOf(clean[clean.length - 1].t).toFixed(1)},${(padT + chartH).toFixed(1)} Z`;

  const latest = clean[clean.length - 1].v;
  const midY = padT + chartH / 2;

  return (
    <ChartFrame label={label} unit={unit} latest={latest} className={className}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className="h-auto w-full"
      >
        {/* Y grid lines */}
        <line x1={padL} y1={padT} x2={width - padR} y2={padT} stroke="currentColor" strokeOpacity="0.08" />
        <line x1={padL} y1={midY} x2={width - padR} y2={midY} stroke="currentColor" strokeOpacity="0.08" strokeDasharray="2 3" />
        <line x1={padL} y1={padT + chartH} x2={width - padR} y2={padT + chartH} stroke="currentColor" strokeOpacity="0.15" />
        {/* Y-axis labels */}
        <text x={padL - 6} y={padT + 4} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.5">
          {max}
        </text>
        <text x={padL - 6} y={midY + 3} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.5">
          {((min + max) / 2).toFixed(0)}
        </text>
        <text x={padL - 6} y={padT + chartH + 4} textAnchor="end" fontSize="9" fill="currentColor" opacity="0.5">
          {min}
        </text>
        {/* Filled area (soft) */}
        <path d={areaPath} fill={color} opacity="0.08" />
        {/* Line */}
        <polyline
          points={polyline}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="mt-1 flex justify-between px-[40px] text-[10px] text-muted-foreground">
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
    <div className={cn('rounded-xl border border-border bg-white p-4', className)}>
      {(label || latest != null) && (
        <div className="mb-2 flex items-baseline justify-between">
          {label && <span className="text-xs font-medium text-muted-foreground">{label}</span>}
          {latest != null && (
            <span className="font-mono text-sm">
              {latest.toFixed(latest < 10 ? 1 : 0)}
              {unit && <span className="ml-0.5 text-[10px] text-muted-foreground">{unit}</span>}
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
