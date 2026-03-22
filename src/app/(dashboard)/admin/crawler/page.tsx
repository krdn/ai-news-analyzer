"use client";

import { useState } from "react";
import { RefreshCw, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCelebrities } from "@/entities/celebrity/api/use-celebrities";
import { CATEGORY_LABELS } from "@/entities/celebrity";

export default function CrawlerPage() {
  const { data: celebrities, isLoading } = useCelebrities();
  const [triggeringAll, setTriggeringAll] = useState(false);
  const [triggeringIds, setTriggeringIds] = useState<Set<string>>(new Set());

  // 전체 크롤링 트리거
  async function handleCrawlAll() {
    setTriggeringAll(true);
    try {
      const res = await fetch("/api/crawl/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      alert(data.message || data.error);
    } catch {
      alert("크롤링 트리거에 실패했습니다");
    } finally {
      setTriggeringAll(false);
    }
  }

  // 개별 크롤링 트리거
  async function handleCrawlOne(celebrityId: string) {
    setTriggeringIds((prev) => new Set(prev).add(celebrityId));
    try {
      const res = await fetch("/api/crawl/trigger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ celebrityId }),
      });
      const data = await res.json();
      alert(data.message || data.error);
    } catch {
      alert("크롤링 트리거에 실패했습니다");
    } finally {
      setTriggeringIds((prev) => {
        const next = new Set(prev);
        next.delete(celebrityId);
        return next;
      });
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">크롤러 상태</h1>
        <Button onClick={handleCrawlAll} disabled={triggeringAll}>
          {triggeringAll ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" />
          )}
          전체 크롤링
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !celebrities?.length ? (
        <p className="text-muted-foreground py-12 text-center">
          등록된 셀럽이 없습니다.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {celebrities.map((celeb) => {
            const isTriggeringThis = triggeringIds.has(celeb.id);
            return (
              <Card key={celeb.id}>
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
                <CardContent>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    disabled={isTriggeringThis}
                    onClick={() => handleCrawlOne(celeb.id)}
                  >
                    {isTriggeringThis ? (
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="mr-2 h-4 w-4" />
                    )}
                    수집 시작
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
