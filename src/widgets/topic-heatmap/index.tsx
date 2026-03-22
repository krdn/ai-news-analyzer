"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface TopicScore {
  topic: string;
  score: number;
}

interface TopicHeatmapProps {
  /** topTopics 맵을 배열로 변환한 데이터 */
  topics: TopicScore[];
  title?: string;
}

/** 점수 기준 색상 반환 */
function getBarColor(score: number): string {
  if (score >= 0.4) return "#22c55e"; // green
  if (score >= 0.1) return "#86efac"; // light green
  if (score > -0.1) return "#71717a"; // gray
  if (score > -0.4) return "#fca5a5"; // light red
  return "#ef4444"; // red
}

export function TopicHeatmap({
  topics,
  title = "주제별 감성 점수",
}: TopicHeatmapProps) {
  if (!topics.length) return null;

  // 점수 내림차순 정렬
  const sorted = [...topics].sort((a, b) => b.score - a.score);
  const maxAbs = Math.max(...sorted.map((t) => Math.abs(t.score)), 0.01);

  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader>
        <CardTitle className="text-sm font-medium text-zinc-300">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.map(({ topic, score }) => {
          // 바 너비를 최대값 대비 비율로 계산 (전체 너비의 50%가 한쪽 최대)
          const pct = (Math.abs(score) / maxAbs) * 50;
          const isPositive = score >= 0;

          return (
            <div key={topic} className="flex items-center gap-2 text-sm">
              {/* 주제 이름 */}
              <span className="w-24 shrink-0 truncate text-right text-zinc-400">
                {topic}
              </span>

              {/* 바 영역 */}
              <div className="relative flex h-5 flex-1 items-center">
                {/* 중앙선 */}
                <div className="absolute left-1/2 h-full w-px bg-zinc-700" />

                {/* 바 */}
                <div
                  className="absolute h-4 rounded-sm"
                  style={{
                    backgroundColor: getBarColor(score),
                    width: `${pct}%`,
                    ...(isPositive
                      ? { left: "50%" }
                      : { right: "50%" }),
                  }}
                />
              </div>

              {/* 점수 */}
              <span
                className="w-14 shrink-0 text-right font-mono text-xs"
                style={{ color: getBarColor(score) }}
              >
                {score >= 0 ? "+" : ""}
                {score.toFixed(2)}
              </span>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
