-- CreateEnum
CREATE TYPE "StudentSex" AS ENUM ('FEMALE', 'MALE', 'UNSPECIFIED');

-- AlterTable
ALTER TABLE "schools" ADD COLUMN     "iconEmoji" TEXT;

-- AlterTable
ALTER TABLE "students" ADD COLUMN     "age" INTEGER,
ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "parentPhone" TEXT,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "sex" "StudentSex";
