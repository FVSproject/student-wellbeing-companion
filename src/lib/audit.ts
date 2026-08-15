import { after } from 'next/server';
import { headers } from 'next/headers';
import { db } from './db';

type AuditEntry = {
  actorUserId?: string | null;
  actorClerkUserId?: string | null;
  schoolId?: string | null;
  action: string;
  targetType: string;
  targetId?: string | null;
  metadata?: Record<string, unknown> | null;
};

/**
 * Fire-and-forget audit log write. Runs after the response is sent via
 * `after()` so it never blocks the request. Failures are swallowed with a
 * warning — the audit log is important but must not break user flows.
 *
 * The `who / when / what` tuple satisfies the compliance requirement in
 * PLATFORM_ARCHITECTURE.md §6: "Audit log on every read of session /
 * biometric data".
 */
export function recordAudit(entry: AuditEntry): void {
  after(async () => {
    try {
      const h = await headers();
      const ipAddress =
        h.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        h.get('x-real-ip') ??
        null;
      const userAgent = h.get('user-agent') ?? null;

      await db.auditLogEntry.create({
        data: {
          actorUserId: entry.actorUserId ?? null,
          actorClerkUserId: entry.actorClerkUserId ?? null,
          schoolId: entry.schoolId ?? null,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId ?? null,
          metadata: (entry.metadata ?? undefined) as never,
          ipAddress,
          userAgent,
        },
      });
    } catch (err) {
      console.warn('[audit] write failed:', err);
    }
  });
}
