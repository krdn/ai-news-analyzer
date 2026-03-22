"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SentimentDataPoint } from "@/features/sentiment-tracking";

interface EventMarker {
  periodStart: string;
  title: string;
  sentimentAfter: number;
  sentimentBefore: number;
}

interface SentimentChartProps {
  data: SentimentDataPoint[];
  title?: string;
  events?: EventMarker[];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

interface TooltipPayloadItem {
  value: number;
  payload: SentimentDataPoint;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm shadow-lg">
      <p className="font-medium text-zinc-100">
        {new Date(point.periodStart).toLocaleDateString("ko-KR")}
      </p>
      <p className="text-blue-400">
        평균 점수: {point.avgScore.toFixed(3)}
      </p>
      <p className="text-zinc-400">댓글 수: {point.totalComments}</p>
      <div className="mt-1 flex gap-2 text-xs">
        <span className="text-green-400">긍정 {point.positiveCount}</span>
        <span className="text-zinc-400">중립 {point.neutralCount}</span>
        <span className="text-red-400">부정 {point.negativeCount}</span>
      </div>
    </div>
  );
}

/**
 * 이벤트 날짜와 가장 가까운 스냅샷을 찾아 해당 avgScore를 반환
 */
function findClosestScore(
  eventDate: string,
  data: SentimentDataPoint[]
): number | null {
  if (!data.length) return null;
  const target = new Date(eventDate).getTime();
  let closest = data[0];
  let minDiff = Math.abs(new Date(data[0].periodStart).getTime() - target);
  for (const point of data) {
    const diff = Math.abs(new Date(point.periodStart).getTime() - target);
    if (diff < minDiff) {
      minDiff = diff;
      closest = point;
    }
  }
  return closest.avgScore;
}

export function SentimentChart({
  data,
  title = "감성 추이",
  events,
}: SentimentChartProps) {
  if (!data.length) {
    return (
      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader>
          <CardTitle className="text-zinc-100">{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-8 text-center text-sm text-zinc-500">
            아직 감성 데이터가 없습니다.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-zinc-800 bg-zinc-900">
      <CardHeader>
        <CardTitle className="text-zinc-100">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="periodStart"
              tickFormatter={formatDate}
              stroke="#71717a"
              fontSize={12}
            />
            <YAxis
              domain={[-1, 1]}
              stroke="#71717a"
              fontSize={12}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine y={0} stroke="#52525b" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="avgScore"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: "#3b82f6", r: 3 }}
              activeDot={{ r: 5 }}
            />
            {events?.map((event) => {
              const yVal = findClosestScore(event.periodStart, data);
              if (yVal === null) return null;
              const dropped = event.sentimentAfter < event.sentimentBefore;
              const target = new Date(event.periodStart).getTime();
              const closest = data.reduce((prev, curr) =>
                Math.abs(new Date(curr.periodStart).getTime() - target) <
                Math.abs(new Date(prev.periodStart).getTime() - target)
                  ? curr
                  : prev
              );
              return (
                <ReferenceDot
                  key={event.title + event.periodStart}
                  x={closest.periodStart}
                  y={yVal}
                  r={6}
                  fill={dropped ? "#ef4444" : "#22c55e"}
                  stroke="#18181b"
                  strokeWidth={2}
                  label={{
                    value: event.title.length > 8
                      ? event.title.slice(0, 8) + "..."
                      : event.title,
                    position: "top",
                    fill: dropped ? "#fca5a5" : "#86efac",
                    fontSize: 10,
                  }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
