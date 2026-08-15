'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { UserRole } from '@prisma/client';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

const FOUNDATION_ID = 'seed-foundation';

const nonEmpty = (v: unknown) => (typeof v === 'string' ? v.trim() : v);

const joinSchema = z.object({ schoolId: z.string().min(1) });

export async function joinSchool(formData: FormData) {
  const user = await getCurrentUser();
  if (user.role !== UserRole.COUNSELOR) throw new Error('Only counselors can join a school');

  const { schoolId } = joinSchema.parse(Object.fromEntries(formData));

  const school = await db.school.findUnique({ where: { id: schoolId, deletedAt: null } });
  if (!school) throw new Error('School not found');

  await db.user.update({
    where: { id: user.id },
    data: { schoolId: school.id, foundationId: null },
  });

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId: school.id,
    action: 'user.joinSchool',
    targetType: 'school',
    targetId: school.id,
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}`, 'layout');
  redirect(`/${locale}/dashboard`);
}

const createSchema = z.object({
  name: z.preprocess(nonEmpty, z.string().min(1).max(200)),
  city: z.preprocess(nonEmpty, z.string().max(100).optional().or(z.literal(''))),
  iconEmoji: z.preprocess(nonEmpty, z.string().max(8).optional().or(z.literal(''))),
  logoUrl: z.preprocess(
    nonEmpty,
    z
      .string()
      .max(500_000)
      .refine(
        (v) => v === '' || v.startsWith('data:image/') || /^https?:\/\//i.test(v),
        'Must be an image upload or http(s) URL'
      )
      .optional()
      .or(z.literal(''))
  ),
});

export async function createSchool(formData: FormData) {
  const user = await getCurrentUser();
  if (user.role !== UserRole.COUNSELOR) throw new Error('Only counselors can create a school');

  const parsed = createSchema.parse(Object.fromEntries(formData));

  // Every school hangs under the single Foundation for now. When we support
  // multiple foundations, drive this off the user's invitation context.
  const foundation = await db.foundation.upsert({
    where: { id: FOUNDATION_ID },
    create: { id: FOUNDATION_ID, name: 'Foundation' },
    update: {},
  });

  // If a logo was uploaded we prefer it; the picker clears one when the
  // other is set, so both should never arrive filled together — but the DB
  // stores them independently so display code can pick.
  const school = await db.school.create({
    data: {
      foundationId: foundation.id,
      name: parsed.name,
      city: parsed.city || null,
      iconEmoji: parsed.logoUrl ? null : parsed.iconEmoji || null,
      logoUrl: parsed.logoUrl || null,
    },
  });

  await db.user.update({
    where: { id: user.id },
    data: { schoolId: school.id, foundationId: null },
  });

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId: school.id,
    action: 'school.create',
    targetType: 'school',
    targetId: school.id,
    metadata: { name: school.name },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}`, 'layout');
  redirect(`/${locale}/dashboard`);
}
