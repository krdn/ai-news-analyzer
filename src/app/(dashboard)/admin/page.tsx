"use client";

import { useState } from "react";
import useSWR from "swr";
import { Search, Plus, Trash2, Eye, Users, FileText, MessageSquare, Calendar, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
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

interface AdminStats {
  totalCelebrities: number;
  totalArticles: number;
  totalComments: number;
  totalEvents: number;
  todayArticles: number;
  todayComments: number;
  queue: { waiting: number; active: number; failed: number };
}

interface CleanupResult {
  dryRun: boolean;
  cutoffDate: string;
  articlesToDelete?: number;
  commentsToDelete?: number;
  deletedArticles?: number;
  deletedComments?: number;
}

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// --- 시스템 현황 섹션 ---
function SystemStats() {
  const { data: stats, error } = useSWR<AdminStats>(
    "/api/admin/stats",
    fetcher,
    { refreshInterval: 5000 }
  );

  if (error) {
    return (
      <p className="text-sm text-red-400">시스템 현황을 불러올 수 없습니다.</p>
    );
  }

  if (!stats) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-400">
        <Loader2 className="size-4 animate-spin" />
        현황 로딩 중...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 총계 카드 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Users} label="총 셀럽" value={stats.totalCelebrities} />
        <StatCard icon={FileText} label="총 기사" value={stats.totalArticles} />
        <StatCard icon={MessageSquare} label="총 댓글" value={stats.totalComments} />
        <StatCard icon={Calendar} label="총 이벤트" value={stats.totalEvents} />
      </div>

      {/* 오늘 활동 + 큐 상태 */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>오늘 수집 현황</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              <div>
                <p className="text-2xl font-bold text-zinc-100">{stats.todayArticles.toLocaleString()}</p>
                <p className="text-xs text-zinc-400">기사</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-zinc-100">{stats.todayComments.toLocaleString()}</p>
                <p className="text-xs text-zinc-400">댓글</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>크롤링 큐 상태</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-6">
              <div>
                <p className="text-2xl font-bold text-yellow-400">{stats.queue.waiting}</p>
                <p className="text-xs text-zinc-400">대기</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-blue-400">{stats.queue.active}</p>
                <p className="text-xs text-zinc-400">활성</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400">{stats.queue.failed}</p>
                <p className="text-xs text-zinc-400">실패</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3 pt-4">
        <div className="rounded-lg bg-zinc-800 p-2">
          <Icon className="size-5 text-zinc-300" />
        </div>
        <div>
          <p className="text-2xl font-bold text-zinc-100">{value.toLocaleString()}</p>
          <p className="text-xs text-zinc-400">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// --- 데이터 정리 섹션 ---
function DataCleanup() {
  const [days, setDays] = useState("90");
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<CleanupResult | null>(null);

  const runCleanup = async (dryRun: boolean) => {
    const numDays = parseInt(days);
    if (isNaN(numDays) || numDays < 30) {
      alert("30일 이상 입력해주세요.");
      return;
    }

    if (!dryRun) {
      const confirmed = confirm(
        `${numDays}일 이전의 기사와 댓글을 영구 삭제합니다.\n이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?`
      );
      if (!confirmed) return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/admin/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: numDays, dryRun }),
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "오류가 발생했습니다.");
        return;
      }

      const data: CleanupResult = await res.json();
      setResult(data);
    } catch {
      alert("요청 중 오류가 발생했습니다.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>데이터 정리</CardTitle>
        <CardDescription>
          오래된 기사와 댓글을 삭제합니다. 미리보기(dry-run)로 먼저 확인하세요.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <label className="mb-1 block text-xs text-zinc-400">보관 기간 (일)</label>
            <Input
              type="number"
              min={30}
              value={days}
              onChange={(e) => setDays(e.target.value)}
              placeholder="90"
            />
          </div>
          <Button
            variant="outline"
            onClick={() => runCleanup(true)}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Eye className="mr-2 size-4" />}
            미리보기
          </Button>
          <Button
            variant="destructive"
            onClick={() => runCleanup(false)}
            disabled={isLoading}
          >
            {isLoading ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Trash2 className="mr-2 size-4" />}
            삭제 실행
          </Button>
        </div>

        {result && (
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4 text-sm">
            <p className="mb-2 font-medium text-zinc-200">
              {result.dryRun ? "미리보기 결과" : "삭제 완료"}
            </p>
            <p className="text-zinc-400">
              기준일: {new Date(result.cutoffDate).toLocaleDateString("ko-KR")} 이전
            </p>
            <div className="mt-2 flex gap-6">
              <div>
                <p className="text-lg font-bold text-zinc-100">
                  {(result.dryRun ? result.articlesToDelete : result.deletedArticles)?.toLocaleString()}
                </p>
                <p className="text-xs text-zinc-400">기사</p>
              </div>
              <div>
                <p className="text-lg font-bold text-zinc-100">
                  {(result.dryRun ? result.commentsToDelete : result.deletedComments)?.toLocaleString()}
                </p>
                <p className="text-xs text-zinc-400">댓글</p>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// --- 메인 페이지 ---
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
    <div className="space-y-8">
      {/* 시스템 현황 */}
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-zinc-100">시스템 현황</h1>
        <SystemStats />
        <DataCleanup />
      </div>

      {/* 구분선 */}
      <hr className="border-zinc-800" />

      {/* 셀럽 관리 */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-zinc-100">셀럽 관리</h2>
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
    </div>
  );
}
