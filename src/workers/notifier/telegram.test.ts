import { describe, it, expect, vi, beforeEach } from "vitest";
import { formatEventAlert, sendTelegramMessage } from "./telegram";

describe("Telegram 알림", () => {
  it("하락 이벤트 메시지를 포맷한다", () => {
    const msg = formatEventAlert(
      {
        title: "홍길동 감성 급변 감지 (하락)",
        sentimentBefore: 0.42,
        sentimentAfter: -0.31,
        impactScore: 0.85,
        eventDate: "2026-03-22T14:00:00Z",
      },
      "홍길동"
    );
    expect(msg).toContain("🔴");
    expect(msg).toContain("홍길동");
    expect(msg).toContain("+0.42");
    expect(msg).toContain("-0.31");
    expect(msg).toContain("85%");
  });

  it("상승 이벤트는 🟢 이모지", () => {
    const msg = formatEventAlert(
      {
        title: "김영희 감성 급변 감지 (상승)",
        sentimentBefore: 0.05,
        sentimentAfter: 0.67,
        impactScore: 0.62,
        eventDate: "2026-03-22T09:00:00Z",
      },
      "김영희"
    );
    expect(msg).toContain("🟢");
  });

  it("impactScore를 퍼센트로 표시한다", () => {
    const msg = formatEventAlert(
      {
        title: "테스트 이벤트",
        sentimentBefore: 0.1,
        sentimentAfter: 0.9,
        impactScore: 0.73,
        eventDate: "2026-03-22T12:00:00Z",
      },
      "테스트"
    );
    expect(msg).toContain("73%");
  });

  it("감성 점수에 부호를 붙인다", () => {
    const msg = formatEventAlert(
      {
        title: "테스트",
        sentimentBefore: 0.0,
        sentimentAfter: -0.5,
        impactScore: 0.5,
        eventDate: "2026-03-22T12:00:00Z",
      },
      "테스트"
    );
    // 0.00은 "+0.00"으로 표시
    expect(msg).toContain("+0.00");
    expect(msg).toContain("-0.50");
  });

  describe("sendTelegramMessage", () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it("BOT_TOKEN 또는 CHAT_ID가 없으면 에러를 던진다", async () => {
      // 환경 변수 없이 호출
      const originalToken = process.env.TELEGRAM_BOT_TOKEN;
      const originalChatId = process.env.TELEGRAM_CHAT_ID;
      delete process.env.TELEGRAM_BOT_TOKEN;
      delete process.env.TELEGRAM_CHAT_ID;

      await expect(sendTelegramMessage("test")).rejects.toThrow(
        "TELEGRAM_BOT_TOKEN"
      );

      // 복원
      if (originalToken) process.env.TELEGRAM_BOT_TOKEN = originalToken;
      if (originalChatId) process.env.TELEGRAM_CHAT_ID = originalChatId;
    });
  });
});
