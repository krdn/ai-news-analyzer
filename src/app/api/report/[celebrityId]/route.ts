import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import React from "react";

// --- 타입 정의 ---
interface ReportData {
  celebrity: { name: string; category: string };
  snapshots: {
    avgScore: number;
    totalComments: number;
    positiveCount: number;
    neutralCount: number;
    negativeCount: number;
    topTopics: Record<string, number> | null;
  }[];
  events: {
    title: string;
    eventDate: Date;
    impactScore: number;
    sentimentBefore: number;
    sentimentAfter: number;
  }[];
  sourceStats: { sourceType: string; articleCount: number; commentCount: number }[];
  period: { from: string; to: string; days: number };
}

// PDF 문서를 생성하고 Buffer로 반환
async function generatePdfBuffer(data: ReportData): Promise<Buffer> {
  // 동적 import로 @react-pdf/renderer 로드 (ESM 호환)
  const {
    Document,
    Page,
    Text,
    View,
    StyleSheet,
    renderToBuffer,
  } = await import("@react-pdf/renderer");

  const styles = StyleSheet.create({
    page: {
      padding: 40,
      fontSize: 10,
      fontFamily: "Helvetica",
      color: "#1a1a1a",
    },
    header: {
      marginBottom: 20,
      borderBottomWidth: 2,
      borderBottomColor: "#2563eb",
      paddingBottom: 12,
    },
    title: {
      fontSize: 22,
      fontWeight: "bold",
      color: "#1e3a5f",
      marginBottom: 4,
    },
    subtitle: {
      fontSize: 11,
      color: "#6b7280",
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: "bold",
      color: "#1e3a5f",
      marginTop: 18,
      marginBottom: 8,
      borderBottomWidth: 1,
      borderBottomColor: "#e5e7eb",
      paddingBottom: 4,
    },
    row: {
      flexDirection: "row",
      borderBottomWidth: 1,
      borderBottomColor: "#f3f4f6",
      paddingVertical: 4,
    },
    headerRow: {
      flexDirection: "row",
      backgroundColor: "#f1f5f9",
      paddingVertical: 5,
      borderBottomWidth: 1,
      borderBottomColor: "#cbd5e1",
    },
    cell: {
      flex: 1,
      paddingHorizontal: 4,
    },
    cellSmall: {
      width: 60,
      paddingHorizontal: 4,
    },
    cellWide: {
      flex: 2,
      paddingHorizontal: 4,
    },
    bold: {
      fontWeight: "bold",
    },
    statsGrid: {
      flexDirection: "row",
      gap: 12,
      marginBottom: 8,
    },
    statBox: {
      flex: 1,
      backgroundColor: "#f8fafc",
      borderRadius: 4,
      padding: 10,
      borderWidth: 1,
      borderColor: "#e2e8f0",
    },
    statLabel: {
      fontSize: 8,
      color: "#6b7280",
      marginBottom: 2,
    },
    statValue: {
      fontSize: 16,
      fontWeight: "bold",
      color: "#1e3a5f",
    },
    footer: {
      position: "absolute",
      bottom: 30,
      left: 40,
      right: 40,
      textAlign: "center",
      fontSize: 8,
      color: "#9ca3af",
      borderTopWidth: 1,
      borderTopColor: "#e5e7eb",
      paddingTop: 8,
    },
    positive: { color: "#16a34a" },
    negative: { color: "#dc2626" },
    neutral: { color: "#6b7280" },
  });

  const { celebrity, snapshots, events, sourceStats, period } = data;

  // 감성 요약 계산
  const totalComments = snapshots.reduce((s, sn) => s + sn.totalComments, 0);
  const totalPositive = snapshots.reduce((s, sn) => s + sn.positiveCount, 0);
  const totalNeutral = snapshots.reduce((s, sn) => s + sn.neutralCount, 0);
  const totalNegative = snapshots.reduce((s, sn) => s + sn.negativeCount, 0);
  const avgScore =
    snapshots.length > 0
      ? snapshots.reduce((s, sn) => s + sn.avgScore, 0) / snapshots.length
      : 0;

  const pctPositive = totalComments > 0 ? ((totalPositive / totalComments) * 100).toFixed(1) : "0";
  const pctNeutral = totalComments > 0 ? ((totalNeutral / totalComments) * 100).toFixed(1) : "0";
  const pctNegative = totalComments > 0 ? ((totalNegative / totalComments) * 100).toFixed(1) : "0";

  // 주제별 감성 집계
  const topicMap: Record<string, { total: number; count: number }> = {};
  for (const sn of snapshots) {
    if (!sn.topTopics) continue;
    for (const [topic, score] of Object.entries(sn.topTopics)) {
      if (typeof score !== "number") continue;
      if (!topicMap[topic]) topicMap[topic] = { total: 0, count: 0 };
      topicMap[topic].total += score;
      topicMap[topic].count += 1;
    }
  }
  const topicEntries = Object.entries(topicMap)
    .map(([topic, { total, count }]) => ({ topic, avgScore: total / count }))
    .sort((a, b) => b.avgScore - a.avgScore)
    .slice(0, 15);

  const categoryLabel: Record<string, string> = {
    POLITICIAN: "Politician",
    ENTERTAINER: "Entertainer",
    OTHER: "Other",
  };

  const e = React.createElement;

  const doc = e(
    Document,
    null,
    e(
      Page,
      { size: "A4", style: styles.page },

      // 헤더
      e(
        View,
        { style: styles.header },
        e(Text, { style: styles.title }, `${celebrity.name} - Sentiment Report`),
        e(
          Text,
          { style: styles.subtitle },
          `Category: ${categoryLabel[celebrity.category] ?? celebrity.category} | Period: ${period.from} ~ ${period.to} (${period.days} days)`
        )
      ),

      // 감성 요약
      e(Text, { style: styles.sectionTitle }, "Sentiment Summary"),
      e(
        View,
        { style: styles.statsGrid },
        e(
          View,
          { style: styles.statBox },
          e(Text, { style: styles.statLabel }, "Average Score"),
          e(Text, { style: styles.statValue }, avgScore.toFixed(3))
        ),
        e(
          View,
          { style: styles.statBox },
          e(Text, { style: styles.statLabel }, "Total Comments"),
          e(Text, { style: styles.statValue }, totalComments.toLocaleString())
        ),
        e(
          View,
          { style: styles.statBox },
          e(Text, { style: styles.statLabel }, "Positive"),
          e(Text, { style: [styles.statValue, styles.positive] }, `${pctPositive}%`)
        ),
        e(
          View,
          { style: styles.statBox },
          e(Text, { style: styles.statLabel }, "Neutral"),
          e(Text, { style: [styles.statValue, styles.neutral] }, `${pctNeutral}%`)
        ),
        e(
          View,
          { style: styles.statBox },
          e(Text, { style: styles.statLabel }, "Negative"),
          e(Text, { style: [styles.statValue, styles.negative] }, `${pctNegative}%`)
        )
      ),

      // 주제별 감성
      topicEntries.length > 0
        ? e(
            View,
            null,
            e(Text, { style: styles.sectionTitle }, "Topic Sentiment"),
            e(
              View,
              { style: styles.headerRow },
              e(Text, { style: [styles.cellWide, styles.bold] }, "Topic"),
              e(Text, { style: [styles.cell, styles.bold] }, "Avg Score")
            ),
            ...topicEntries.map((t, i) =>
              e(
                View,
                { style: styles.row, key: String(i) },
                e(Text, { style: styles.cellWide }, t.topic),
                e(Text, { style: styles.cell }, t.avgScore.toFixed(3))
              )
            )
          )
        : null,

      // 최근 이벤트
      events.length > 0
        ? e(
            View,
            null,
            e(Text, { style: styles.sectionTitle }, "Recent Events"),
            e(
              View,
              { style: styles.headerRow },
              e(Text, { style: [styles.cellSmall, styles.bold] }, "Date"),
              e(Text, { style: [styles.cellWide, styles.bold] }, "Title"),
              e(Text, { style: [styles.cellSmall, styles.bold] }, "Impact"),
              e(Text, { style: [styles.cellSmall, styles.bold] }, "Before"),
              e(Text, { style: [styles.cellSmall, styles.bold] }, "After")
            ),
            ...events.slice(0, 20).map((ev, i) =>
              e(
                View,
                { style: styles.row, key: String(i) },
                e(
                  Text,
                  { style: styles.cellSmall },
                  new Date(ev.eventDate).toLocaleDateString("ko-KR", {
                    month: "2-digit",
                    day: "2-digit",
                  })
                ),
                e(Text, { style: styles.cellWide }, ev.title),
                e(Text, { style: styles.cellSmall }, ev.impactScore.toFixed(2)),
                e(Text, { style: styles.cellSmall }, ev.sentimentBefore.toFixed(3)),
                e(Text, { style: styles.cellSmall }, ev.sentimentAfter.toFixed(3))
              )
            )
          )
        : null,

      // 소스별 통계
      sourceStats.length > 0
        ? e(
            View,
            null,
            e(Text, { style: styles.sectionTitle }, "Source Statistics"),
            e(
              View,
              { style: styles.headerRow },
              e(Text, { style: [styles.cell, styles.bold] }, "Source"),
              e(Text, { style: [styles.cell, styles.bold] }, "Articles"),
              e(Text, { style: [styles.cell, styles.bold] }, "Comments")
            ),
            ...sourceStats.map((ss, i) =>
              e(
                View,
                { style: styles.row, key: String(i) },
                e(Text, { style: styles.cell }, ss.sourceType),
                e(Text, { style: styles.cell }, ss.articleCount.toLocaleString()),
                e(Text, { style: styles.cell }, ss.commentCount.toLocaleString())
              )
            )
          )
        : null,

      // 푸터
      e(
        View,
        { style: styles.footer },
        e(
          Text,
          null,
          `Generated by AI News Analyzer | ${new Date().toISOString().split("T")[0]}`
        )
      )
    )
  );

  return await renderToBuffer(doc);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ celebrityId: string }> }
) {
  try {
    const { celebrityId } = await params;
    const { searchParams } = new URL(request.url);
    const days = parseInt(searchParams.get("days") ?? "30", 10);

    const since = new Date();
    since.setDate(since.getDate() - days);
    const now = new Date();

    // 셀럽 정보 조회
    const celebrity = await prisma.celebrity.findUnique({
      where: { id: celebrityId },
      select: { name: true, category: true },
    });

    if (!celebrity) {
      return NextResponse.json(
        { error: "Celebrity not found" },
        { status: 404 }
      );
    }

    // 감성 스냅샷 조회
    const snapshots = await prisma.sentimentSnapshot.findMany({
      where: {
        celebrityId,
        periodType: "DAILY",
        periodStart: { gte: since },
      },
      orderBy: { periodStart: "asc" },
    });

    // 이벤트 조회
    const events = await prisma.event.findMany({
      where: {
        celebrityId,
        eventDate: { gte: since },
      },
      orderBy: { eventDate: "desc" },
    });

    // 소스별 기사 수 집계
    const articles = await prisma.article.groupBy({
      by: ["sourceType"],
      where: {
        celebrityId,
        collectedAt: { gte: since },
      },
      _count: { id: true },
    });

    // 소스 타입별로 댓글 수 집계
    const sourceStatsMap: Record<string, { articleCount: number; commentCount: number }> = {};
    for (const a of articles) {
      sourceStatsMap[a.sourceType] = {
        articleCount: a._count.id,
        commentCount: 0,
      };
    }

    for (const sourceType of Object.keys(sourceStatsMap)) {
      const cc = await prisma.comment.count({
        where: {
          article: {
            celebrityId,
            sourceType: sourceType as "ALL" | "NAVER" | "YOUTUBE" | "X" | "META" | "COMMUNITY",
            collectedAt: { gte: since },
          },
        },
      });
      sourceStatsMap[sourceType].commentCount = cc;
    }

    const sourceStats = Object.entries(sourceStatsMap).map(([sourceType, stats]) => ({
      sourceType,
      ...stats,
    }));

    const period = {
      from: since.toISOString().split("T")[0],
      to: now.toISOString().split("T")[0],
      days,
    };

    // PDF 생성
    const buffer = await generatePdfBuffer({
      celebrity,
      snapshots: snapshots.map((s) => ({
        avgScore: s.avgScore,
        totalComments: s.totalComments,
        positiveCount: s.positiveCount,
        neutralCount: s.neutralCount,
        negativeCount: s.negativeCount,
        topTopics: s.topTopics as Record<string, number> | null,
      })),
      events,
      sourceStats,
      period,
    });

    const filename = `${celebrity.name.replace(/[^a-zA-Z0-9가-힣]/g, "_")}_report_${period.from}_${period.to}.pdf`;

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
      },
    });
  } catch (error) {
    console.error("PDF report generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate report" },
      { status: 500 }
    );
  }
}
