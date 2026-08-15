import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Map raw skin-conductance (µS) to a 0–100 "nervousness" scale for display.
 *
 * The hand-rest sensor stores the raw µS value — that's what the AI analyzer reasons
 * over and what shows up in exported reports. This helper is a UX-only view
 * transform, not a change to the underlying data.
 *
 * Anchor points (typical PPG-adjacent GSR):
 *   ≤ 2 µS  → 0 %   (dry skin, calm)
 *   ≥ 20 µS → 100 % (sustained arousal / sweating)
 * Clamped linearly between. Rough — refine anchors after pilot testing.
 */
export function gsrToNervousness(gsrMicrosiemens: number | null | undefined): number | null {
  if (gsrMicrosiemens == null || !Number.isFinite(gsrMicrosiemens)) return null;
  const pct = ((gsrMicrosiemens - 2) / (20 - 2)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}
