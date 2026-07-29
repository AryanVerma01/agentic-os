-- CreateTable
CREATE TABLE "UserPreferences" (
    "user_id" VARCHAR(255) NOT NULL,
    "general_instructions" TEXT,
    "theme" TEXT NOT NULL DEFAULT 'light',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("user_id")
);
