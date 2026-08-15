-- AlterTable
ALTER TABLE "students" ADD COLUMN     "parentEmail" TEXT;

-- CreateTable
CREATE TABLE "parent_share_links" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "schoolId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastViewedAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "parent_share_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parent_share_links_token_key" ON "parent_share_links"("token");

-- CreateIndex
CREATE INDEX "parent_share_links_studentId_revokedAt_idx" ON "parent_share_links"("studentId", "revokedAt");

-- AddForeignKey
ALTER TABLE "parent_share_links" ADD CONSTRAINT "parent_share_links_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE;
