-- Step 5: encrypted CNIC, per-system integration API keys, and an email outbox.
--
-- CNIC: the encryption key is an application secret (DATA_ENCRYPTION_KEY), so SQL cannot
-- do the encryption. This migration only adds the new columns and relaxes the old one;
-- prisma/post-migrate.ts then encrypts every row and, in the same transaction, drops the
-- plaintext "cnic" column and makes the new columns NOT NULL.

ALTER TABLE "SetterProfile" ADD COLUMN "cnicEncrypted" TEXT, ADD COLUMN "cnicHash" TEXT;
ALTER TABLE "SetterProfile" ALTER COLUMN "cnic" DROP NOT NULL;
CREATE INDEX "SetterProfile_cnicHash_idx" ON "SetterProfile"("cnicHash");

ALTER TABLE "SuperintendentProfile" ADD COLUMN "cnicEncrypted" TEXT, ADD COLUMN "cnicHash" TEXT;
ALTER TABLE "SuperintendentProfile" ALTER COLUMN "cnic" DROP NOT NULL;
CREATE INDEX "SuperintendentProfile_cnicHash_idx" ON "SuperintendentProfile"("cnicHash");

CREATE TABLE "ApiClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "scopes" TEXT[],
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ApiClient_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ApiClient_keyHash_key" ON "ApiClient"("keyHash");

CREATE TABLE "OutboxMessage" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "dedupeKey" TEXT,
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutboxMessage_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OutboxMessage_dedupeKey_key" ON "OutboxMessage"("dedupeKey");
CREATE INDEX "OutboxMessage_sentAt_runAfter_idx" ON "OutboxMessage"("sentAt", "runAfter");
