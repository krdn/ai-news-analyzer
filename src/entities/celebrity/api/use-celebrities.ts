import useSWR from "swr";
import type { Celebrity } from "@prisma/client";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

export function useCelebrities(query?: string) {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  return useSWR<Celebrity[]>(`/api/celebrities${params}`, fetcher);
}

export function useCelebrity(id: string) {
  return useSWR<Celebrity>(id ? `/api/celebrities/${id}` : null, fetcher);
}
