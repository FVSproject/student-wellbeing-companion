'use client';

import { useEffect } from 'react';

/**
 * Pings /api/health every 90 seconds while any authed page is open.
 * Keeps the Neon serverless compute warm, so counselors don't hit a
 * 2–5 second cold-start on their next click after an idle stretch.
 *
 * Cheap: /api/health is a tiny JSON response, and 90s is well under
 * Neon's default 5-minute suspend timer.
 */
export function KeepWarm({ intervalMs = 90_000 }: { intervalMs?: number }) {
  useEffect(() => {
    const ping = () => {
      fetch('/api/health', { cache: 'no-store' }).catch(() => {
        // Silent — the next tick will retry.
      });
    };
    ping();
    const t = setInterval(ping, intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);

  return null;
}
