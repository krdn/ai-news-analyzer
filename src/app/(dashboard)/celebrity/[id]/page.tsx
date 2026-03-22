"use client";

import { use, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CATEGORY_LABELS } from "@/entities/celebrity";
import { useCelebrity } from "@/entities/celebrity/api/use-celebrities";
import { useEvents } from "@/entities/event/api/use-events";
import { useSentiment } from "@/features/sentiment-tracking";
import { SentimentChart } from "@/widgets/sentiment-chart";
import { TopicHeatmap } from "@/widgets/topic-heatmap";
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
  const { data: events } = useEvents(id);

  // 스냅샷의 topTopics를 집계하여 주제별 평균 점수 계산
  const topicScores = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {};
    for (const snap of snapshots) {
      if (!snap.topTopics) continue;
      for (const [topic, score] of Object.entries(snap.topTopics)) {
        if (typeof score !== "number") continue;
        if (!map[topic]) map[topic] = { total: 0, count: 0 };
        map[topic].total += score;
        map[topic].count += 1;
      }
    }
    return Object.entries(map).map(([topic, { total, count }]) => ({
      topic,
      score: total / count,
    }));
  }, [snapshots]);

  // 이벤트 데이터를 SentimentChart에 전달할 형태로 변환
  const eventMarkers = useMemo(() => {
    if (!events) return undefined;
    return events.map((e) => ({
      periodStart: new Date(e.eventDate).toISOString(),
      title: e.title,
      sentimentAfter: e.sentimentAfter,
      sentimentBefore: e.sentimentBefore,
    }));
  }, [events]);

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

      {/* 2x2 그리드 레이아웃 */}
      {sentimentLoading ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <div
              key={i}
              className="flex h-64 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900"
            >
              <p className="text-sm text-zinc-500">로딩 중...</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Row 1: 감성 차트 + 주제별 히트맵 */}
          <SentimentChart data={snapshots} events={eventMarkers} />
          <TopicHeatmap topics={topicScores} />

          {/* Row 2: 댓글 피드 + 최근 이벤트 목록 */}
          <CommentFeed comments={recentComments} />
          <Card className="border-zinc-800 bg-zinc-900">
            <CardHeader>
              <CardTitle className="text-sm font-medium text-zinc-300">
                최근 이벤트
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {!events || events.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-zinc-500">
                  감지된 이벤트가 없습니다
                </p>
              ) : (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-3 p-4">
                    {events.map((event) => {
                      const dropped =
                        event.sentimentAfter < event.sentimentBefore;
                      return (
                        <div
                          key={event.id}
                          className="rounded-md border border-zinc-800 bg-zinc-950 p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-zinc-200">
                              {event.title}
                            </p>
                            <span
                              className={`shrink-0 text-xs font-mono ${
                                dropped ? "text-red-400" : "text-green-400"
                              }`}
                            >
                              {dropped ? "▼" : "▲"}{" "}
                              {Math.abs(
                                event.sentimentAfter - event.sentimentBefore
                              ).toFixed(3)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs text-zinc-500">
                            {new Date(event.eventDate).toLocaleDateString(
                              "ko-KR"
                            )}
                          </p>
                          {event.description && (
                            <p className="mt-1 text-xs text-zinc-400 line-clamp-2">
                              {event.description}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
