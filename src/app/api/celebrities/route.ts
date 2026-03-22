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

  const celebrities = await prisma.celebrity.findMany({
    where,
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

  return NextResponse.json(celebrities);
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
