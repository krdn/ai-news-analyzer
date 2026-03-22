-- CreateTable
CREATE TABLE "alerts" (
    "id" UUID NOT NULL,
    "celebrity_id" UUID NOT NULL,
    "alert_type" TEXT NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "channel" TEXT NOT NULL DEFAULT 'telegram',
    "channel_config" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "last_triggered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "alerts_celebrity_id_idx" ON "alerts"("celebrity_id");

-- AddForeignKey
ALTER TABLE "alerts" ADD CONSTRAINT "alerts_celebrity_id_fkey" FOREIGN KEY ("celebrity_id") REFERENCES "celebrities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
