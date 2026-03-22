"use client";

import type { Celebrity } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { CATEGORY_LABELS } from "@/entities/celebrity";
import { cn } from "@/lib/utils";

interface CelebrityCardProps {
  celebrity: Celebrity;
  onClick?: (celebrity: Celebrity) => void;
}

export function CelebrityCard({ celebrity, onClick }: CelebrityCardProps) {
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={() => onClick?.(celebrity)}
      onKeyDown={(e) => {
        if (onClick && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick(celebrity);
        }
      }}
      className={cn(
        "rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-zinc-100 transition-colors",
        onClick && "cursor-pointer hover:border-zinc-600 hover:bg-zinc-800/80"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold">{celebrity.name}</h3>
        <Badge variant="secondary">
          {CATEGORY_LABELS[celebrity.category]}
        </Badge>
      </div>

      {celebrity.aliases.length > 0 && (
        <p className="mt-2 text-sm text-zinc-400">
          {celebrity.aliases.join(", ")}
        </p>
      )}

      {celebrity.description && (
        <p className="mt-2 line-clamp-2 text-sm text-zinc-400">
          {celebrity.description}
        </p>
      )}
    </div>
  );
}
