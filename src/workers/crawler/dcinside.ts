import * as cheerio from "cheerio";
import type {
  CrawlerPlugin,
  CrawlerResult,
  ParsedArticle,
  ParsedComment,
} from "./types";

// --- 타입 정의 ---

interface DcPostListItem {
  postNo: string;
  galleryId: string;
  title: string;
  author: string;
  date: string;
  url: string;
}

interface RawDcComment {
  memo: string;
  name: string;
  rcnt: string;
  reg_date: string;
}

// --- User-Agent 로테이션 ---

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// --- 상수 ---

const RATE_LIMIT_MS = 3000;
const MAX_POSTS_PER_GALLERY = 20;
const MAX_CONCURRENT_TABS = 2;
const DC_BASE_URL = "https://gall.dcinside.com";

// --- 파서 함수 ---

/** 게시물 목록 HTML을 파싱하여 게시물 목록으로 변환 */
export function parsePostListHtml(
  html: string,
  galleryId: string
): DcPostListItem[] {
  if (!html || html.trim() === "") {
    return [];
  }

  // cheerio는 <tr>을 파싱하려면 <table> 컨텍스트가 필요
  const wrappedHtml = html.includes("<table") ? html : `<table>${html}</table>`;
  const $ = cheerio.load(wrappedHtml);
  const posts: DcPostListItem[] = [];

  $("tr.ub-content.us-post").each((_i, el) => {
    const $row = $(el);
    const postNo = $row.attr("data-no");
    if (!postNo) return;

    const $titleLink = $row.find("td.gall_tit.ub-word a").first();
    const title = $titleLink.text().trim();
    const href = $titleLink.attr("href") || "";

    const author =
      $row.find("td.gall_writer.ub-writer .nickname").text().trim() ||
      $row.find("td.gall_writer.ub-writer").text().trim();

    const date = $row.find("td.gall_date").text().trim();

    if (title) {
      posts.push({
        postNo,
        galleryId,
        title,
        author,
        date,
        url: href.startsWith("http") ? href : `${DC_BASE_URL}${href}`,
      });
    }
  });

  return posts;
}

/** 디시인사이드 댓글 원본 데이터를 파싱 */
export function parsePostDetailHtml(
  rawComments: RawDcComment[]
): ParsedComment[] {
  if (!rawComments || rawComments.length === 0) {
    return [];
  }

  return rawComments.map((comment) => ({
    content: comment.memo,
    author: comment.name,
    likes: parseInt(comment.rcnt, 10) || 0,
    publishedAt: new Date(comment.reg_date),
  }));
}

// --- 유틸리티 ---

/** Rate limiting을 위한 대기 함수 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- CrawlerPlugin 구현 ---

/** CrawlerPlugin 인터페이스를 구현한 디시인사이드 크롤러 */
export class DcinsideCrawlerPlugin implements CrawlerPlugin {
  sourceType = "COMMUNITY" as const;

  private browser: import("playwright").Browser | null = null;

  /** 브라우저 인스턴스를 지연 초기화하여 재사용 */
  private async getBrowser(): Promise<import("playwright").Browser> {
    if (!this.browser || !this.browser.isConnected()) {
      const { chromium } = await import("playwright");
      this.browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }
    return this.browser;
  }

  /** 브라우저 종료 */
  async closeBrowser(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /** 갤러리 목록 페이지에서 게시물 HTML을 가져온다 */
  private async fetchGalleryList(galleryId: string): Promise<string> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: getRandomUserAgent(),
    });
    const page = await context.newPage();

    try {
      const url = `${DC_BASE_URL}/board/lists/?id=${galleryId}`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      const html = await page.content();
      return html;
    } finally {
      await page.close();
      await context.close();
    }
  }

  /** 게시물의 댓글을 DC 댓글 API로 가져온다 */
  private async fetchComments(
    galleryId: string,
    postNo: string
  ): Promise<ParsedComment[]> {
    const browser = await this.getBrowser();
    const context = await browser.newContext({
      userAgent: getRandomUserAgent(),
    });
    const page = await context.newPage();

    try {
      // 게시물 상세 페이지로 이동하여 쿠키/세션 확보
      const postUrl = `${DC_BASE_URL}/board/view/?id=${galleryId}&no=${postNo}`;
      await page.goto(postUrl, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // DC 댓글 API 호출 (e_s_n_o는 게시글 번호 기반 인코딩)
      const rawComments = await page.evaluate(
        async ({ gId, pNo }: { gId: string; pNo: string }) => {
          try {
            const formData = new URLSearchParams();
            formData.append("id", gId);
            formData.append("no", pNo);
            formData.append("cmt_id", gId);
            formData.append("cmt_no", pNo);
            formData.append("e_s_n_o", pNo);
            formData.append("comment_page", "1");

            const response = await fetch(
              "https://gall.dcinside.com/board/comment/",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/x-www-form-urlencoded; charset=UTF-8",
                  "X-Requested-With": "XMLHttpRequest",
                },
                body: formData.toString(),
              }
            );

            const data = await response.json();
            return data?.comments ?? [];
          } catch {
            return [];
          }
        },
        { gId: galleryId, pNo: postNo }
      );

      return parsePostDetailHtml(rawComments);
    } catch {
      console.warn(`댓글 가져오기 실패: gallery=${galleryId}, post=${postNo}`);
      return [];
    } finally {
      await page.close();
      await context.close();
    }
  }

  async crawl(
    celebrityId: string,
    keywords: string[]
  ): Promise<CrawlerResult> {
    const articles: ParsedArticle[] = [];
    const comments = new Map<string, ParsedComment[]>();

    try {
      for (const galleryId of keywords) {
        // 갤러리 목록 페이지 가져오기
        const html = await this.fetchGalleryList(galleryId);
        const posts = parsePostListHtml(html, galleryId);

        // 최대 게시물 수 제한
        const limitedPosts = posts.slice(0, MAX_POSTS_PER_GALLERY);

        // 동시 탭 제한을 위한 청크 처리
        for (let i = 0; i < limitedPosts.length; i += MAX_CONCURRENT_TABS) {
          const chunk = limitedPosts.slice(i, i + MAX_CONCURRENT_TABS);

          const results = await Promise.all(
            chunk.map(async (post) => {
              const sourceUrl = `${DC_BASE_URL}/board/view/?id=${galleryId}&no=${post.postNo}`;

              const article: ParsedArticle = {
                celebrityId,
                sourceType: "COMMUNITY",
                sourceUrl,
                title: post.title,
                content: "", // 목록에서는 본문 없음
                author: post.author,
                publishedAt: new Date(post.date.replace(/\./g, "-")),
              };

              const postComments = await this.fetchComments(
                galleryId,
                post.postNo
              );

              return { article, sourceUrl, postComments };
            })
          );

          for (const { article, sourceUrl, postComments } of results) {
            articles.push(article);
            if (postComments.length > 0) {
              comments.set(sourceUrl, postComments);
            }
          }

          // Rate limiting: 청크 간 대기
          if (i + MAX_CONCURRENT_TABS < limitedPosts.length) {
            await delay(RATE_LIMIT_MS);
          }
        }

        // 갤러리 간 대기
        await delay(RATE_LIMIT_MS);
      }
    } finally {
      await this.closeBrowser();
    }

    return { articles, comments };
  }
}
