import { neon } from '@neondatabase/serverless';

const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set');
  process.exit(1);
}

const sql = neon(url);

try {
  const [counts] = await sql`
    SELECT
      (SELECT COUNT(*) FROM foundations) AS foundations,
      (SELECT COUNT(*) FROM schools) AS schools,
      (SELECT COUNT(*) FROM users) AS users,
      (SELECT COUNT(*) FROM students) AS students,
      (SELECT COUNT(*) FROM consent_records) AS consents,
      (SELECT COUNT(*) FROM devices) AS devices,
      (SELECT COUNT(*) FROM sessions) AS sessions,
      (SELECT COUNT(*) FROM session_samples) AS samples,
      (SELECT COUNT(*) FROM transcript_segments) AS transcripts,
      (SELECT COUNT(*) FROM ai_analyses) AS analyses
  `;
  console.log('Row counts:');
  console.log(JSON.stringify(counts, (_, v) => (typeof v === 'bigint' ? Number(v) : v), 2));
} catch (err) {
  console.error('FAILED:', err.message);
  process.exit(1);
}
