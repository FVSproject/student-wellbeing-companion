import { db } from './db';

// Tenant-scoped models. Every read/write on these MUST carry a schoolId.
// Foundation, School, User, and AuditLogEntry are intentionally excluded —
// they either ARE the tenant, span tenants, or need bespoke access rules.
const TENANT_MODELS = new Set([
  'Student',
  'ConsentRecord',
  'Device',
  'Session',
  'SessionSample',
  'TranscriptSegment',
  'AIAnalysis',
]);

/**
 * Returns a Prisma client whose queries on tenant-scoped models are
 * automatically filtered/injected with `schoolId`. This is the ONLY
 * client that should touch student/session/biometric data — using
 * the raw `db` for these models is a data-leak risk between schools.
 *
 * findUnique is deliberately blocked on tenant models: it takes a
 * primary key which can't be safely narrowed by schoolId. Use
 * findFirst with { where: { id, /* schoolId injected * / } }.
 */
export function tenantDb(schoolId: string) {
  if (!schoolId) {
    throw new Error('[tenant] schoolId is required');
  }

  return db.$extends({
    name: `tenant:${schoolId}`,
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!TENANT_MODELS.has(model)) {
            return query(args);
          }

          if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            throw new Error(
              `[tenant] ${model}.${operation} is forbidden on tenant models; use findFirst.`
            );
          }

          const a = args as { where?: Record<string, unknown>; data?: unknown; create?: unknown; update?: unknown };

          if (
            operation === 'findFirst' ||
            operation === 'findFirstOrThrow' ||
            operation === 'findMany' ||
            operation === 'count' ||
            operation === 'aggregate' ||
            operation === 'groupBy' ||
            operation === 'update' ||
            operation === 'updateMany' ||
            operation === 'delete' ||
            operation === 'deleteMany'
          ) {
            a.where = { ...(a.where ?? {}), schoolId };
          }

          if (operation === 'create') {
            a.data = { ...(a.data as object ?? {}), schoolId };
          }

          if (operation === 'createMany') {
            const d = a.data as unknown;
            a.data = Array.isArray(d)
              ? d.map((row) => ({ ...(row as object), schoolId }))
              : { ...(d as object), schoolId };
          }

          if (operation === 'upsert') {
            a.where = { ...(a.where ?? {}), schoolId };
            a.create = { ...(a.create as object ?? {}), schoolId };
          }

          return query(args);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;
