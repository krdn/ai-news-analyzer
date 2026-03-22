"use client";

import useSWR from "swr";
import type { Celebrity } from "@prisma/client";

const fetcher = (url: string) => fetch(url).then((r) => r.json());

// celebrities API가 { data: [...], nextCursor } 또는 [...] 형태로 반환
const listFetcher = (url: string) =>
  fetch(url)
    .then((r) => r.json())
    .then((res) => (Array.isArray(res) ? res : res.data ?? []));

export function useCelebrities(query?: string) {
  const params = query ? `?q=${encodeURIComponent(query)}` : "";
  return useSWR<Celebrity[]>(`/api/celebrities${params}`, listFetcher);
}

export function useCelebrity(id: string) {
  return useSWR<Celebrity>(id ? `/api/celebrities/${id}` : null, fetcher);
}
