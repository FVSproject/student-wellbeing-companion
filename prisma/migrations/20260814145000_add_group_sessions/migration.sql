-- CreateTable
CREATE TABLE "group_sessions" (
    "id" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "counselorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "topic" TEXT,
    "status" "SessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "notes" TEXT,
    "overallSummary" TEXT,
    "overallSuggestion" TEXT,
    "summaryGeneratedAt" TIMESTAMP(3),
    "summaryModel" TEXT,
    "summaryLocale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "group_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_session_students" (
    "groupSessionId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_session_students_pkey" PRIMARY KEY ("groupSessionId","studentId")
);

-- CreateIndex
CREATE INDEX "group_sessions_schoolId_status_idx" ON "group_sessions"("schoolId", "status");

-- CreateIndex
CREATE INDEX "group_sessions_schoolId_deletedAt_idx" ON "group_sessions"("schoolId", "deletedAt");

-- CreateIndex
CREATE INDEX "group_session_students_studentId_idx" ON "group_session_students"("studentId");

-- AddForeignKey
ALTER TABLE "group_sessions" ADD CONSTRAINT "group_sessions_counselorId_fkey" FOREIGN KEY ("counselorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_session_students" ADD CONSTRAINT "group_session_students_groupSessionId_fkey" FOREIGN KEY ("groupSessionId") REFERENCES "group_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_session_students" ADD CONSTRAINT "group_session_students_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
