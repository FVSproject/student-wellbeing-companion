# Student Wellbeing Companion — Platform Architecture Spec

Companion to `PROJECT.md` (hardware/firmware/AI scope). This file scopes the **web platform** that counselors and Foundation admins use.

**Deployment target:** Cloud (Vercel + managed DB), accessible from anywhere.
**Tenancy model:** Multi-school. One counselor per school, many schools, one Foundation.
**v1 goal:** Full-featured — not a bare-bones MVP. Dashboard, history, admin, reports, consent tracking all included from the start.

---

## 1. Roles & tenancy

| Role | Scope | Access |
|---|---|---|
| Counselor | One school (`schoolId`) | Own school's students, sessions, reports only |
| School admin *(optional — can reuse Counselor role for v1)* | One school | Same as counselor + roster/consent management |
| Foundation super-admin | All schools | Cross-school dashboard, school/counselor onboarding, platform-wide settings, audit log |

**Every query on student/session/device data must be scoped by `schoolId`.** This is the most important invariant in the whole system — a bug here is a data leak between schools involving minors' sensitive data. Enforce it at the ORM/query layer, not just in UI logic.

---

## 2. Core modules

1. **Auth & onboarding** — Foundation invites a school → school admin invites counselor(s). Role-based access control.
2. **Student roster** — per-school list, linked to consent status.
3. **Consent management** — parental/student consent record per student; session start is blocked until consent is on file.
4. **Device pairing** — associate a physical hand-rest sensor with a counselor/session (QR code or manual device ID entry recommended).
5. **Live session view** — real-time biometric stream + rolling AI guidance while a session is in progress. Counselor-only view; nothing analytical is shown on the student's device.
6. **Session history** — past sessions per student; trend view across sessions (e.g. GSR/HR baseline drift over time).
7. **AI analysis engine** — receives transcript + biometric bundle every N seconds, calls Claude API server-side, stores structured output (state summary + suggested approach).
8. **Reports** — per-student PDF summary, per-school and Foundation-wide aggregate stats (session counts, no individual biometric detail in aggregate views).
9. **Admin panel** (Foundation-level) — manage schools, counselors, data retention policy, review audit log.
10. **Audit log** — every read of a student's session/biometric data is logged (who, when, what).

---

## 3. Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Next.js (App Router) | Single codebase, frontend + API routes, deploys to Vercel |
| i18n / RTL | `next-intl` | Arabic + English, matches your existing bilingual documentation pattern |
| Database | PostgreSQL (Neon or Supabase) | Serverless-friendly, pairs with Vercel |
| ORM | Prisma | Makes `schoolId` scoping explicit and reviewable in every query |
| Auth | Clerk | Built-in "Organizations" primitive maps directly onto School → Counselor structure; saves building RBAC from scratch |
| Real-time | Ably or Pusher | Streams live session data to dashboard; raw WebSockets don't persist well on serverless hosts |
| AI | Claude API (Anthropic), called server-side only | Never expose API key to the browser |
| Audio/file storage | Cloudflare R2 (S3-compatible) | Only if storing raw session audio; otherwise store transcripts only |
| Background jobs | Vercel Cron or Inngest | Data-retention cleanup, scheduled reports |
| Hosting | Vercel | Matches Next.js, simple CI/CD from GitHub |

---

## 4. Data model sketch

```
Foundation
 └─ School (tenant boundary)
     └─ Counselor (User, role = counselor | school_admin)
     └─ Student
         └─ ConsentRecord (status, date, guardian info)
         └─ Session
             └─ Device (paired hand-rest sensor, device ID)
             └─ SessionSample[] (time-series: timestamp, HR, HRV, GSR, temp, motion score)
             └─ TranscriptSegment[] (timestamp, text)
             └─ AIAnalysis[] (timestamp, state summary, suggested approach — counselor-facing only)
 └─ AuditLogEntry (actor, action, target, timestamp) — cross-cutting
```

Notes:
- `SessionSample` and `TranscriptSegment` are time-series tables — index by `sessionId + timestamp`.
- `AIAnalysis` entries are periodic snapshots during a session (e.g. every 15–30s), not one row per session.
- Keep raw audio out of the primary DB — object storage (R2) if kept at all, with a strict retention policy.

---

## 5. Data flow (device → dashboard)

```
ESP32 hand-rest sensor
   │ WiFi, biometric JSON every ~5s
   ▼
Ingestion API route (Next.js API route, validates schoolId/deviceId/session token)
   │
   ├─→ writes SessionSample rows
   ├─→ pushes to Ably/Pusher channel scoped to session → live dashboard updates
   │
   └─→ every N seconds: bundles recent samples + transcript segment
           │
           ▼
       Claude API call (server-side)
           │
           ▼
       AIAnalysis row written + pushed to counselor's live view via Ably/Pusher
```

Audio path is separate: device → streaming endpoint → speech-to-text service → `TranscriptSegment` rows, joined into the same bundling step above.

---

## 6. Security & compliance requirements (non-negotiable given minors' data)

- [ ] Every student/session data query scoped by `schoolId` at the ORM layer.
- [ ] Consent record required before a session can start.
- [ ] Encryption at rest (DB) and in transit (TLS everywhere, including device → API).
- [ ] AI output framed as decision-support in the prompt itself — never phrased as a diagnosis, and never rendered on the student-facing device.
- [ ] Audit log on every read of session/biometric data — who, when, which student.
- [ ] Configurable data retention period, with an automated cleanup job.
- [ ] Foundation super-admin can see aggregate stats but not raw per-student biometric detail unless explicitly reviewing a flagged case.
- [ ] Claude API key and any other secrets live server-side only (env vars on Vercel), never shipped to the client.

---

## 7. Suggested build order for Claude Code

1. Scaffold Next.js app with Prisma + Postgres, set up `School`/`Counselor`/`Student` models and Clerk auth with organization-based tenancy.
2. Build student roster + consent management screens (simplest CRUD, establishes the scoping pattern early).
3. Build device pairing + a mock ingestion endpoint that accepts fake biometric JSON (no real hardware needed yet to build this layer).
4. Wire up Ably/Pusher for live dashboard updates from the mock ingestion endpoint.
5. Add the Claude API bundling/analysis step server-side, using canned sample data first.
6. Build session history + trend views.
7. Build reports (PDF export) and the Foundation admin panel.
8. Add audit logging across all data-read paths.
9. Only once the above works end-to-end with mock data, connect the real ESP32 firmware (from `PROJECT.md`) to the ingestion endpoint.

---

## 8. Reference files
- `PROJECT.md` — hardware, firmware, and AI-integration scope (device side).
- `Student_Wellbeing_Electronics_Cost_Analysis.xlsx` — costed BOM.
