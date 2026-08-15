import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public health check. The KeepWarm client component pings this every 90s
 * while any authed tab is open. We deliberately touch the DB with a cheap
 * `SELECT 1` so the Neon serverless compute stays warm — otherwise the
 * next real query pays a 2-5 s cold-start.
 */
export async function GET() {
  let dbOk = false;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    // Report but never fail the endpoint — this is a heartbeat.
  }
  return NextResponse.json({
    ok: true,
    dbOk,
    service: 'student-wellbeing-companion',
    timestamp: new Date().toISOString(),
  });
}
