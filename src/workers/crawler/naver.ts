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

/** 네이버 기사의 댓글을 가져온다 (비공식 API) */
export async function fetchNaverComments(
  articleUrl: string
): Promise<ParsedComment[]> {
  // 네이버 뉴스 URL에서 oid(언론사 ID)와 aid(기사 ID)를 추출
  const match = articleUrl.match(/\/article\/(\d+)\/(\d+)/);
  if (!match) {
    return [];
  }

  const [, oid, aid] = match;

  try {
    const { data } = await axios.get(
      "https://apis.naver.com/commentBox/cbox/web_naver_list_jsonp.json",
      {
        params: {
          ticket: "news",
          templateId: "default_society",
          pool: "cbox5",
          lang: "ko",
          country: "KR",
          objectId: `news${oid},${aid}`,
          pageSize: 50,
          page: 1,
          sort: "FAVORITE",
        },
        headers: {
          Referer: articleUrl,
        },
      }
    );

    const comments = data?.result?.commentList ?? [];
    return parseNaverComments(comments);
  } catch {
    // 댓글 API 실패 시 빈 배열 반환 (기사는 정상 처리)
    console.warn(`댓글 가져오기 실패: ${articleUrl}`);
    return [];
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
