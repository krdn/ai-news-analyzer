import Link from "next/link";
import { prisma } from "@/shared/lib/prisma";
import { CATEGORY_LABELS } from "@/entities/celebrity";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FavoriteToggle } from "@/entities/celebrity/ui/favorite-toggle";

export default async function DashboardPage() {
  const [celebrities, favSetting] = await Promise.all([
    prisma.celebrity.findMany({
      include: {
        _count: { select: { articles: true, snapshots: true } },
        snapshots: {
          where: { periodType: "DAILY" },
          orderBy: { periodStart: "desc" },
          take: 1,
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.appSetting.findUnique({
      where: { key: "favorite_celebrities" },
    }),
  ]);

  const favoriteIds: string[] = favSetting
    ? (favSetting.value as string[])
    : [];

  // 즐겨찾기 셀럽을 상단에 배치
  const favoriteCelebs = celebrities.filter((c) =>
    favoriteIds.includes(c.id)
  );
  const otherCelebs = celebrities.filter(
    (c) => !favoriteIds.includes(c.id)
  );

  function renderCelebCard(
    celeb: (typeof celebrities)[number],
    isFavorite: boolean
  ) {
    const latest = celeb.snapshots[0];
    return (
      <div key={celeb.id} className="relative">
        <Link href={`/celebrity/${celeb.id}`}>
          <Card className="cursor-pointer border-zinc-800 bg-zinc-900 transition-colors hover:border-zinc-700 hover:bg-zinc-800/80">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-zinc-100">
                  {celeb.name}
                </CardTitle>
                <Badge variant="outline" className="text-zinc-400">
                  {CATEGORY_LABELS[celeb.category]}
                </Badge>
              </div>
              {celeb.description && (
                <CardDescription className="line-clamp-1">
                  {celeb.description}
                </CardDescription>
              )}
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-500">
                  기사 {celeb._count.articles}건
                </span>
                {latest ? (
                  <span
                    className={
                      latest.avgScore > 0
                        ? "text-green-400"
                        : latest.avgScore < 0
                          ? "text-red-400"
                          : "text-zinc-400"
                    }
                  >
                    감성 {latest.avgScore.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-zinc-600">데이터 없음</span>
                )}
              </div>
            </CardContent>
          </Card>
        </Link>
        <FavoriteToggle
          celebrityId={celeb.id}
          initialFavorite={isFavorite}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-zinc-100">대시보드</h2>
        <p className="text-sm text-zinc-500">
          등록된 셀럽의 여론 감성을 확인하세요.
        </p>
      </div>

      {celebrities.length === 0 ? (
        <Card className="border-zinc-800 bg-zinc-900">
          <CardContent className="py-12 text-center">
            <p className="text-zinc-400">
              등록된 셀럽이 없습니다.{" "}
              <Link href="/admin" className="text-blue-400 hover:underline">
                셀럽 관리
              </Link>
              에서 추가해 주세요.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {favoriteCelebs.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-lg font-semibold text-yellow-400">
                즐겨찾기
              </h3>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {favoriteCelebs.map((celeb) =>
                  renderCelebCard(celeb, true)
                )}
              </div>
            </div>
          )}

          <div className="space-y-3">
            {favoriteCelebs.length > 0 && (
              <h3 className="text-lg font-semibold text-zinc-400">
                전체
              </h3>
            )}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {otherCelebs.map((celeb) =>
                renderCelebCard(celeb, false)
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
