'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { getLocale } from 'next-intl/server';
import { ConsentStatus, SessionStatus } from '@prisma/client';
import { getSchoolContext } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { generateSessionSummary, generateStudentGrowth } from '@/lib/summaries';

const startSchema = z.object({ studentId: z.string().min(1) });

export async function startSession(formData: FormData) {
  const { db, user, schoolId } = await getSchoolContext();
  const { studentId } = startSchema.parse(Object.fromEntries(formData));

  const student = await db.student.findFirst({
    where: { id: studentId, deletedAt: null },
    include: { consent: true },
  });
  if (!student) throw new Error('Student not found');
  if (student.consent?.status !== ConsentStatus.GRANTED) {
    throw new Error('Cannot start a session without granted consent');
  }

  const session = await db.session.create({
    data: {
      schoolId,
      studentId,
      counselorId: user.id,
      status: SessionStatus.ACTIVE,
      startedAt: new Date(),
    },
  });

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'session.start',
    targetType: 'session',
    targetId: session.id,
    metadata: { studentId },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/sessions`);
  redirect(`/${locale}/sessions/${session.id}/live`);
}

const endSchema = z.object({ sessionId: z.string().min(1) });

export async function endSession(formData: FormData) {
  const { db, user, schoolId } = await getSchoolContext();
  const { sessionId } = endSchema.parse(Object.fromEntries(formData));

  const session = await db.session.findFirst({ where: { id: sessionId } });
  if (!session) throw new Error('Session not found');
  if (session.counselorId !== user.id) throw new Error('Not your session');
  if (session.status !== SessionStatus.ACTIVE) throw new Error('Session not active');

  await db.session.update({
    where: { id: sessionId },
    data: { status: SessionStatus.COMPLETED, endedAt: new Date() },
  });

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'session.end',
    targetType: 'session',
    targetId: sessionId,
  });

  const locale = await getLocale();

  // Fire-and-forget: Claude generates the whole-session summary and, since
  // this session's data now shifts the student's longitudinal picture,
  // regenerate the growth summary too. Both run after the response so the
  // "End session" click stays snappy.
  after(async () => {
    await generateSessionSummary(sessionId, locale === 'ar' ? 'ar' : 'en');
    await generateStudentGrowth(session.studentId, locale === 'ar' ? 'ar' : 'en', true);
  });

  revalidatePath(`/${locale}/sessions`);
  revalidatePath(`/${locale}/sessions/${sessionId}`);
  redirect(`/${locale}/sessions/${sessionId}`);
}

const regenerateSessionSummarySchema = z.object({ sessionId: z.string().min(1) });

export async function regenerateSessionSummary(formData: FormData) {
  const { db, user, schoolId } = await getSchoolContext();
  const { sessionId } = regenerateSessionSummarySchema.parse(Object.fromEntries(formData));

  const session = await db.session.findFirst({ where: { id: sessionId } });
  if (!session) throw new Error('Session not found');

  const locale = await getLocale();
  await generateSessionSummary(sessionId, locale === 'ar' ? 'ar' : 'en', true);

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'session.summary.regenerate',
    targetType: 'session',
    targetId: sessionId,
  });

  revalidatePath(`/${locale}/sessions/${sessionId}`);
  redirect(`/${locale}/sessions/${sessionId}`);
}

const deleteSessionSchema = z.object({ sessionId: z.string().min(1) });

export async function deleteSession(formData: FormData) {
  const { db, user, schoolId } = await getSchoolContext();
  const { sessionId } = deleteSessionSchema.parse(Object.fromEntries(formData));

  const session = await db.session.findFirst({ where: { id: sessionId } });
  if (!session) throw new Error('Session not found');

  // Soft delete — samples/transcript/analyses stay in DB for audit; the row
  // is hidden from the counselor's list views.
  await db.session.update({
    where: { id: sessionId },
    data: { deletedAt: new Date() },
  });

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'session.delete',
    targetType: 'session',
    targetId: sessionId,
    metadata: { studentId: session.studentId },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/sessions`);
  redirect(`/${locale}/sessions`);
}
