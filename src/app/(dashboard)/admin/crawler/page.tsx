"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import {
  RefreshCw,
  Play,
  CircleDot,
  Clock,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCelebrities } from "@/entities/celebrity/api/use-celebrities";
import { CATEGORY_LABELS } from "@/entities/celebrity";

// 소스 타입 정의
const SOURCE_TYPES = ["NAVER", "YOUTUBE", "X", "META", "COMMUNITY"] as const;
type SourceType = (typeof SOURCE_TYPES)[number];

const SOURCE_LABELS: Record<SourceType, string> = {
  NAVER: "네이버",
  YOUTUBE: "유튜브",
  X: "X(트위터)",
  META: "메타",
  COMMUNITY: "디시인사이드",
};

// 상태 API 응답 타입
interface CrawlStatus {
  sources: Array<{
    sourceType: string;
    _max: { collectedAt: string | null };
    _count: number;
  }>;
  queue: { waiting: number; active: number; failed: number };
  schedules: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatTime(dateStr: string | null) {
  if (!dateStr) return "수집 기록 없음";
  const d = new Date(dateStr);
  return d.toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function CrawlerPage() {
  const { data: celebrities, isLoading } = useCelebrities();
  const { data: status, mutate: mutateStatus } = useSWR<CrawlStatus>(
    "/api/crawl/status",
    fetcher,
    { refreshInterval: 5000 }
  );

  const [triggeringAll, setTriggeringAll] = useState(false);
  const [triggeringIds, setTriggeringIds] = useState<Set<string>>(new Set());

  // 소스별 마지막 수집 시간 맵
  const lastCollectedMap = new Map(
    status?.sources.map((s) => [s.sourceType, s]) ?? []
  );

  // 크롤링 트리거 (전체 / 소스별 / 셀럽별 / 셀럽+소스별)
  const triggerCrawl = useCallback(
    async (options?: { celebrityId?: string; sourceType?: SourceType }) => {
      const key = options?.celebrityId
        ? `${options.celebrityId}-${options.sourceType ?? "all"}`
        : "all";
      const isAll = key === "all";

      if (isAll) setTriggeringAll(true);
      else setTriggeringIds((prev) => new Set(prev).add(key));

      try {
        const res = await fetch("/api/crawl/trigger", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(options ?? {}),
        });
        const data = await res.json();
        alert(data.message || data.error);
        mutateStatus();
      } catch {
        alert("크롤링 트리거에 실패했습니다");
      } finally {
        if (isAll) setTriggeringAll(false);
        else
          setTriggeringIds((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
      }
    },
    [mutateStatus]
  );

  const isTriggeringKey = (key: string) => triggeringIds.has(key);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">크롤러 상태</h1>
        <Button onClick={() => triggerCrawl()} disabled={triggeringAll}>
          {triggeringAll ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          전체 크롤링
        </Button>
      </div>

      {/* 큐 상태 카드 */}
      {status && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                대기 중
              </CardDescription>
              <CardTitle className="text-2xl">{status.queue.waiting}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <CircleDot className="h-3.5 w-3.5" />
                진행 중
              </CardDescription>
              <CardTitle className="text-2xl">{status.queue.active}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" />
                실패
              </CardDescription>
              <CardTitle className="text-2xl text-destructive">
                {status.queue.failed}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* 소스별 탭 */}
      <Tabs defaultValue="all">
        <TabsList>
          <TabsTrigger value="all">전체</TabsTrigger>
          {SOURCE_TYPES.map((st) => (
            <TabsTrigger key={st} value={st}>
              {SOURCE_LABELS[st]}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* 소스별 최근 수집 정보 */}
        {status && (
          <div className="mt-4 flex flex-wrap gap-2">
            {SOURCE_TYPES.map((st) => {
              const info = lastCollectedMap.get(st);
              return (
                <Badge key={st} variant={info ? "secondary" : "outline"}>
                  {SOURCE_LABELS[st]}:{" "}
                  {info
                    ? `${info._count}건 / ${formatTime(info._max.collectedAt)}`
                    : "수집 기록 없음"}
                </Badge>
              );
            })}
          </div>
        )}

        {/* 로딩 / 빈 상태 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !celebrities?.length ? (
          <p className="text-muted-foreground py-12 text-center">
            등록된 셀럽이 없습니다.
          </p>
        ) : (
          <>
            {/* 전체 탭 */}
            <TabsContent value="all">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {celebrities.map((celeb) => (
                  <CelebCard
                    key={celeb.id}
                    celeb={celeb}
                    onTrigger={triggerCrawl}
                    isTriggeringKey={isTriggeringKey}
                    showAllSources
                  />
                ))}
              </div>
            </TabsContent>

            {/* 소스별 탭 */}
            {SOURCE_TYPES.map((st) => (
              <TabsContent key={st} value={st}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {celebrities.map((celeb) => (
                    <CelebCard
                      key={celeb.id}
                      celeb={celeb}
                      onTrigger={triggerCrawl}
                      isTriggeringKey={isTriggeringKey}
                      filterSource={st}
                    />
                  ))}
                </div>
              </TabsContent>
            ))}
          </>
        )}
      </Tabs>
    </div>
  );
}

// 셀럽 카드 컴포넌트
function CelebCard({
  celeb,
  onTrigger,
  isTriggeringKey,
  showAllSources,
  filterSource,
}: {
  celeb: { id: string; name: string; category: string };
  onTrigger: (options?: {
    celebrityId?: string;
    sourceType?: SourceType;
  }) => Promise<void>;
  isTriggeringKey: (key: string) => boolean;
  showAllSources?: boolean;
  filterSource?: SourceType;
}) {
  const allKey = `${celeb.id}-all`;
  const isTriggeringAll = isTriggeringKey(allKey);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-base">{celeb.name}</CardTitle>
            <CardDescription>
              <Badge variant="secondary" className="mt-1">
                {CATEGORY_LABELS[
                  celeb.category as keyof typeof CATEGORY_LABELS
                ] ?? celeb.category}
              </Badge>
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {showAllSources ? (
          <>
            {/* 전체 수집 버튼 */}
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={isTriggeringAll}
              onClick={() => onTrigger({ celebrityId: celeb.id })}
            >
              {isTriggeringAll ? (
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              전체 소스 수집
            </Button>
            {/* 소스별 버튼 */}
            <div className="grid grid-cols-2 gap-1.5">
              {SOURCE_TYPES.map((st) => {
                const key = `${celeb.id}-${st}`;
                const triggering = isTriggeringKey(key);
                return (
                  <Button
                    key={st}
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    disabled={triggering}
                    onClick={() =>
                      onTrigger({ celebrityId: celeb.id, sourceType: st })
                    }
                  >
                    {triggering ? (
                      <RefreshCw className="mr-1 h-3 w-3 animate-spin" />
                    ) : (
                      <Play className="mr-1 h-3 w-3" />
                    )}
                    {SOURCE_LABELS[st]}
                  </Button>
                );
              })}
            </div>
          </>
        ) : filterSource ? (
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={isTriggeringKey(`${celeb.id}-${filterSource}`)}
            onClick={() =>
              onTrigger({ celebrityId: celeb.id, sourceType: filterSource })
            }
          >
            {isTriggeringKey(`${celeb.id}-${filterSource}`) ? (
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-2 h-4 w-4" />
            )}
            {SOURCE_LABELS[filterSource]} 수집 시작
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
