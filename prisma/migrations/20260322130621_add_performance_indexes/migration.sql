-- DropIndex
DROP INDEX "comments_article_id_idx";

-- CreateIndex
CREATE INDEX "articles_source_type_collected_at_idx" ON "articles"("source_type", "collected_at");

-- CreateIndex
CREATE INDEX "comments_article_id_published_at_idx" ON "comments"("article_id", "published_at");
