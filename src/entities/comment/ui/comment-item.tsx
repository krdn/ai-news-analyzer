"use client";

import { ThumbsUp, ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SENTIMENT_COLORS } from "@/shared/config/constants";
import type { CommentWithArticle } from "../model/types";
import { SENTIMENT_LABEL_KO } from "../model/types";

interface CommentItemProps {
  comment: CommentWithArticle;
}

// 소스 타입 한국어 라벨
const SOURCE_TYPE_LABEL: Record<string, string> = {
  NAVER: "네이버",
  YOUTUBE: "유튜브",
  X: "X",
  META: "메타",
  COMMUNITY: "커뮤니티",
  ALL: "전체",
};

export function CommentItem({ comment }: CommentItemProps) {
  const sentimentColor = comment.sentimentLabel
    ? SENTIMENT_COLORS[comment.sentimentLabel]
    : undefined;
  const sentimentText = comment.sentimentLabel
    ? SENTIMENT_LABEL_KO[comment.sentimentLabel]
    : null;

  const formattedDate = comment.publishedAt
    ? new Date(comment.publishedAt).toLocaleDateString("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="flex flex-col gap-2 border-b border-zinc-800 px-4 py-3 last:border-b-0">
      {/* 댓글 본문 */}
      <p className="text-sm leading-relaxed text-zinc-200">{comment.content}</p>

      {/* 메타 정보 */}
      <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-500">
        {/* 작성자 */}
        {comment.author && <span>{comment.author}</span>}

        {/* 좋아요 */}
        {comment.likes > 0 && (
          <span className="flex items-center gap-1">
            <ThumbsUp className="h-3 w-3" />
            {comment.likes}
          </span>
        )}

        {/* 소스 타입 */}
        <span>
          {SOURCE_TYPE_LABEL[comment.article.sourceType] ??
            comment.article.sourceType}
        </span>

        {/* 날짜 */}
        {formattedDate && <span>{formattedDate}</span>}

        {/* 감성 라벨 배지 */}
        {sentimentText && sentimentColor && (
          <Badge
            variant="outline"
            className="border-0 text-xs font-medium"
            style={{
              backgroundColor: `${sentimentColor}20`,
              color: sentimentColor,
            }}
          >
            {sentimentText}
          </Badge>
        )}

        {/* 기사 링크 */}
        <a
          href={comment.article.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto flex items-center gap-1 text-zinc-600 transition-colors hover:text-zinc-300"
          title={comment.article.title}
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}
