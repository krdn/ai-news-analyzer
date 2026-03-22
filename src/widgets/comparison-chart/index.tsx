"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
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

interface ComparisonChartProps {
  results: ComparisonResult[];
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/**
 * 여러 셀럽의 스냅샷 데이터를 날짜 기준으로 병합
 * 각 셀럽의 avgScore를 별도 키로 매핑
 */
function mergeSnapshots(results: ComparisonResult[]) {
  const dateMap: Record<string, Record<string, number>> = {};

  for (const result of results) {
    const name = result.celebrity.name;
    for (const snap of result.snapshots) {
      const dateKey = snap.periodStart.slice(0, 10);
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = { periodStart: 0 } as unknown as Record<string, number>;
      }
      (dateMap[dateKey] as Record<string, unknown>).periodStart = snap.periodStart;
      dateMap[dateKey][name] = snap.avgScore;
    }
  }

  return Object.values(dateMap).sort((a, b) => {
    const aDate = a.periodStart as unknown as string;
    const bDate = b.periodStart as unknown as string;
    return aDate < bDate ? -1 : aDate > bDate ? 1 : 0;
  });
}

export function ComparisonChart({ results }: ComparisonChartProps) {
  if (!results.length) {
    return null;
  }

  const merged = mergeSnapshots(results);
  const names = results.map((r) => r.celebrity.name);

  if (!merged.length) {
    return (
      <Card className="border-zinc-800 bg-zinc-900">
        <CardHeader>
          <CardTitle className="text-zinc-100">감성 추이 비교</CardTitle>
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
        <CardTitle className="text-zinc-100">감성 추이 비교</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={320}>
          <LineChart data={merged}>
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
            <Tooltip
              contentStyle={{
                backgroundColor: "#18181b",
                border: "1px solid #27272a",
                borderRadius: "6px",
                fontSize: "12px",
              }}
              labelFormatter={(label) => formatDate(String(label))}
              formatter={(value) => [Number(value).toFixed(3), ""]}
            />
            <ReferenceLine y={0} stroke="#52525b" strokeDasharray="3 3" />
            <Legend
              wrapperStyle={{ fontSize: "12px", color: "#a1a1aa" }}
            />
            {names.map((name, i) => (
              <Line
                key={name}
                type="monotone"
                dataKey={name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={{ fill: COLORS[i % COLORS.length], r: 3 }}
                activeDot={{ r: 5 }}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
