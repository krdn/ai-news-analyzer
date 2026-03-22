"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Clock, GitCompareArrows, Settings, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "대시보드", icon: BarChart3 },
  { href: "/events", label: "이벤트 타임라인", icon: Clock },
  { href: "/compare", label: "셀럽 비교", icon: GitCompareArrows },
  { href: "/admin", label: "셀럽 관리", icon: Users },
  { href: "/admin/crawler", label: "크롤러 상태", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="flex h-screen w-64 flex-col border-r border-zinc-800 bg-zinc-950 p-4">
      <div className="mb-8">
        <h1 className="text-lg font-semibold text-zinc-100">셀럽 뉴스 분석기</h1>
        <p className="text-xs text-zinc-500">여론 감성 추적</p>
      </div>
      <nav className="flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-zinc-800 text-zinc-100"
                  : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-200"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
