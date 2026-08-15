-- AlterTable
ALTER TABLE "ai_analyses" ADD COLUMN     "groupSessionId" TEXT,
ALTER COLUMN "sessionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "transcript_segments" ADD COLUMN     "groupSessionId" TEXT,
ALTER COLUMN "sessionId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "ai_analyses_groupSessionId_timestamp_idx" ON "ai_analyses"("groupSessionId", "timestamp");

-- CreateIndex
CREATE INDEX "transcript_segments_groupSessionId_timestamp_idx" ON "transcript_segments"("groupSessionId", "timestamp");

-- AddForeignKey
ALTER TABLE "transcript_segments" ADD CONSTRAINT "transcript_segments_groupSessionId_fkey" FOREIGN KEY ("groupSessionId") REFERENCES "group_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_analyses" ADD CONSTRAINT "ai_analyses_groupSessionId_fkey" FOREIGN KEY ("groupSessionId") REFERENCES "group_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
