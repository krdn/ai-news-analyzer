"use client";

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ComparisonResult } from "@/features/celeb-comparison";

const COLORS = ["#3b82f6", "#f97316", "#22c55e", "#a855f7"];

interface TopicRadarProps {
  results: ComparisonResult[];
}

/**
 * -1~1 범위의 점수를 0~1 범위로 정규화
 */
function normalize(score: number): number {
  return (score + 1) / 2;
}

/**
 * 모든 셀럽의 토픽을 합쳐서 레이더 차트 데이터 생성
 */
function buildRadarData(results: ComparisonResult[]) {
  // 전체 토픽 키 수집
  const allTopics = new Set<string>();
  for (const result of results) {
    for (const topic of Object.keys(result.topics)) {
      allTopics.add(topic);
    }
  }

  if (allTopics.size === 0) return [];

  return Array.from(allTopics).map((topic) => {
    const entry: Record<string, string | number> = { topic };
    for (const result of results) {
      const raw = result.topics[topic] ?? 0;
      entry[result.celebrity.name] = normalize(raw);
    }
    return entry;
  });
}

export function TopicRadar({ results }: TopicRadarProps) {
  const radarData = buildRadarData(results);
  const names = results.map((r) => r.celebrity.name);

  if (!radarData.length) {
    return (
      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader>
          <CardTitle className="text-zinc-100">주제별 감성 분포</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-zinc-500">
            주제 데이터가 없습니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader>
        <CardTitle className="text-zinc-100">주제별 감성 분포</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <RadarChart data={radarData}>
            <PolarGrid stroke="#27272a" />
            <PolarAngleAxis
              dataKey="topic"
              stroke="#71717a"
              fontSize={11}
              tick={{ fill: "#a1a1aa" }}
            />
            <PolarRadiusAxis
              domain={[0, 1]}
              tick={false}
              axisLine={false}
            />
            {names.map((name, i) => (
              <Radar
                key={name}
                name={name}
                dataKey={name}
                stroke={COLORS[i % COLORS.length]}
                fill={COLORS[i % COLORS.length]}
                fillOpacity={0.15}
                strokeWidth={2}
              />
            ))}
            <Legend
              wrapperStyle={{ fontSize: "12px", color: "#a1a1aa" }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
