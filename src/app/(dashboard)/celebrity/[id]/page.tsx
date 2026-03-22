"use client";

import { use } from "react";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS } from "@/entities/celebrity";
import { useCelebrity } from "@/entities/celebrity/api/use-celebrities";
import { useSentiment } from "@/features/sentiment-tracking";
import { SentimentChart } from "@/widgets/sentiment-chart";
import { CommentFeed } from "@/widgets/comment-feed";

export default function CelebrityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: celebrity, isLoading: celebLoading } = useCelebrity(id);
  const {
    snapshots,
    recentComments,
    isLoading: sentimentLoading,
  } = useSentiment(id);

  if (celebLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-zinc-500">로딩 중...</p>
      </div>
    );
  }

  if (!celebrity) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm text-zinc-500">셀럽을 찾을 수 없습니다</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* 헤더: 이름 + 카테고리 배지 */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-zinc-100">{celebrity.name}</h1>
          <Badge variant="secondary" className="text-xs">
            {CATEGORY_LABELS[celebrity.category]}
          </Badge>
        </div>

        {/* 별칭 표시 */}
        {celebrity.aliases && celebrity.aliases.length > 0 && (
          <p className="text-sm text-zinc-500">
            별칭: {celebrity.aliases.join(", ")}
          </p>
        )}
      </div>

      {/* 2컬럼 그리드: 감성 차트 + 댓글 피드 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {sentimentLoading ? (
          <>
            <div className="flex h-64 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
              <p className="text-sm text-zinc-500">차트 로딩 중...</p>
            </div>
            <div className="flex h-64 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
              <p className="text-sm text-zinc-500">댓글 로딩 중...</p>
            </div>
          </>
        ) : (
          <>
            <SentimentChart data={snapshots} />
            <CommentFeed comments={recentComments} />
          </>
        )}
      </div>
    </div>
  );
}
