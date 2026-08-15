-- AlterTable
ALTER TABLE "sessions" ADD COLUMN     "overallSuggestion" TEXT,
ADD COLUMN     "overallSummary" TEXT,
ADD COLUMN     "summaryGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "summaryLocale" TEXT,
ADD COLUMN     "summaryModel" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "growthGeneratedAt" TIMESTAMP(3),
ADD COLUMN     "growthLocale" TEXT,
ADD COLUMN     "growthMetrics" JSONB,
ADD COLUMN     "growthSummary" TEXT;
