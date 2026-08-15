'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { getSchoolContext } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { generateStudentGrowth } from '@/lib/summaries';

const schema = z.object({ studentId: z.string().min(1) });

export async function regenerateStudentGrowth(formData: FormData) {
  const { db, user, schoolId } = await getSchoolContext();
  const { studentId } = schema.parse(Object.fromEntries(formData));

  const student = await db.student.findFirst({ where: { id: studentId } });
  if (!student) throw new Error('Student not found');

  const locale = await getLocale();
  await generateStudentGrowth(studentId, locale === 'ar' ? 'ar' : 'en', true);

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'student.growth.regenerate',
    targetType: 'student',
    targetId: studentId,
  });

  revalidatePath(`/${locale}/students/${studentId}/report`);
  redirect(`/${locale}/students/${studentId}/report`);
}
