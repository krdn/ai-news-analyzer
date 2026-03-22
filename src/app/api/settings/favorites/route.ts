import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";

const SETTING_KEY = "favorite_celebrities";

// GET: 즐겨찾기 셀럽 ID 목록 반환
export async function GET() {
  const setting = await prisma.appSetting.findUnique({
    where: { key: SETTING_KEY },
  });

  const favorites: string[] = setting
    ? (setting.value as string[])
    : [];

  return NextResponse.json({ favorites });
}

// POST: 즐겨찾기 추가/제거
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { celebrityId, action } = body as {
    celebrityId: string;
    action: "add" | "remove";
  };

  if (!celebrityId || !["add", "remove"].includes(action)) {
    return NextResponse.json(
      { error: "celebrityId와 action(add|remove)이 필요합니다." },
      { status: 400 }
    );
  }

  // 현재 즐겨찾기 조회
  const existing = await prisma.appSetting.findUnique({
    where: { key: SETTING_KEY },
  });

  let favorites: string[] = existing
    ? (existing.value as string[])
    : [];

  if (action === "add") {
    if (!favorites.includes(celebrityId)) {
      favorites = [...favorites, celebrityId];
    }
  } else {
    favorites = favorites.filter((id) => id !== celebrityId);
  }

  // upsert로 저장
  await prisma.appSetting.upsert({
    where: { key: SETTING_KEY },
    update: { value: favorites },
    create: { key: SETTING_KEY, value: favorites },
  });

  return NextResponse.json({ favorites });
}
