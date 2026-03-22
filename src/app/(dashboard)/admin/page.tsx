"use client";

import { useState } from "react";
import { Search, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { CelebrityCard } from "@/entities/celebrity/ui/celebrity-card";
import { CelebrityForm } from "@/entities/celebrity/ui/celebrity-form";
import { useCelebrities } from "@/entities/celebrity/api/use-celebrities";
import type { CreateCelebrityInput } from "@/entities/celebrity";

export default function AdminPage() {
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const { data: celebrities, error, isLoading, mutate } = useCelebrities(search || undefined);

  const handleCreate = async (data: CreateCelebrityInput) => {
    setIsCreating(true);
    try {
      const res = await fetch("/api/celebrities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("생성 실패");
      await mutate();
      setDialogOpen(false);
    } catch (err) {
      console.error("셀럽 생성 오류:", err);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">셀럽 관리</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 size-4" />
          셀럽 추가
        </Button>
      </div>

      {/* 검색 */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
        <Input
          placeholder="이름 또는 별칭으로 검색..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* 목록 */}
      {isLoading && (
        <p className="text-sm text-zinc-400">로딩 중...</p>
      )}

      {error && (
        <p className="text-sm text-red-400">데이터를 불러오는 데 실패했습니다.</p>
      )}

      {!isLoading && !error && celebrities?.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 py-12 text-zinc-400">
          <p className="text-lg">등록된 셀럽이 없습니다</p>
          <p className="mt-1 text-sm">셀럽 추가 버튼을 눌러 새로운 셀럽을 등록하세요.</p>
        </div>
      )}

      {celebrities && celebrities.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {celebrities.map((celebrity) => (
            <CelebrityCard key={celebrity.id} celebrity={celebrity} />
          ))}
        </div>
      )}

      {/* 추가 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>셀럽 추가</DialogTitle>
            <DialogDescription>
              새로운 셀럽 정보를 입력하세요.
            </DialogDescription>
          </DialogHeader>
          <CelebrityForm onSubmit={handleCreate} isLoading={isCreating} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
