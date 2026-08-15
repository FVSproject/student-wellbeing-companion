import {
  PrismaClient,
  UserRole,
  ConsentStatus,
  SessionStatus,
  Speaker,
  DeviceStatus,
} from '@prisma/client';

const db = new PrismaClient();

// Deterministic IDs so seed is idempotent — running it twice is safe.
const FOUNDATION_ID = 'seed-foundation';
const SCHOOL_ID = 'seed-school-alahsa';
const COUNSELOR_ID = 'seed-user-counselor';
const DEVICE_ID = 'seed-device-01';

async function main() {
  console.log('→ Seeding Foundation + School…');
  const foundation = await db.foundation.upsert({
    where: { id: FOUNDATION_ID },
    create: {
      id: FOUNDATION_ID,
      name: 'Rawafid Foundation',
    },
    update: {},
  });

  const school = await db.school.upsert({
    where: { id: SCHOOL_ID },
    create: {
      id: SCHOOL_ID,
      foundationId: foundation.id,
      name: 'Future Vision Private Schools',
      city: 'Al-Ahsa',
    },
    update: {},
  });

  console.log('→ Seeding placeholder counselor…');
  const counselor = await db.user.upsert({
    where: { clerkUserId: 'seed_counselor_clerk_id' },
    create: {
      id: COUNSELOR_ID,
      clerkUserId: 'seed_counselor_clerk_id',
      email: 'counselor@seed.local',
      fullName: 'المرشدة أ. مثال',
      role: UserRole.COUNSELOR,
      schoolId: school.id,
    },
    update: {},
  });

  console.log('→ Seeding students + consent records…');
  const studentSeed = [
    { externalId: 'STU-001', fullName: 'طالبة أ', gradeLevel: 'الصف السادس' },
    { externalId: 'STU-002', fullName: 'طالبة ب', gradeLevel: 'الصف السابع' },
    { externalId: 'STU-003', fullName: 'طالبة ج', gradeLevel: 'الصف الخامس' },
  ];

  for (const s of studentSeed) {
    const student = await db.student.upsert({
      where: { schoolId_externalId: { schoolId: school.id, externalId: s.externalId } },
      create: { schoolId: school.id, ...s },
      update: {},
    });

    await db.consentRecord.upsert({
      where: { studentId: student.id },
      create: {
        studentId: student.id,
        schoolId: school.id,
        status: ConsentStatus.GRANTED,
        guardianName: 'ولي الأمر',
        guardianRelation: 'الأب',
        guardianContact: '+9665XXXXXXXX',
        signedAt: new Date(),
      },
      update: {},
    });
  }

  console.log('→ Seeding hand-rest sensor…');
  const device = await db.device.upsert({
    where: { serialNumber: 'HANDREST-001' },
    create: {
      id: DEVICE_ID,
      schoolId: school.id,
      name: 'Hand-rest sensor #1',
      serialNumber: 'HANDREST-001',
      status: DeviceStatus.PAIRED,
      firmwareRev: '0.1.0',
    },
    update: {},
  });

  console.log('→ Seeding one completed session with samples + transcript + analysis…');
  const firstStudent = await db.student.findFirst({
    where: { schoolId: school.id, externalId: 'STU-001' },
  });
  if (!firstStudent) throw new Error('Seed student not found — abort.');

  // Anchor the sample session at a stable offset so re-seeding doesn't spawn new copies.
  const anchor = new Date('2026-08-05T09:00:00Z');
  const existing = await db.session.findFirst({
    where: {
      studentId: firstStudent.id,
      startedAt: anchor,
    },
  });

  if (existing) {
    console.log('   (sample session already present — skipping)');
  } else {
    const session = await db.session.create({
      data: {
        schoolId: school.id,
        studentId: firstStudent.id,
        counselorId: counselor.id,
        deviceId: device.id,
        status: SessionStatus.COMPLETED,
        startedAt: anchor,
        endedAt: new Date(anchor.getTime() + 30 * 60 * 1000),
        notes: 'Seed session — safe sample data for local development.',
      },
    });

    const samples = Array.from({ length: 30 }).map((_, i) => ({
      sessionId: session.id,
      schoolId: school.id,
      timestamp: new Date(anchor.getTime() + i * 60 * 1000),
      heartRate: 78 + Math.round(Math.sin(i / 3) * 8),
      hrv: 42 + Math.sin(i / 4) * 6,
      spo2: 97 + Math.random() * 1.5,
      gsr: 3.2 + Math.sin(i / 5) * 0.9,
      skinTemp: 33.6 + Math.sin(i / 8) * 0.3,
      motionScore: 0.05 + Math.abs(Math.sin(i / 2)) * 0.15,
      batteryPct: Math.max(30, 100 - i),
    }));
    await db.sessionSample.createMany({ data: samples });

    await db.transcriptSegment.createMany({
      data: [
        {
          sessionId: session.id,
          schoolId: school.id,
          timestamp: new Date(anchor.getTime() + 60_000),
          durationMs: 12_000,
          speaker: Speaker.COUNSELOR,
          text: 'كيف كان أسبوعك يا عزيزتي؟',
          confidence: 0.95,
        },
        {
          sessionId: session.id,
          schoolId: school.id,
          timestamp: new Date(anchor.getTime() + 90_000),
          durationMs: 18_000,
          speaker: Speaker.STUDENT,
          text: '... (نص تجريبي للطالبة — بيانات بذرة للتطوير المحلي)',
          confidence: 0.88,
        },
      ],
    });

    await db.aIAnalysis.create({
      data: {
        sessionId: session.id,
        schoolId: school.id,
        windowStart: anchor,
        windowEnd: new Date(anchor.getTime() + 5 * 60 * 1000),
        stateSummary:
          'Seed sample. Baseline arousal is elevated with a mild upward drift in GSR — student appears cautious in the opening. Decision-support only, not a diagnosis.',
        suggestedApproaches: [
          'Slow the pace and open with a neutral warm-up topic.',
          'Reflect the last statement back before probing further.',
        ],
        locale: 'en',
        model: 'seed-placeholder',
      },
    });
  }

  console.log('✓ Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await db.$disconnect();
  });
