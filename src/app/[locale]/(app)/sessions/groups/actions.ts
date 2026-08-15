'use server';

import { z } from 'zod';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { after } from 'next/server';
import { getLocale } from 'next-intl/server';
import { SessionStatus } from '@prisma/client';
import { getSchoolContext } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { generateGroupSummary } from '@/lib/summaries';

const nonEmpty = (v: unknown) => (typeof v === 'string' ? v.trim() : v);

const toArray = (v: unknown) =>
  Array.isArray(v) ? v : typeof v === 'string' && v ? [v] : [];

const createSchema = z
  .object({
    title: z.preprocess(nonEmpty, z.string().min(1).max(200)),
    topic: z.preprocess(nonEmpty, z.string().max(1000).optional().or(z.literal(''))),
    studentIds: z.preprocess(
      toArray,
      z.array(z.string().min(1)).max(20).default([])
    ),
    extraNames: z.preprocess(
      toArray,
      z
        .array(z.string().transform((s) => s.trim()).pipe(z.string().min(1).max(200)))
        .max(20)
        .default([])
    ),
  })
  // Between existing picks and ad-hoc names, need 2+ participants total.
  .refine((v) => v.studentIds.length + v.extraNames.length >= 2, {
    path: ['studentIds'],
    message: 'A group session needs at least 2 participants.',
  });

export async function createGroupSession(formData: FormData) {
  const { db, user, schoolId } = await getSchoolContext();

  // FormData with a repeated `studentIds` field arrives as multiple entries.
  const raw = {
    title: formData.get('title'),
    topic: formData.get('topic'),
    studentIds: formData.getAll('studentIds'),
    extraNames: formData.getAll('extraNames'),
  };
  const parsed = createSchema.parse(raw);

  // Guard: every picked existing student must belong to this school.
  const existing = await db.student.findMany({
    where: { id: { in: parsed.studentIds }, deletedAt: null },
    select: { id: true },
  });
  if (existing.length !== parsed.studentIds.length) {
    throw new Error('One or more students not found in this school');
  }

  // Ad-hoc participants — create Student rows on the fly so they get a real
  // ID and can flow into per-student analytics later. Auto-generate a unique
  // externalId prefixed AUTO- since the counselor didn't supply one.
  const createdIds: string[] = [];
  for (const fullName of parsed.extraNames) {
    const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
    const newStudent = await db.student.create({
      data: {
        schoolId,
        externalId: `AUTO-${Date.now().toString(36).toUpperCase()}-${suffix}`,
        fullName,
      },
    });
    createdIds.push(newStudent.id);
    recordAudit({
      actorUserId: user.id,
      actorClerkUserId: user.clerkUserId,
      schoolId,
      action: 'student.create',
      targetType: 'student',
      targetId: newStudent.id,
      metadata: { source: 'groupSession.adhoc' },
    });
  }

  const allMemberIds = [...parsed.studentIds, ...createdIds];

  const group = await db.groupSession.create({
    data: {
      schoolId,
      counselorId: user.id,
      title: parsed.title,
      topic: parsed.topic || null,
      status: SessionStatus.ACTIVE,
      startedAt: new Date(),
      members: {
        create: allMemberIds.map((studentId) => ({ studentId })),
      },
    },
  });

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'groupSession.create',
    targetType: 'groupSession',
    targetId: group.id,
    metadata: {
      studentCount: allMemberIds.length,
      existingPicks: parsed.studentIds.length,
      adhocCreated: createdIds.length,
    },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/sessions/groups`);
  redirect(`/${locale}/sessions/groups/${group.id}`);
}

const endSchema = z.object({
  groupId: z.string().min(1),
  notes: z.preprocess(nonEmpty, z.string().max(4000).optional().or(z.literal(''))),
});

export async function endGroupSession(formData: FormData) {
  const { db, user, schoolId } = await getSchoolContext();
  const { groupId, notes } = endSchema.parse(Object.fromEntries(formData));

  const group = await db.groupSession.findFirst({ where: { id: groupId, schoolId } });
  if (!group) throw new Error('Group session not found');
  if (group.counselorId !== user.id) throw new Error('Not your session');

  await db.groupSession.update({
    where: { id: groupId },
    data: {
      status: SessionStatus.COMPLETED,
      endedAt: new Date(),
      notes: notes || null,
    },
  });

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'groupSession.end',
    targetType: 'groupSession',
    targetId: groupId,
  });

  const locale = await getLocale();
  after(async () => {
    await generateGroupSummary(groupId, locale === 'ar' ? 'ar' : 'en');
  });

  revalidatePath(`/${locale}/sessions/groups`);
  revalidatePath(`/${locale}/sessions/groups/${groupId}`);
  redirect(`/${locale}/sessions/groups/${groupId}`);
}

const summarizeSchema = z.object({ groupId: z.string().min(1) });

export async function regenerateGroupSummary(formData: FormData) {
  const { db, user, schoolId } = await getSchoolContext();
  const { groupId } = summarizeSchema.parse(Object.fromEntries(formData));

  const group = await db.groupSession.findFirst({ where: { id: groupId, schoolId } });
  if (!group) throw new Error('Group session not found');

  const locale = await getLocale();
  await generateGroupSummary(groupId, locale === 'ar' ? 'ar' : 'en', true);

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'groupSession.summary.regenerate',
    targetType: 'groupSession',
    targetId: groupId,
  });

  revalidatePath(`/${locale}/sessions/groups/${groupId}`);
  redirect(`/${locale}/sessions/groups/${groupId}`);
}

const deleteSchema = z.object({ groupId: z.string().min(1) });

export async function deleteGroupSession(formData: FormData) {
  const { db, user, schoolId } = await getSchoolContext();
  const { groupId } = deleteSchema.parse(Object.fromEntries(formData));

  const group = await db.groupSession.findFirst({ where: { id: groupId, schoolId } });
  if (!group) throw new Error('Group session not found');

  await db.groupSession.update({
    where: { id: groupId },
    data: { deletedAt: new Date() },
  });

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'groupSession.delete',
    targetType: 'groupSession',
    targetId: groupId,
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/sessions/groups`);
  redirect(`/${locale}/sessions/groups`);
}
