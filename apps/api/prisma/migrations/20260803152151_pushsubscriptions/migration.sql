-- CreateTable
CREATE TABLE "PushSubcriptions" (
    "id" TEXT NOT NULL,
    "user_id" VARCHAR(255) NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubcriptions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubcriptions_endpoint_key" ON "PushSubcriptions"("endpoint");
