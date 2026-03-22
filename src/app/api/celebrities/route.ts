import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import { createCelebritySchema } from "@/entities/celebrity";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const category = searchParams.get("category");

  const where: Record<string, unknown> = {};

  if (query) {
    where.OR = [
      { name: { contains: query, mode: "insensitive" } },
      { aliases: { has: query } },
    ];
  }

  if (category) {
    where.category = category;
  }

  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 100);
  const cursor = searchParams.get("cursor");

  const celebrities = await prisma.celebrity.findMany({
    where,
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      aliases: true,
      category: true,
      profileImage: true,
      description: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const hasNext = celebrities.length > limit;
  const data = hasNext ? celebrities.slice(0, -1) : celebrities;
  const nextCursor = hasNext ? data[data.length - 1].id : null;

  return NextResponse.json({ data, nextCursor });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createCelebritySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "유효하지 않은 데이터", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const celebrity = await prisma.celebrity.create({ data: parsed.data });
  return NextResponse.json(celebrity, { status: 201 });
}
