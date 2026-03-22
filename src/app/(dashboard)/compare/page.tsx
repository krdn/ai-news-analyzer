"use client";

import { useState } from "react";
import { useCelebrities } from "@/entities/celebrity/api/use-celebrities";
import { useComparison } from "@/features/celeb-comparison";
import { ComparisonChart } from "@/widgets/comparison-chart";
import { TopicRadar } from "@/widgets/topic-radar";

const MAX_SELECT = 4;

export default function ComparePage() {
  const { data: celebrities, isLoading: celebLoading } = useCelebrities();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { results, isLoading: compareLoading } = useComparison(selectedIds);

  function toggleCeleb(id: string) {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((v) => v !== id);
      }
      if (prev.length >= MAX_SELECT) return prev;
      return [...prev, id];
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-bold text-zinc-100">셀럽 비교</h1>
        <p className="text-sm text-zinc-500">
          {selectedIds.length}/{MAX_SELECT} 선택됨
        </p>
      </div>

      {/* 셀럽 선택 영역 */}
      {celebLoading ? (
        <p className="text-sm text-zinc-500">셀럽 목록 로딩 중...</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {celebrities?.map((celeb) => {
            const isSelected = selectedIds.includes(celeb.id);
            const isDisabled = !isSelected && selectedIds.length >= MAX_SELECT;
            return (
              <button
                key={celeb.id}
                onClick={() => toggleCeleb(celeb.id)}
                disabled={isDisabled}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                  isSelected
                    ? "bg-blue-600 text-white"
                    : isDisabled
                      ? "cursor-not-allowed bg-zinc-800 text-zinc-600"
                      : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
                }`}
              >
                {celeb.name}
              </button>
            );
          })}
        </div>
      )}

      {/* 비교 결과 */}
      {selectedIds.length < 2 ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
          <p className="text-sm text-zinc-500">
            비교할 셀럽을 2명 이상 선택하세요
          </p>
        </div>
      ) : compareLoading ? (
        <div className="flex h-64 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900">
          <p className="text-sm text-zinc-500">비교 데이터 로딩 중...</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ComparisonChart results={results} />
          <TopicRadar results={results} />
        </div>
      )}
    </div>
  );
}
