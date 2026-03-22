import useSWR from "swr";
import type { EventWithRelations } from "@/entities/event";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useEvents(celebrityId?: string, days: number = 30) {
  const params = new URLSearchParams();
  if (celebrityId) params.set("celebrityId", celebrityId);
  params.set("days", String(days));

  return useSWR<EventWithRelations[]>(
    `/api/events?${params.toString()}`,
    fetcher,
    { refreshInterval: 60_000 }
  );
}
