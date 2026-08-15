import { cache } from 'react';
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { UserRole, type User, type School, type Foundation } from '@prisma/client';
import { db } from './db';
import { tenantDb, type TenantDb } from './tenant';
import { ensureUserProvisioned } from './provision';

/**
 * Retry a DB call with exponential backoff. Neon free-tier compute suspends
 * after ~5 min idle; the first query cold-starts and can take 3-8 s. We give
 * it up to three chances at 1 s / 3 s / 6 s so a very cold compute still
 * lands. Total worst case ~10 s — much better than a hard failure.
 */
async function withNeonRetry<T>(fn: () => Promise<T>): Promise<T> {
  const waits = [1000, 3000, 6000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= waits.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isColdStart =
        msg.includes("Can't reach database server") ||
        msg.includes('P1001') ||
        msg.includes('ETIMEDOUT') ||
        msg.includes('ECONNREFUSED');
      if (!isColdStart || attempt === waits.length) break;
      await new Promise((r) => setTimeout(r, waits[attempt]));
    }
  }
  throw lastErr;
}

export class AuthError extends Error {
  constructor(message: string, public status: number = 401) {
    super(message);
    this.name = 'AuthError';
  }
}

/**
 * Returns { userId, orgId } from Clerk. Throws if not signed in.
 * Use this in server components and API routes.
 */
export async function requireAuth() {
  const { userId, orgId } = await auth();
  if (!userId) throw new AuthError('Not signed in', 401);
  return { userId, orgId: orgId ?? null };
}

/**
 * Loads the current signed-in User row from the database.
 * Throws if the Clerk user has no matching database row — that state
 * indicates a failed provisioning step (webhook or onboarding).
 */
/**
 * Wrapped in React `cache()` so multiple callers within the same request
 * (layout + page + server action) share a single DB read instead of each
 * doing their own findUnique. Cuts 2-3 duplicate queries per page load.
 */
export const getCurrentUser = cache(async function getCurrentUser(): Promise<
  User & { school: School | null; foundation: Foundation | null }
> {
  const { userId } = await requireAuth();

  let user = await withNeonRetry(() =>
    db.user.findUnique({
      where: { clerkUserId: userId },
      include: { school: true, foundation: true },
    })
  );

  // Self-heal: first sign-in provisions the DB row on-demand. After that
  // this branch never runs, and the `cache()` above makes even repeated
  // calls within the same request free.
  if (!user) {
    await ensureUserProvisioned();
    user = await withNeonRetry(() =>
      db.user.findUnique({
        where: { clerkUserId: userId },
        include: { school: true, foundation: true },
      })
    );
  }

  if (!user) {
    throw new AuthError('User not provisioned in database', 403);
  }
  return user;
});

/**
 * Returns the schoolId the current user is scoped to. Throws for
 * users with no school context (e.g. foundation admins) — those
 * flows should use getCurrentUser() directly and pick an explicit
 * school before reading tenant data.
 */
export async function requireSchoolId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user.schoolId) {
    throw new AuthError('No school context for this user', 403);
  }
  return user.schoolId;
}

/**
 * Bundle: current user, their schoolId, and a tenant-scoped Prisma
 * client. This is the standard entry point for counselor-facing
 * server components and route handlers.
 */
export const getSchoolContext = cache(async function getSchoolContext(): Promise<{
  user: Awaited<ReturnType<typeof getCurrentUser>>;
  schoolId: string;
  db: TenantDb;
}> {
  const user = await getCurrentUser();
  if (!user.schoolId) {
    throw new AuthError('No school context for this user', 403);
  }
  return {
    user,
    schoolId: user.schoolId,
    db: tenantDb(user.schoolId),
  };
});

export async function requireRole(...roles: UserRole[]) {
  const user = await getCurrentUser();
  if (!roles.includes(user.role)) {
    throw new AuthError(
      `Requires role: ${roles.join(', ')} (have ${user.role})`,
      403
    );
  }
  return user;
}

export async function requireFoundationAdmin() {
  return requireRole(UserRole.FOUNDATION_ADMIN);
}

export async function requireCounselorOrSchoolAdmin() {
  return requireRole(UserRole.COUNSELOR, UserRole.SCHOOL_ADMIN);
}

/**
 * Page-side helper. Foundation admins have no school context, so if one
 * navigates to a counselor route we bounce them to /admin cleanly rather
 * than throwing an AuthError. Never call this from an API route — use
 * getSchoolContext() there so a bad request surfaces as a real 403 instead
 * of a 307 that the browser fetch would silently follow into HTML.
 */
export async function getCounselorContext(locale: string) {
  const user = await getCurrentUser();
  if (user.role === UserRole.FOUNDATION_ADMIN) {
    redirect(`/${locale}/admin`);
  }
  return getSchoolContext();
}

/** Redirect-only guard for counselor pages that don't need tenant data. */
export async function guardCounselorPage(locale: string) {
  const user = await getCurrentUser();
  if (user.role === UserRole.FOUNDATION_ADMIN) {
    redirect(`/${locale}/admin`);
  }
  return user;
}
