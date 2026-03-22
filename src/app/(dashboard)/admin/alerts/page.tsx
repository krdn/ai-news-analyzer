"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import { Plus, Trash2, Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { useCelebrities } from "@/entities/celebrity/api/use-celebrities";

// 타입 정의
interface AlertItem {
  id: string;
  celebrityId: string;
  alertType: string;
  threshold: number;
  channel: string;
  channelConfig: Record<string, unknown>;
  enabled: boolean;
  lastTriggeredAt: string | null;
  createdAt: string;
  celebrity: { id: string; name: string };
}

const ALERT_TYPE_LABELS: Record<string, string> = {
  sentiment_drop: "감성 하락",
  sentiment_spike: "감성 상승",
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatTime(dateStr: string | null) {
  if (!dateStr) return "-";
  return new Date(dateStr).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
}

export default function AlertsPage() {
  const { data: alerts, mutate } = useSWR<AlertItem[]>("/api/alerts", fetcher);
  const { data: celebrities } = useCelebrities();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // 폼 상태
  const [formCelebrityId, setFormCelebrityId] = useState("");
  const [formAlertType, setFormAlertType] = useState("sentiment_drop");
  const [formThreshold, setFormThreshold] = useState("0.3");
  const [formChatId, setFormChatId] = useState("");

  const resetForm = () => {
    setFormCelebrityId("");
    setFormAlertType("sentiment_drop");
    setFormThreshold("0.3");
    setFormChatId("");
  };

  // 알림 생성
  const handleCreate = async () => {
    if (!formCelebrityId) return;
    setIsCreating(true);
    try {
      const res = await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          celebrityId: formCelebrityId,
          alertType: formAlertType,
          threshold: parseFloat(formThreshold),
          channel: "telegram",
          channelConfig: { chatId: formChatId },
        }),
      });
      if (!res.ok) throw new Error("생성 실패");
      await mutate();
      setDialogOpen(false);
      resetForm();
    } catch (err) {
      console.error("알림 생성 오류:", err);
    } finally {
      setIsCreating(false);
    }
  };

  // 활성/비활성 토글
  const toggleEnabled = useCallback(
    async (alert: AlertItem) => {
      try {
        await fetch(`/api/alerts/${alert.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled: !alert.enabled }),
        });
        await mutate();
      } catch (err) {
        console.error("알림 토글 오류:", err);
      }
    },
    [mutate]
  );

  // 알림 삭제
  const handleDelete = useCallback(
    async (id: string) => {
      if (!confirm("이 알림을 삭제하시겠습니까?")) return;
      try {
        await fetch(`/api/alerts/${id}`, { method: "DELETE" });
        await mutate();
      } catch (err) {
        console.error("알림 삭제 오류:", err);
      }
    },
    [mutate]
  );

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-zinc-100">알림 설정</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 size-4" />
          알림 추가
        </Button>
      </div>

      {/* 알림 목록 */}
      {!alerts ? (
        <p className="text-sm text-zinc-400">로딩 중...</p>
      ) : alerts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-zinc-800 py-12 text-zinc-400">
          <p className="text-lg">등록된 알림이 없습니다</p>
          <p className="mt-1 text-sm">
            알림 추가 버튼을 눌러 새로운 알림 규칙을 등록하세요.
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-zinc-800">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>셀럽</TableHead>
                <TableHead>유형</TableHead>
                <TableHead>임계값</TableHead>
                <TableHead>채널</TableHead>
                <TableHead>상태</TableHead>
                <TableHead>마지막 발동</TableHead>
                <TableHead className="w-[100px]">작업</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.map((alert) => (
                <TableRow key={alert.id}>
                  <TableCell className="font-medium">
                    {alert.celebrity.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType}
                    </Badge>
                  </TableCell>
                  <TableCell>{alert.threshold.toFixed(2)}</TableCell>
                  <TableCell>{alert.channel}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleEnabled(alert)}
                      className={
                        alert.enabled ? "text-green-400" : "text-zinc-500"
                      }
                    >
                      {alert.enabled ? (
                        <>
                          <Bell className="mr-1 size-4" />
                          활성
                        </>
                      ) : (
                        <>
                          <BellOff className="mr-1 size-4" />
                          비활성
                        </>
                      )}
                    </Button>
                  </TableCell>
                  <TableCell className="text-zinc-400">
                    {formatTime(alert.lastTriggeredAt)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-red-400 hover:text-red-300"
                      onClick={() => handleDelete(alert.id)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 알림 추가 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>알림 추가</DialogTitle>
            <DialogDescription>
              셀럽의 감성 변화를 감지하는 알림 규칙을 설정합니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* 셀럽 선택 */}
            <div className="space-y-2">
              <Label>셀럽</Label>
              <select
                value={formCelebrityId}
                onChange={(e) => setFormCelebrityId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1 text-sm text-zinc-100 shadow-sm transition-colors placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
              >
                <option value="">셀럽을 선택하세요</option>
                {celebrities?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            {/* 알림 유형 */}
            <div className="space-y-2">
              <Label>알림 유형</Label>
              <select
                value={formAlertType}
                onChange={(e) => setFormAlertType(e.target.value)}
                className="flex h-9 w-full rounded-md border border-zinc-800 bg-zinc-950 px-3 py-1 text-sm text-zinc-100 shadow-sm transition-colors placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-700"
              >
                <option value="sentiment_drop">감성 하락</option>
                <option value="sentiment_spike">감성 상승</option>
              </select>
            </div>

            {/* 임계값 */}
            <div className="space-y-2">
              <Label>임계값 (0 ~ 1)</Label>
              <Input
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={formThreshold}
                onChange={(e) => setFormThreshold(e.target.value)}
                placeholder="0.3"
              />
              <p className="text-xs text-zinc-500">
                감성 점수 변화가 이 값을 초과하면 알림을 발송합니다.
              </p>
            </div>

            {/* Telegram Chat ID */}
            <div className="space-y-2">
              <Label>Telegram Chat ID</Label>
              <Input
                value={formChatId}
                onChange={(e) => setFormChatId(e.target.value)}
                placeholder="Telegram 채팅 ID를 입력하세요"
              />
            </div>

            {/* 생성 버튼 */}
            <Button
              className="w-full"
              onClick={handleCreate}
              disabled={!formCelebrityId || isCreating}
            >
              {isCreating ? "생성 중..." : "알림 추가"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
