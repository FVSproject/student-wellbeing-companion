'use client';

import { useMemo } from 'react';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';

/**
 * A premium live-vitals tile: current value + trend arrow + smoothed
 * mini-chart with gradient fill, subtle grid, and a pulsing tip dot.
 *
 * The chart uses a monotone cubic curve (Fritsch–Carlson) so the line
 * looks continuous even when samples arrive once per second. Optional
 * "normal range" band shades the physiological reference window.
 */
export function LiveVitalsCard({
  label,
  values,
  min,
  max,
  unit,
  decimals = 0,
  colorClass,
  normalRange,
  height = 88,
  waitingLabel = 'Waiting for samples…',
}: {
  label: string;
  values: Array<number | null>;
  min: number;
  max: number;
  unit?: string;
  decimals?: number;
  /**
   * Tailwind text-color class that sets `currentColor` for the chart.
   * Example: 'text-rose-500' for HR, 'text-sky-500' for nervousness.
   */
  colorClass: string;
  /** Physiological reference band [low, high]. Shaded lightly on the chart. */
  normalRange?: [number, number];
  height?: number;
  waitingLabel?: string;
}) {
  const clean = useMemo(
    () => values.filter((v): v is number => v != null && Number.isFinite(v)),
    [values]
  );

  const latest = clean.length > 0 ? clean[clean.length - 1] : null;

  const trend = useMemo<'up' | 'down' | 'flat' | null>(() => {
    if (clean.length < 4) return null;
    const recent = clean.slice(-4);
    const first = recent[0];
    const last = recent[recent.length - 1];
    const delta = last - first;
    const threshold = Math.max(0.5, Math.abs(first) * 0.02);
    if (Math.abs(delta) < threshold) return 'flat';
    return delta > 0 ? 'up' : 'down';
  }, [clean]);

  return (
    <div
      className={`relative overflow-hidden rounded-xl border border-border bg-gradient-to-b from-white to-muted/10 p-3 shadow-sm ${colorClass}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {label}
        </span>
        <TrendIndicator trend={trend} />
      </div>

      <div className="mt-1 flex items-baseline gap-1">
        <span className="font-mono text-3xl font-semibold leading-none tracking-tight text-foreground tabular-nums">
          {latest == null ? '—' : latest.toFixed(decimals)}
        </span>
        {latest != null && unit && (
          <span className="text-xs text-muted-foreground">{unit}</span>
        )}
      </div>

      <div className="mt-2">
        <SparkChart
          values={clean}
          min={min}
          max={max}
          height={height}
          colorClass={colorClass}
          normalRange={normalRange}
          waitingLabel={waitingLabel}
        />
      </div>
    </div>
  );
}

function TrendIndicator({ trend }: { trend: 'up' | 'down' | 'flat' | null }) {
  if (!trend) return null;
  const Icon = trend === 'up' ? ArrowUp : trend === 'down' ? ArrowDown : Minus;
  const tone =
    trend === 'up'
      ? 'bg-amber-100 text-amber-700 ring-amber-200'
      : trend === 'down'
        ? 'bg-emerald-100 text-emerald-700 ring-emerald-200'
        : 'bg-neutral-100 text-neutral-600 ring-neutral-200';
  return (
    <span
      className={`flex h-4 w-4 items-center justify-center rounded-full ring-1 ${tone}`}
    >
      <Icon className="h-2.5 w-2.5" />
    </span>
  );
}

/**
 * The chart itself. currentColor is inherited from the parent card's
 * Tailwind color class so the gradient + line + dot all recolor together.
 */
function SparkChart({
  values,
  min,
  max,
  height,
  colorClass,
  normalRange,
  waitingLabel,
}: {
  values: number[];
  min: number;
  max: number;
  height: number;
  colorClass: string;
  normalRange?: [number, number];
  waitingLabel: string;
}) {
  const width = 260;

  // Every hook MUST run on every render — early-return-with-hooks-after is a
  // Rules-of-Hooks violation. Compute the gradient id unconditionally first.
  const gradientId = useUniqueId('spark-grad');

  if (values.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-[11px] italic text-muted-foreground"
        style={{ height }}
      >
        {waitingLabel}
      </div>
    );
  }

  // Single-sample fallback: show a horizontal line at the current value so
  // the counselor sees SOMETHING immediately after the first BLE bundle
  // arrives, rather than a "waiting" placeholder that they'd read as broken.
  if (values.length === 1) {
    const y = height - ((clamp(values[0], min, max) - min) / (max - min || 1)) * height;
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="none"
        className={`h-auto w-full ${colorClass}`}
        style={{ height }}
      >
        <line
          x1={0}
          y1={y}
          x2={width}
          y2={y}
          stroke="currentColor"
          strokeWidth="1.8"
          strokeDasharray="4 4"
          strokeOpacity="0.6"
        />
        <circle cx={width - 4} cy={y} r="3.5" fill="currentColor" />
        <circle cx={width - 4} cy={y} r="1.5" fill="white" />
      </svg>
    );
  }

  const range = max - min || 1;
  const step = width / (values.length - 1);
  const points = values.map((v, i) => ({
    x: i * step,
    y: height - ((clamp(v, min, max) - min) / range) * height,
  }));

  const linePath = monotonePath(points);
  const areaPath = `${linePath} L ${(width).toFixed(1)},${height} L 0,${height} Z`;

  const last = points[points.length - 1];

  const normalBand =
    normalRange && normalRange.length === 2
      ? {
          y1: height - ((clamp(normalRange[1], min, max) - min) / range) * height,
          y2: height - ((clamp(normalRange[0], min, max) - min) / range) * height,
        }
      : null;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`h-auto w-full ${colorClass}`}
      style={{ height }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.35" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Normal-range band (physiological reference) */}
      {normalBand && (
        <rect
          x={0}
          y={normalBand.y1}
          width={width}
          height={Math.max(1, normalBand.y2 - normalBand.y1)}
          fill="currentColor"
          fillOpacity="0.06"
        />
      )}

      {/* Subtle top/mid/bottom grid lines */}
      <line x1={0} y1={0.5} x2={width} y2={0.5} stroke="currentColor" strokeOpacity="0.08" />
      <line
        x1={0}
        y1={height / 2}
        x2={width}
        y2={height / 2}
        stroke="currentColor"
        strokeOpacity="0.06"
        strokeDasharray="2 3"
      />
      <line
        x1={0}
        y1={height - 0.5}
        x2={width}
        y2={height - 0.5}
        stroke="currentColor"
        strokeOpacity="0.12"
      />

      {/* Gradient area under the curve */}
      <path d={areaPath} fill={`url(#${gradientId})`} />

      {/* The line itself */}
      <path
        d={linePath}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ transition: 'd 300ms ease-out' }}
      />

      {/* Pulsing tip dot */}
      <g>
        <circle cx={last.x} cy={last.y} r="6" fill="currentColor" fillOpacity="0.18">
          <animate attributeName="r" values="4;8;4" dur="1.6s" repeatCount="indefinite" />
          <animate
            attributeName="fill-opacity"
            values="0.25;0.05;0.25"
            dur="1.6s"
            repeatCount="indefinite"
          />
        </circle>
        <circle cx={last.x} cy={last.y} r="3" fill="currentColor" />
        <circle cx={last.x} cy={last.y} r="1.4" fill="white" />
      </g>
    </svg>
  );
}

// ---------- helpers ----------

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Fritsch–Carlson monotone cubic interpolation. Produces a smooth curve
 * that doesn't overshoot at peaks — critical for physiological signals
 * where fake overshoot could look like anomalous readings.
 */
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
    if (m[i - 1] * m[i] <= 0) {
      t[i] = 0;
    } else {
      t[i] = (m[i - 1] + m[i]) / 2;
    }
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

// Simple hook that gives every SparkChart a unique id for its gradient def
// even when many render on the same page.
let _idCounter = 0;
function useUniqueId(prefix: string): string {
  return useMemo(() => `${prefix}-${++_idCounter}`, [prefix]);
}
