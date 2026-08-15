import { auth, currentUser } from '@clerk/nextjs/server';
import { Prisma, UserRole } from '@prisma/client';
import { db } from './db';
import { desiredRoleFor, isAdminEmail } from './admin';

const FOUNDATION_ID = 'seed-foundation';

/**
 * Just-in-time provisioning of the Clerk user into our DB.
 *
 * Prod path: Clerk fires `user.created` / `organization.created` webhooks.
 * Dev path (used here): first authenticated request creates a `User` row
 * on the fly. If the Clerk user has an `orgId` matching a `School.clerkOrgId`
 * we link them there; otherwise (dev only) we drop them onto the seed school.
 *
 * Safe to call on every dashboard render — idempotent, no-op after first hit.
 */
export async function ensureUserProvisioned() {
  const { userId, orgId } = await auth();
  if (!userId) return null;

  const existing = await db.user.findUnique({ where: { clerkUserId: userId } });
  if (existing) {
    // Keep the role in sync with ADMIN_EMAILS on every request. This is what
    // lets you flip a user to Foundation admin by editing an env var and
    // hitting refresh — no manual DB tweak, no re-sign-in.
    const shouldBeAdmin = isAdminEmail(existing.email);
    const currentlyAdmin = existing.role === UserRole.FOUNDATION_ADMIN;
    if (shouldBeAdmin && !currentlyAdmin) {
      return db.user.update({
        where: { id: existing.id },
        data: {
          role: UserRole.FOUNDATION_ADMIN,
          foundationId: FOUNDATION_ID,
          schoolId: null,
        },
      });
    }
    if (!shouldBeAdmin && currentlyAdmin) {
      return db.user.update({
        where: { id: existing.id },
        data: {
          role: UserRole.COUNSELOR,
          foundationId: null,
          // schoolId stays null — the layout will send them through onboarding.
          schoolId: null,
        },
      });
    }
    return existing;
  }

  const clerk = await currentUser();
  if (!clerk) return null;

  const email =
    clerk.emailAddresses.find((e) => e.id === clerk.primaryEmailAddressId)?.emailAddress ??
    clerk.emailAddresses[0]?.emailAddress ??
    `${userId}@unknown.local`;

  const fullName =
    [clerk.firstName, clerk.lastName].filter(Boolean).join(' ') ||
    clerk.username ||
    'Counselor';

  const desired = desiredRoleFor(email);

  // For new counselors we no longer auto-assign a school. If the Clerk user
  // is in an org whose id matches a school, we link them; otherwise they
  // land on the onboarding page to join or create a school themselves.
  let schoolId: string | null = null;
  if (desired.schoolId === 'preserve' && orgId) {
    const school = await db.school.findUnique({ where: { clerkOrgId: orgId } });
    if (school) schoolId = school.id;
  }

  try {
    return await db.user.create({
      data: {
        clerkUserId: userId,
        email,
        fullName,
        role: desired.role,
        schoolId,
        foundationId: desired.foundationId,
        lastActiveAt: new Date(),
      },
    });
  } catch (err) {
    // Concurrent-provisioning race: another request created the row first.
    // Treat as success and return the existing user.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return db.user.findUnique({ where: { clerkUserId: userId } });
    }
    throw err;
  }
}
