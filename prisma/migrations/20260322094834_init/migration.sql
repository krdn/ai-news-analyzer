-- CreateEnum
CREATE TYPE "CelebrityCategory" AS ENUM ('POLITICIAN', 'ENTERTAINER', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('ALL', 'NAVER', 'YOUTUBE', 'X', 'META', 'COMMUNITY');

-- CreateEnum
CREATE TYPE "SentimentLabel" AS ENUM ('VERY_POSITIVE', 'POSITIVE', 'NEUTRAL', 'NEGATIVE', 'VERY_NEGATIVE');

-- CreateEnum
CREATE TYPE "AnalysisDepth" AS ENUM ('BASIC', 'DEEP');

-- CreateEnum
CREATE TYPE "PeriodType" AS ENUM ('HOURLY', 'DAILY', 'WEEKLY');

-- CreateTable
CREATE TABLE "celebrities" (
    "id" UUID NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "aliases" TEXT[],
    "category" "CelebrityCategory" NOT NULL,
    "profile_image" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "celebrities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "celebrity_sources" (
    "id" UUID NOT NULL,
    "celebrity_id" UUID NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "search_keywords" TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "celebrity_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "articles" (
    "id" UUID NOT NULL,
    "celebrity_id" UUID NOT NULL,
    "source_type" "SourceType" NOT NULL,
    "source_url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "author" TEXT,
    "published_at" TIMESTAMP(3),
    "collected_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentiment_score" DOUBLE PRECISION,
    "sentiment_label" "SentimentLabel",

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" UUID NOT NULL,
    "article_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "author" TEXT,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "published_at" TIMESTAMP(3),
    "sentiment_score" DOUBLE PRECISION,
    "sentiment_confidence" DOUBLE PRECISION,
    "sentiment_label" "SentimentLabel",
    "emotions" TEXT[],
    "topics" TEXT[],
    "analysis_depth" "AnalysisDepth",

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sentiment_snapshots" (
    "id" UUID NOT NULL,
    "celebrity_id" UUID NOT NULL,
    "period_type" "PeriodType" NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "source_type" "SourceType" NOT NULL DEFAULT 'ALL',
    "total_comments" INTEGER NOT NULL,
    "avg_score" DOUBLE PRECISION NOT NULL,
    "positive_count" INTEGER NOT NULL,
    "neutral_count" INTEGER NOT NULL,
    "negative_count" INTEGER NOT NULL,
    "top_emotions" JSONB,
    "top_topics" JSONB,

    CONSTRAINT "sentiment_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "articles_source_url_key" ON "articles"("source_url");

-- CreateIndex
CREATE INDEX "articles_celebrity_id_published_at_idx" ON "articles"("celebrity_id", "published_at");

-- CreateIndex
CREATE INDEX "comments_article_id_idx" ON "comments"("article_id");

-- CreateIndex
CREATE INDEX "comments_sentiment_score_idx" ON "comments"("sentiment_score");

-- CreateIndex
CREATE INDEX "comments_published_at_idx" ON "comments"("published_at");

-- CreateIndex
CREATE UNIQUE INDEX "sentiment_snapshots_celebrity_id_period_type_period_start_s_key" ON "sentiment_snapshots"("celebrity_id", "period_type", "period_start", "source_type");

-- AddForeignKey
ALTER TABLE "celebrity_sources" ADD CONSTRAINT "celebrity_sources_celebrity_id_fkey" FOREIGN KEY ("celebrity_id") REFERENCES "celebrities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_celebrity_id_fkey" FOREIGN KEY ("celebrity_id") REFERENCES "celebrities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sentiment_snapshots" ADD CONSTRAINT "sentiment_snapshots_celebrity_id_fkey" FOREIGN KEY ("celebrity_id") REFERENCES "celebrities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
