"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { EventWithRelations } from "@/entities/event";
import { ArrowRight, Zap, Bot } from "lucide-react";

interface EventTimelineProps {
  events: EventWithRelations[];
  isLoading?: boolean;
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function SentimentValue({ value }: { value: number }) {
  const percent = (value * 100).toFixed(1);
  const color = value >= 0 ? "text-green-400" : "text-red-400";
  return <span className={color}>{percent}%</span>;
}

export function EventTimeline({ events, isLoading }: EventTimelineProps) {
  if (isLoading) {
    return <p className="text-sm text-zinc-400">로딩 중...</p>;
  }

  if (!events || events.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 py-16 text-zinc-400">
        <Zap className="mb-3 size-8" />
        <p className="text-lg">감지된 이벤트가 없습니다</p>
        <p className="mt-1 text-sm">
          선택한 기간 내 이벤트가 없습니다.
        </p>
      </div>
    );
  }

  return (
    <div className="relative ml-4">
      {/* 세로 타임라인 선 */}
      <div className="absolute left-0 top-0 h-full w-0.5 bg-zinc-700" />

      <div className="space-y-6">
        {events.map((event) => {
          const diff = event.sentimentAfter - event.sentimentBefore;
          const isPositive = diff >= 0;
          const dotColor = isPositive ? "bg-green-500" : "bg-red-500";

          return (
            <div key={event.id} className="relative pl-8">
              {/* 타임라인 점 */}
              <div
                className={`absolute left-[-5px] top-4 size-3 rounded-full border-2 border-zinc-900 ${dotColor}`}
              />

              <Card className="bg-zinc-900/50 border-zinc-800">
                <CardContent className="p-4">
                  {/* 상단: 제목 + 뱃지 */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="flex-1">
                      <h3 className="font-semibold text-zinc-100">
                        {event.title}
                      </h3>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {formatDate(event.eventDate as unknown as string)}
                        {event.celebrity && (
                          <> &middot; {event.celebrity.name}</>
                        )}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {event.autoDetected && (
                        <Badge variant="secondary" className="gap-1 text-xs">
                          <Bot className="size-3" />
                          자동감지
                        </Badge>
                      )}
                      <Badge
                        variant={isPositive ? "default" : "destructive"}
                        className="text-xs"
                      >
                        영향 {(event.impactScore * 100).toFixed(0)}%
                      </Badge>
                    </div>
                  </div>

                  {/* 설명 */}
                  {event.description && (
                    <p className="mt-2 text-sm text-zinc-400 line-clamp-2">
                      {event.description}
                    </p>
                  )}

                  {/* 감성 전후 비교 */}
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <span className="text-zinc-500">감성:</span>
                    <SentimentValue value={event.sentimentBefore} />
                    <ArrowRight className="size-3 text-zinc-500" />
                    <SentimentValue value={event.sentimentAfter} />
                    <span className="text-zinc-600">
                      ({isPositive ? "+" : ""}
                      {(diff * 100).toFixed(1)}%p)
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>
          );
        })}
      </div>
    </div>
  );
}
