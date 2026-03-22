import axios from "axios";
import type {
  CrawlerPlugin,
  CrawlerResult,
  ParsedArticle as CrawlerParsedArticle,
  ParsedComment as CrawlerParsedComment,
} from "./types";

// --- 타입 정의 ---

interface YouTubeSearchItem {
  id: { videoId: string };
  snippet: {
    title: string;
    description: string;
    channelTitle: string;
    publishedAt: string;
  };
}

interface YouTubeCommentThread {
  snippet: {
    topLevelComment: {
      snippet: {
        textDisplay: string;
        authorDisplayName: string;
        likeCount: number;
        publishedAt: string;
      };
    };
  };
}

interface ParsedArticle {
  title: string;
  content: string;
  sourceUrl: string;
  sourceType: "YOUTUBE";
  celebrityId: string;
  author: string;
  publishedAt: Date;
}

interface ParsedComment {
  content: string;
  author: string;
  likes: number;
  publishedAt: Date;
}

// --- 파서 함수 ---

/** YouTube 검색 API 응답을 파싱하여 기사 목록으로 변환 */
export function parseYouTubeSearchResponse(
  items: YouTubeSearchItem[],
  celebrityId: string
): ParsedArticle[] {
  return items.map((item) => ({
    title: item.snippet.title,
    content: item.snippet.description,
    sourceUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    sourceType: "YOUTUBE" as const,
    celebrityId,
    author: item.snippet.channelTitle,
    publishedAt: new Date(item.snippet.publishedAt),
  }));
}

/** YouTube 댓글 스레드를 파싱 */
export function parseYouTubeComments(
  threads: YouTubeCommentThread[]
): ParsedComment[] {
  return threads.map((thread) => {
    const snippet = thread.snippet.topLevelComment.snippet;
    return {
      content: snippet.textDisplay,
      author: snippet.authorDisplayName,
      likes: snippet.likeCount,
      publishedAt: new Date(snippet.publishedAt),
    };
  });
}

// --- API 호출 함수 ---

/** YouTube Data API v3로 동영상을 검색한다 */
export async function fetchYouTubeVideos(
  query: string,
  celebrityId: string
): Promise<ParsedArticle[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY 환경 변수가 필요합니다");
  }

  const { data } = await axios.get(
    "https://www.googleapis.com/youtube/v3/search",
    {
      params: {
        key: apiKey,
        q: query,
        type: "video",
        part: "snippet",
        order: "date",
        maxResults: 10,
      },
    }
  );

  return parseYouTubeSearchResponse(data.items ?? [], celebrityId);
}

/** YouTube Data API v3로 동영상 댓글을 가져온다 */
export async function fetchYouTubeComments(
  videoId: string
): Promise<ParsedComment[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!apiKey) {
    throw new Error("YOUTUBE_API_KEY 환경 변수가 필요합니다");
  }

  try {
    const { data } = await axios.get(
      "https://www.googleapis.com/youtube/v3/commentThreads",
      {
        params: {
          key: apiKey,
          videoId,
          part: "snippet",
          order: "relevance",
          maxResults: 100,
        },
      }
    );

    return parseYouTubeComments(data.items ?? []);
  } catch {
    // 댓글 비활성화된 영상 등 실패 시 빈 배열 반환
    console.warn(`YouTube 댓글 가져오기 실패: ${videoId}`);
    return [];
  }
}

// --- 비디오 ID 추출 유틸리티 ---

/** YouTube URL에서 videoId를 추출한다 */
function extractVideoId(url: string): string | null {
  const match = url.match(/[?&]v=([^&]+)/);
  return match ? match[1] : null;
}

// --- CrawlerPlugin 구현 ---

/** CrawlerPlugin 인터페이스를 구현한 YouTube 크롤러 */
export class YouTubeCrawlerPlugin implements CrawlerPlugin {
  sourceType = "YOUTUBE" as const;

  async crawl(
    celebrityId: string,
    keywords: string[]
  ): Promise<CrawlerResult> {
    const articles: CrawlerParsedArticle[] = [];
    const comments = new Map<string, CrawlerParsedComment[]>();

    for (const keyword of keywords) {
      const fetched = await fetchYouTubeVideos(keyword, celebrityId);

      for (const article of fetched) {
        articles.push({
          celebrityId: article.celebrityId,
          sourceType: article.sourceType,
          sourceUrl: article.sourceUrl,
          title: article.title,
          content: article.content,
          author: article.author,
          publishedAt: article.publishedAt,
        });

        const videoId = extractVideoId(article.sourceUrl);
        if (videoId) {
          const videoComments = await fetchYouTubeComments(videoId);
          if (videoComments.length > 0) {
            comments.set(
              article.sourceUrl,
              videoComments.map((c) => ({
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
