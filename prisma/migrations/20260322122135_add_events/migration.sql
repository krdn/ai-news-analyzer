-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "celebrity_id" UUID NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "description" TEXT,
    "event_date" TIMESTAMP(3) NOT NULL,
    "detected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentiment_before" DOUBLE PRECISION NOT NULL,
    "sentiment_after" DOUBLE PRECISION NOT NULL,
    "impact_score" DOUBLE PRECISION NOT NULL,
    "auto_detected" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "events_celebrity_id_event_date_idx" ON "events"("celebrity_id", "event_date");

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_celebrity_id_fkey" FOREIGN KEY ("celebrity_id") REFERENCES "celebrities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
