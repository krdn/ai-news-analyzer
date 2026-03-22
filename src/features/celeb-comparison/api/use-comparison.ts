import useSWR from "swr";

interface ComparisonCelebrity {
  id: string;
  name: string;
  category: string;
  profileImage: string | null;
}

export interface ComparisonSnapshot {
  id: string;
  periodStart: string;
  avgScore: number;
  totalComments: number;
  positiveCount: number;
  neutralCount: number;
  negativeCount: number;
}

export interface ComparisonResult {
  celebrity: ComparisonCelebrity;
  snapshots: ComparisonSnapshot[];
  topics: Record<string, number>;
}

export interface ComparisonResponse {
  results: ComparisonResult[];
  days: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

/**
 * 셀럽 비교 데이터 SWR 훅
 * ids가 2개 이상일 때만 fetch
 */
export function useComparison(ids: string[], days: number = 30) {
  const shouldFetch = ids.length >= 2;
  const key = shouldFetch
    ? `/api/compare?ids=${ids.join(",")}&days=${days}`
    : null;

  const { data, error, isLoading } = useSWR<ComparisonResponse>(key, fetcher, {
    refreshInterval: 60_000,
  });

  return {
    data,
    results: data?.results ?? [],
    error,
    isLoading: shouldFetch && isLoading,
  };
}
