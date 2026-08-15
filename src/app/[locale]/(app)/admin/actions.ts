'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { UserRole } from '@prisma/client';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

const nonEmpty = (v: unknown) => (typeof v === 'string' ? v.trim() : v);

const updateSchoolSchema = z.object({
  schoolId: z.string().min(1),
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

export async function updateSchool(formData: FormData) {
  const actor = await getCurrentUser();
  if (actor.role !== UserRole.FOUNDATION_ADMIN) {
    throw new Error('Only Foundation admins can rename schools');
  }

  const parsed = updateSchoolSchema.parse(Object.fromEntries(formData));

  await db.school.update({
    where: { id: parsed.schoolId },
    data: {
      name: parsed.name,
      city: parsed.city || null,
      iconEmoji: parsed.logoUrl ? null : parsed.iconEmoji || null,
      logoUrl: parsed.logoUrl || null,
    },
  });

  recordAudit({
    actorUserId: actor.id,
    actorClerkUserId: actor.clerkUserId,
    schoolId: parsed.schoolId,
    action: 'school.update',
    targetType: 'school',
    targetId: parsed.schoolId,
    metadata: { name: parsed.name },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/admin`);
  redirect(`/${locale}/admin`);
}
