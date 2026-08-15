'use server';

import { randomBytes } from 'crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { ConsentStatus, StudentSex } from '@prisma/client';
import { getSchoolContext } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

const nonEmpty = (v: unknown) => (typeof v === 'string' ? v.trim() : v);
const emptyToUndef = (v: unknown) =>
  typeof v === 'string' && v.trim() === '' ? undefined : v;

const createStudentSchema = z.object({
  externalId: z.preprocess(nonEmpty, z.string().min(1).max(50)),
  fullName: z.preprocess(nonEmpty, z.string().min(1).max(200)),
  gradeLevel: z.preprocess(nonEmpty, z.string().max(50).optional().or(z.literal(''))),
  age: z.preprocess(emptyToUndef, z.coerce.number().int().min(3).max(25).optional()),
  sex: z.preprocess(emptyToUndef, z.nativeEnum(StudentSex).optional()),
  phone: z.preprocess(nonEmpty, z.string().max(30).optional().or(z.literal(''))),
  parentPhone: z.preprocess(nonEmpty, z.string().max(30).optional().or(z.literal(''))),
  parentEmail: z.preprocess(
    nonEmpty,
    z.string().email().max(200).optional().or(z.literal(''))
  ),
  // Accept either a fully-qualified http(s) URL or a small image data URL
  // produced by the client-side uploader (base64 JPEG, ~30–40 KB typical).
  avatarUrl: z.preprocess(
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
  notes: z.preprocess(nonEmpty, z.string().max(2000).optional().or(z.literal(''))),
});

export async function createStudent(formData: FormData) {
  const { db, user, schoolId } = await getSchoolContext();
  const parsed = createStudentSchema.parse(Object.fromEntries(formData));

  const student = await db.student.create({
    data: {
      schoolId,
      externalId: parsed.externalId,
      fullName: parsed.fullName,
      gradeLevel: parsed.gradeLevel || null,
      age: parsed.age ?? null,
      sex: parsed.sex ?? null,
      phone: parsed.phone || null,
      parentPhone: parsed.parentPhone || null,
      parentEmail: parsed.parentEmail || null,
      avatarUrl: parsed.avatarUrl || null,
      notes: parsed.notes || null,
    },
  });

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'student.create',
    targetType: 'student',
    targetId: student.id,
    metadata: { externalId: student.externalId },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/students`);
  redirect(`/${locale}/students/${student.id}`);
}

const upsertConsentSchema = z.object({
  studentId: z.string().min(1),
  status: z.nativeEnum(ConsentStatus),
  guardianName: z.preprocess(nonEmpty, z.string().min(1).max(200)),
  guardianRelation: z.preprocess(nonEmpty, z.string().min(1).max(50)),
  guardianContact: z.preprocess(nonEmpty, z.string().min(1).max(100)),
  notes: z.preprocess(nonEmpty, z.string().max(2000).optional().or(z.literal(''))),
});

export async function upsertConsent(formData: FormData) {
  const { db, user, schoolId } = await getSchoolContext();
  const parsed = upsertConsentSchema.parse(Object.fromEntries(formData));

  // Guard: student must belong to this school (findFirst is auto-scoped by schoolId).
  const student = await db.student.findFirst({ where: { id: parsed.studentId } });
  if (!student) throw new Error('Student not found in this school');

  const now = new Date();
  await db.consentRecord.upsert({
    where: { studentId: parsed.studentId },
    create: {
      schoolId,
      studentId: parsed.studentId,
      status: parsed.status,
      guardianName: parsed.guardianName,
      guardianRelation: parsed.guardianRelation,
      guardianContact: parsed.guardianContact,
      notes: parsed.notes || null,
      signedAt: parsed.status === ConsentStatus.GRANTED ? now : null,
      revokedAt: parsed.status === ConsentStatus.REVOKED ? now : null,
    },
    update: {
      status: parsed.status,
      guardianName: parsed.guardianName,
      guardianRelation: parsed.guardianRelation,
      guardianContact: parsed.guardianContact,
      notes: parsed.notes || null,
      signedAt: parsed.status === ConsentStatus.GRANTED ? now : null,
      revokedAt: parsed.status === ConsentStatus.REVOKED ? now : null,
    },
  });

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'consent.upsert',
    targetType: 'student',
    targetId: parsed.studentId,
    metadata: { status: parsed.status },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/students`);
  revalidatePath(`/${locale}/students/${parsed.studentId}`);
  redirect(`/${locale}/students/${parsed.studentId}`);
}

const deleteStudentSchema = z.object({ studentId: z.string().min(1) });

export async function deleteStudent(formData: FormData) {
  const { db, user, schoolId } = await getSchoolContext();
  const { studentId } = deleteStudentSchema.parse(Object.fromEntries(formData));

  const student = await db.student.findFirst({ where: { id: studentId } });
  if (!student) throw new Error('Student not found in this school');

  // Soft delete — sessions and audit trail remain in the DB for compliance.
  await db.student.update({
    where: { id: studentId },
    data: { deletedAt: new Date() },
  });

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'student.delete',
    targetType: 'student',
    targetId: studentId,
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/students`);
  redirect(`/${locale}/students`);
}

// ---------- parent share links ----------

const parentShareCreateSchema = z.object({
  studentId: z.string().min(1),
  expiresDays: z.preprocess(emptyToUndef, z.coerce.number().int().min(1).max(365).optional()),
});

/** Mints a 32-byte URL-safe token so guessing is not a realistic threat. */
function newShareToken(): string {
  return randomBytes(24).toString('base64url');
}

export async function createParentShareLink(formData: FormData) {
  const { db, user, schoolId } = await getSchoolContext();
  const { studentId, expiresDays } = parentShareCreateSchema.parse(
    Object.fromEntries(formData)
  );

  const student = await db.student.findFirst({ where: { id: studentId } });
  if (!student) throw new Error('Student not found in this school');

  const expiresAt = expiresDays
    ? new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000)
    : null;

  const link = await db.parentShareLink.create({
    data: {
      token: newShareToken(),
      studentId,
      schoolId,
      createdByUserId: user.id,
      expiresAt,
    },
  });

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'parentShare.create',
    targetType: 'student',
    targetId: studentId,
    metadata: { linkId: link.id, expiresAt: expiresAt?.toISOString() ?? null },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/students/${studentId}`);
}

const parentShareRevokeSchema = z.object({
  studentId: z.string().min(1),
  linkId: z.string().min(1),
});

export async function revokeParentShareLink(formData: FormData) {
  const { db, user, schoolId } = await getSchoolContext();
  const { studentId, linkId } = parentShareRevokeSchema.parse(
    Object.fromEntries(formData)
  );

  const link = await db.parentShareLink.findFirst({
    where: { id: linkId, studentId, schoolId },
  });
  if (!link) throw new Error('Share link not found');
  if (link.revokedAt) return;

  await db.parentShareLink.update({
    where: { id: linkId },
    data: { revokedAt: new Date() },
  });

  recordAudit({
    actorUserId: user.id,
    actorClerkUserId: user.clerkUserId,
    schoolId,
    action: 'parentShare.revoke',
    targetType: 'student',
    targetId: studentId,
    metadata: { linkId },
  });

  const locale = await getLocale();
  revalidatePath(`/${locale}/students/${studentId}`);
}
