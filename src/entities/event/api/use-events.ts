"use client";

import useSWR from "swr";
import type { EventWithRelations } from "@/entities/event";

const fetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((res) => ({
      events: Array.isArray(res) ? res : (res.data ?? res.events ?? []),
      total: res.total ?? (Array.isArray(res) ? res.length : (res.data?.length ?? 0)),
    }));

export function useEvents(celebrityId?: string, days: number = 30) {
  const params = new URLSearchParams();
  if (celebrityId) params.set("celebrityId", celebrityId);
  params.set("days", String(days));

  return useSWR<{ events: EventWithRelations[]; total: number }>(
    `/api/events?${params.toString()}`,
    fetcher,
    { refreshInterval: 60_000 }
  );
}
