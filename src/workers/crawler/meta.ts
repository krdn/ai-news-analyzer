import axios from "axios";
import type {
  CrawlerPlugin,
  CrawlerResult,
  ParsedArticle as CrawlerParsedArticle,
  ParsedComment as CrawlerParsedComment,
} from "./types";

// --- 타입 정의 ---

interface FacebookPost {
  id: string;
  message?: string;
  created_time: string;
  permalink_url: string;
}

interface FacebookComment {
  id: string;
  message: string;
  from: { name: string };
  like_count: number;
  created_time: string;
}

interface ParsedArticle {
  title: string;
  content: string;
  sourceUrl: string;
  sourceType: "META";
  celebrityId: string;
  publishedAt: Date;
}

interface ParsedComment {
  content: string;
  author: string;
  likes: number;
  publishedAt: Date;
}

// --- 파서 함수 ---

/** Facebook 게시물을 ParsedArticle 목록으로 변환 */
export function parseFacebookPosts(
  posts: FacebookPost[],
  celebrityId: string
): ParsedArticle[] {
  return posts
    .filter((post) => !!post.message)
    .map((post) => ({
      title: post.message!.slice(0, 200),
      content: post.message!,
      sourceUrl: post.permalink_url,
      sourceType: "META" as const,
      celebrityId,
      publishedAt: new Date(post.created_time),
    }));
}

/** Facebook 댓글을 ParsedComment 목록으로 변환 */
export function parseFacebookComments(
  comments: FacebookComment[]
): ParsedComment[] {
  return comments.map((comment) => ({
    content: comment.message,
    author: comment.from.name,
    likes: comment.like_count,
    publishedAt: new Date(comment.created_time),
  }));
}

// --- API 호출 함수 ---

const GRAPH_API_BASE = "https://graph.facebook.com/v21.0";

/** Meta Graph API로 페이지 게시물을 가져온다 */
export async function fetchFacebookPosts(
  pageId: string,
  celebrityId: string
): Promise<ParsedArticle[]> {
  const accessToken = process.env.META_PAGE_TOKEN;

  if (!accessToken) {
    throw new Error("META_PAGE_TOKEN 환경 변수가 필요합니다");
  }

  const { data } = await axios.get(`${GRAPH_API_BASE}/${pageId}/posts`, {
    params: {
      access_token: accessToken,
      fields: "id,message,created_time,permalink_url",
      limit: 20,
    },
  });

  return parseFacebookPosts(data.data ?? [], celebrityId);
}

/** Meta Graph API로 게시물 댓글을 가져온다 */
export async function fetchFacebookComments(
  postId: string
): Promise<ParsedComment[]> {
  const accessToken = process.env.META_PAGE_TOKEN;

  if (!accessToken) {
    throw new Error("META_PAGE_TOKEN 환경 변수가 필요합니다");
  }

  try {
    const { data } = await axios.get(`${GRAPH_API_BASE}/${postId}/comments`, {
      params: {
        access_token: accessToken,
        fields: "id,message,from,like_count,created_time",
        limit: 100,
      },
    });

    return parseFacebookComments(data.data ?? []);
  } catch {
    // 댓글 비활성화 또는 권한 부족 시 빈 배열 반환
    console.warn(`Facebook 댓글 가져오기 실패: ${postId}`);
    return [];
  }
}

// --- CrawlerPlugin 구현 ---

/** CrawlerPlugin 인터페이스를 구현한 Meta(Facebook/Instagram) 크롤러 */
export class MetaCrawlerPlugin implements CrawlerPlugin {
  sourceType = "META" as const;

  async crawl(
    celebrityId: string,
    keywords: string[]
  ): Promise<CrawlerResult> {
    const articles: CrawlerParsedArticle[] = [];
    const comments = new Map<string, CrawlerParsedComment[]>();

    // keywords에 page_id 목록이 전달됨
    for (const pageId of keywords) {
      const fetched = await fetchFacebookPosts(pageId, celebrityId);

      for (const article of fetched) {
        articles.push({
          celebrityId: article.celebrityId,
          sourceType: article.sourceType,
          sourceUrl: article.sourceUrl,
          title: article.title,
          content: article.content,
          publishedAt: article.publishedAt,
        });

        // 게시물 ID로 댓글 수집
        const postId = article.sourceUrl.split("/").pop();
        if (postId) {
          const postComments = await fetchFacebookComments(postId);
          if (postComments.length > 0) {
            comments.set(
              article.sourceUrl,
              postComments.map((c) => ({
                content: c.content,
                author: c.author,
                likes: c.likes,
                publishedAt: c.publishedAt,
              }))
            );
          }
        }
      }
    }

    return { articles, comments };
  }
}
