import { UserRole } from '@prisma/client';

const FOUNDATION_ID = 'seed-foundation';

/**
 * Parses `ADMIN_EMAILS` env var into a lowercased Set for fast membership checks.
 * Comma-separated; whitespace tolerated.
 */
export function adminEmailSet(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? '';
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email: string): boolean {
  return adminEmailSet().has(email.toLowerCase());
}

/** Role + foundation binding the user should have based on their email. */
export function desiredRoleFor(email: string): {
  role: UserRole;
  foundationId: string | null;
  schoolId: 'preserve' | null;
} {
  if (isAdminEmail(email)) {
    return { role: UserRole.FOUNDATION_ADMIN, foundationId: FOUNDATION_ID, schoolId: null };
  }
  return { role: UserRole.COUNSELOR, foundationId: null, schoolId: 'preserve' };
}
