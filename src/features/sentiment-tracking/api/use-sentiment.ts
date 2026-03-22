import useSWR from "swr";
import type { SentimentResponse } from "../model/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * 감성 데이터 SWR 훅
 * 60초 간격으로 자동 갱신
 */
export function useSentiment(
  celebrityId: string | null,
  period: "HOURLY" | "DAILY" | "WEEKLY" = "DAILY",
  days: number = 30
) {
  const { data, error, isLoading, mutate } = useSWR<SentimentResponse>(
    celebrityId
      ? `/api/sentiment/${celebrityId}?period=${period}&days=${days}`
      : null,
    fetcher,
    { refreshInterval: 60_000 }
  );

  return {
    data,
    snapshots: data?.snapshots ?? [],
    recentComments: data?.recentComments ?? [],
    error,
    isLoading,
    mutate,
  };
}
