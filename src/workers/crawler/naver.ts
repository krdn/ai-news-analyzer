import axios from "axios";
import * as cheerio from "cheerio";
import type {
  CrawlerPlugin,
  CrawlerResult,
  ParsedArticle as CrawlerParsedArticle,
  ParsedComment as CrawlerParsedComment,
} from "./types";

// --- 타입 정의 ---

interface NaverSearchItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
}

interface NaverSearchResponse {
  items: NaverSearchItem[];
}

interface ParsedArticle {
  title: string;
  content: string;
  sourceUrl: string;
  sourceType: "NAVER";
  celebrityId: string;
  publishedAt: Date;
}

interface RawNaverComment {
  contents: string;
  userName: string;
  sympathyCount: number;
  antipathyCount: number;
  modTime: string;
}

interface ParsedComment {
  content: string;
  author: string;
  likes: number;
  publishedAt: Date;
}

// --- HTML 태그 제거 유틸리티 ---

function stripHtml(html: string): string {
  const $ = cheerio.load("<span>" + html + "</span>");
  return $("span").text();
}

// --- 파서 함수 ---

/** 네이버 검색 API 응답을 파싱하여 기사 목록으로 변환 */
export function parseNaverSearchResponse(
  response: NaverSearchResponse,
  celebrityId: string
): ParsedArticle[] {
  return response.items.map((item) => ({
    title: stripHtml(item.title),
    content: stripHtml(item.description),
    sourceUrl: item.link,
    sourceType: "NAVER" as const,
    celebrityId,
    publishedAt: new Date(item.pubDate),
  }));
}

/** 네이버 댓글 원본 데이터를 파싱 */
export function parseNaverComments(
  rawComments: RawNaverComment[]
): ParsedComment[] {
  return rawComments.map((comment) => ({
    content: comment.contents,
    author: comment.userName,
    likes: comment.sympathyCount,
    publishedAt: new Date(comment.modTime),
  }));
}

// --- API 호출 함수 ---

/** 네이버 검색 API를 호출하여 뉴스 기사를 가져온다 */
export async function fetchNaverNews(
  query: string,
  celebrityId: string
): Promise<ParsedArticle[]> {
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "NAVER_CLIENT_ID와 NAVER_CLIENT_SECRET 환경 변수가 필요합니다"
    );
  }

  const { data } = await axios.get<NaverSearchResponse>(
    "https://openapi.naver.com/v1/search/news.json",
    {
      params: {
        query,
        display: 20,
        sort: "date",
      },
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    }
  );

  return parseNaverSearchResponse(data, celebrityId);
}

/** 네이버 뉴스 URL을 네이버 뉴스 기사 URL로 변환 */
function toNaverNewsUrl(url: string): string | null {
  // 이미 n.news.naver.com URL이면 그대로 사용
  if (url.includes("n.news.naver.com")) return url;
  // news.naver.com URL이면 변환
  if (url.includes("news.naver.com")) return url;
  // 외부 링크는 네이버 뉴스 댓글 수집 불가
  return null;
}

/** Playwright를 사용하여 네이버 뉴스 댓글을 수집한다 */
let _browser: any = null;

async function getBrowser() {
  if (!_browser) {
    const { chromium } = await import("playwright");
    _browser = await chromium.launch({ headless: true });
  }
  return _browser;
}

export async function fetchNaverComments(
  articleUrl: string
): Promise<ParsedComment[]> {
  const newsUrl = toNaverNewsUrl(articleUrl);
  if (!newsUrl) return [];

  try {
    const browser = await getBrowser();
    const page = await browser.newPage({
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    });

    await page.goto(newsUrl, { waitUntil: "domcontentloaded", timeout: 15000 });

    // 댓글 영역이 로드될 때까지 대기 (최대 5초)
    try {
      await page.waitForSelector(".u_cbox_comment_box", { timeout: 5000 });
    } catch {
      // 댓글 영역이 없는 기사 (댓글 미제공)
      await page.close();
      return [];
    }

    // "더보기" 버튼 반복 클릭 (최대 5회, 더 많은 댓글 로드)
    for (let i = 0; i < 5; i++) {
      try {
        const moreBtn = await page.$(".u_cbox_btn_more");
        if (!moreBtn) break;
        const isVisible = await moreBtn.isVisible();
        if (!isVisible) break;
        await moreBtn.click();
        await page.waitForTimeout(1000);
      } catch {
        break;
      }
    }

    // 답글 "답글 보기" 버튼 모두 클릭 (답글 펼치기)
    try {
      const replyButtons = await page.$$(".u_cbox_btn_reply");
      for (const btn of replyButtons) {
        try {
          const isVisible = await btn.isVisible();
          if (isVisible) {
            await btn.click();
            await page.waitForTimeout(500);
          }
        } catch {
          // 개별 답글 버튼 클릭 실패 무시
        }
      }
    } catch {
      // 답글 버튼이 없는 경우 무시
    }

    // 댓글 + 답글 데이터 추출
    const rawComments = await page.evaluate(() => {
      // 최상위 댓글 + 답글 모두 수집
      const commentElements = document.querySelectorAll(
        ".u_cbox_comment_box .u_cbox_area"
      );
      const results: Array<{
        contents: string;
        userName: string;
        sympathyCount: number;
        antipathyCount: number;
        modTime: string;
      }> = [];

      commentElements.forEach((el) => {
        const content =
          el.querySelector(".u_cbox_contents")?.textContent?.trim() ?? "";
        const author =
          el.querySelector(".u_cbox_nick")?.textContent?.trim() ?? "익명";
        const likesText =
          el.querySelector(".u_cbox_cnt_recomm")?.textContent?.trim() ?? "0";
        const dislikesText =
          el.querySelector(".u_cbox_cnt_unrecomm")?.textContent?.trim() ?? "0";
        const dateText =
          el.querySelector(".u_cbox_date")?.getAttribute("data-value") ??
          el.querySelector(".u_cbox_date")?.textContent?.trim() ??
          "";

        if (content) {
          results.push({
            contents: content,
            userName: author,
            sympathyCount: parseInt(likesText) || 0,
            antipathyCount: parseInt(dislikesText) || 0,
            modTime: dateText,
          });
        }
      });

      return results;
    });

    await page.close();

    if (rawComments.length > 0) {
      console.log(
        `[Naver] 댓글 ${rawComments.length}개 수집: ${newsUrl.substring(0, 60)}...`
      );
    }

    return parseNaverComments(rawComments);
  } catch (err) {
    console.warn(`댓글 가져오기 실패: ${articleUrl}`, (err as Error).message);
    return [];
  }
}

/** Playwright 브라우저 정리 */
export async function closeNaverBrowser() {
  if (_browser) {
    await _browser.close();
    _browser = null;
  }
}

// --- CrawlerPlugin 구현 ---

/** CrawlerPlugin 인터페이스를 구현한 네이버 크롤러 */
export class NaverCrawlerPlugin implements CrawlerPlugin {
  sourceType = "NAVER" as const;

  async crawl(
    celebrityId: string,
    keywords: string[]
  ): Promise<CrawlerResult> {
    const articles: CrawlerParsedArticle[] = [];
    const comments = new Map<string, CrawlerParsedComment[]>();

    for (const keyword of keywords) {
      const fetched = await fetchNaverNews(keyword, celebrityId);

      for (const article of fetched) {
        articles.push({
          celebrityId: article.celebrityId,
          sourceType: article.sourceType,
          sourceUrl: article.sourceUrl,
          title: article.title,
          content: article.content,
          publishedAt: article.publishedAt,
        });

        const articleComments = await fetchNaverComments(article.sourceUrl);
        if (articleComments.length > 0) {
          comments.set(
            article.sourceUrl,
            articleComments.map((c) => ({
              content: c.content,
              author: c.author,
              likes: c.likes,
              publishedAt: c.publishedAt,
            }))
          );
        }
      }
    }

    return { articles, comments };
  }
}

// --- 메인 크롤 함수 ---

/** 특정 셀러브리티에 대해 네이버 뉴스를 크롤링한다 */
export async function crawlNaverForCelebrity(
  celebrityId: string
): Promise<void> {
  // DB/큐 의존성을 런타임에 로드 (테스트 시 사이드이펙트 방지)
  const { prisma } = await import("@/shared/lib/prisma");
  const { analysisQueue } = await import("@/shared/lib/queue");

  // 셀러브리티 정보 및 검색 키워드 조회
  const celebrity = await prisma.celebrity.findUnique({
    where: { id: celebrityId },
    include: {
      sources: {
        where: { sourceType: "NAVER", enabled: true },
      },
    },
  });

  if (!celebrity) {
    throw new Error(`셀러브리티를 찾을 수 없습니다: ${celebrityId}`);
  }

  // 검색 키워드 수집 (소스에서 + 이름/별칭)
  const keywords: string[] = [];
  for (const source of celebrity.sources) {
    keywords.push(...source.searchKeywords);
  }
  if (keywords.length === 0) {
    keywords.push(celebrity.name, ...celebrity.aliases);
  }

  // 각 키워드로 뉴스 검색
  for (const keyword of keywords) {
    const articles = await fetchNaverNews(keyword, celebrityId);

    for (const article of articles) {
      // 중복 체크: sourceUrl로 이미 존재하는지 확인
      const existing = await prisma.article.findUnique({
        where: { sourceUrl: article.sourceUrl },
      });

      if (existing) {
        continue;
      }

      // 기사 저장
      const savedArticle = await prisma.article.create({
        data: {
          celebrityId: article.celebrityId,
          sourceType: article.sourceType,
          sourceUrl: article.sourceUrl,
          title: article.title,
          content: article.content,
          publishedAt: article.publishedAt,
        },
      });

      // 댓글 가져오기 및 저장
      const comments = await fetchNaverComments(article.sourceUrl);
      if (comments.length > 0) {
        await prisma.comment.createMany({
          data: comments.map((comment) => ({
            articleId: savedArticle.id,
            content: comment.content,
            author: comment.author,
            likes: comment.likes,
            publishedAt: comment.publishedAt,
          })),
        });
      }

      // 분석 큐에 추가
      await analysisQueue.add("analyze-article", {
        articleId: savedArticle.id,
        celebrityId,
      });
    }
  }
}
