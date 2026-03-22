"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCelebrities } from "@/entities/celebrity/api/use-celebrities";
import { useEvents } from "@/entities/event/api/use-events";
import { EventTimeline } from "@/widgets/event-timeline";

const PERIOD_OPTIONS = [
  { label: "7일", value: 7 },
  { label: "30일", value: 30 },
  { label: "90일", value: 90 },
] as const;

export default function EventsPage() {
  const [selectedCelebrity, setSelectedCelebrity] = useState<string>("");
  const [days, setDays] = useState<number>(30);

  const { data: celebrities } = useCelebrities();
  const {
    data: eventsResponse,
    isLoading,
    error,
  } = useEvents(selectedCelebrity || undefined, days);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <h1 className="text-2xl font-bold text-zinc-100">이벤트 타임라인</h1>

      {/* 필터 */}
      <div className="flex flex-wrap items-center gap-3">
        {/* 셀럽 필터 */}
        <Select
          value={selectedCelebrity}
          onValueChange={(val) =>
            setSelectedCelebrity(val === "__all__" || val === null ? "" : val)
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="전체 셀럽" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">전체 셀럽</SelectItem>
            {celebrities?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* 기간 필터 */}
        <div className="flex gap-1">
          {PERIOD_OPTIONS.map((opt) => (
            <Button
              key={opt.value}
              variant={days === opt.value ? "default" : "outline"}
              size="sm"
              onClick={() => setDays(opt.value)}
            >
              {opt.label}
            </Button>
          ))}
        </div>
      </div>

      {/* 에러 */}
      {error && (
        <p className="text-sm text-red-400">
          데이터를 불러오는 데 실패했습니다.
        </p>
      )}

      {/* 타임라인 */}
      <EventTimeline events={eventsResponse?.data ?? eventsResponse?.events ?? []} isLoading={isLoading} />
    </div>
  );
}
