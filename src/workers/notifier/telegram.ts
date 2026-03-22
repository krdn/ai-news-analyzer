/**
 * Telegram 알림 발송기
 * 이벤트 감지 시 Telegram Bot API를 통해 알림 메시지를 발송합니다.
 */
import axios from "axios";

/** 이벤트 알림에 필요한 데이터 */
export interface EventAlertData {
  title: string;
  sentimentBefore: number;
  sentimentAfter: number;
  impactScore: number;
  eventDate: string;
}

/**
 * 감성 점수를 부호 포함 문자열로 포맷한다.
 * 양수: "+0.42", 음수: "-0.31", 0: "+0.00"
 */
function formatScore(score: number): string {
  const sign = score >= 0 ? "+" : "";
  return `${sign}${score.toFixed(2)}`;
}

/**
 * 이벤트 알림 메시지를 포맷한다. (순수 함수)
 * - 하락 이벤트: 🔴
 * - 상승 이벤트: 🟢
 */
export function formatEventAlert(data: EventAlertData, name: string): string {
  const isDecline = data.sentimentAfter < data.sentimentBefore;
  const emoji = isDecline ? "🔴" : "🟢";
  const direction = isDecline ? "하락" : "상승";
  const impactPercent = Math.round(data.impactScore * 100);

  const date = new Date(data.eventDate);
  const dateStr = date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return [
    `${emoji} *감성 급변 감지 (${direction})*`,
    ``,
    `👤 *${name}*`,
    `📊 감성 점수: ${formatScore(data.sentimentBefore)} → ${formatScore(data.sentimentAfter)}`,
    `⚡ 영향도: ${impactPercent}%`,
    `🕐 감지 시각: ${dateStr}`,
    ``,
    `📋 ${data.title}`,
  ].join("\n");
}

/**
 * Telegram Bot API를 통해 메시지를 발송한다.
 * 환경 변수: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID
 */
export async function sendTelegramMessage(text: string): Promise<void> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    throw new Error(
      "TELEGRAM_BOT_TOKEN 및 TELEGRAM_CHAT_ID 환경 변수가 필요합니다"
    );
  }

  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  await axios.post(url, {
    chat_id: chatId,
    text,
    parse_mode: "Markdown",
  });
}
