"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface FavoriteToggleProps {
  celebrityId: string;
  initialFavorite: boolean;
}

export function FavoriteToggle({
  celebrityId,
  initialFavorite,
}: FavoriteToggleProps) {
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const toggle = useCallback(
    async (e: React.MouseEvent) => {
      // Link 클릭 전파 방지
      e.preventDefault();
      e.stopPropagation();

      if (isLoading) return;
      setIsLoading(true);

      const action = isFavorite ? "remove" : "add";

      try {
        const res = await fetch("/api/settings/favorites", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ celebrityId, action }),
        });

        if (res.ok) {
          setIsFavorite(!isFavorite);
          router.refresh();
        }
      } finally {
        setIsLoading(false);
      }
    },
    [celebrityId, isFavorite, isLoading, router]
  );

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={isLoading}
      className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-lg transition-colors hover:bg-zinc-700/50 disabled:opacity-50"
      aria-label={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
      title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
    >
      {isFavorite ? (
        <span className="text-yellow-400">&#9733;</span>
      ) : (
        <span className="text-zinc-600 hover:text-zinc-400">&#9734;</span>
      )}
    </button>
  );
}
