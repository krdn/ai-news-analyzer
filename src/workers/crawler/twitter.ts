import axios from "axios";
import type {
  CrawlerPlugin,
  CrawlerResult,
  ParsedArticle,
  ParsedComment,
} from "./types";

// --- 타입 정의 ---

interface Tweet {
  id: string;
  text: string;
  author_id: string;
  created_at: string;
  public_metrics: {
    reply_count: number;
    retweet_count: number;
    like_count: number;
  };
}

interface TweetUser {
  id: string;
  username: string;
  name: string;
}

interface TweetIncludes {
  users: TweetUser[];
}

// --- 파서 함수 ---

/** 트윗 목록을 ParsedArticle로 변환한다 */
export function parseTweets(
  tweets: Tweet[],
  includes: TweetIncludes,
  celebrityId: string
): ParsedArticle[] {
  const userMap = new Map<string, TweetUser>();
  for (const user of includes.users) {
    userMap.set(user.id, user);
  }

  return tweets.map((tweet) => {
    const user = userMap.get(tweet.author_id);
    const username = user?.username ?? "unknown";

    return {
      celebrityId,
      sourceType: "X" as const,
      sourceUrl: `https://x.com/${username}/status/${tweet.id}`,
      title: tweet.text.slice(0, 200),
      content: tweet.text,
      author: `@${username}`,
      publishedAt: new Date(tweet.created_at),
    };
  });
}

// --- 월간 할당량 관리 ---

/** 현재 월 말까지 남은 초를 계산한다 */
function secondsUntilMonthEnd(): number {
  const now = new Date();
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return Math.max(1, Math.floor((endOfMonth.getTime() - now.getTime()) / 1000));
}

const MONTHLY_LIMIT = 1500;
const REDIS_KEY = "x_monthly_count";

/** Redis에서 월간 사용량을 증가시키고, 한도 초과 여부를 확인한다 */
async function incrementMonthlyCount(
  count: number
): Promise<{ allowed: boolean; current: number }> {
  const { redis } = await import("@/shared/lib/redis");
  const current = await redis.incrby(REDIS_KEY, count);

  // 첫 사용이면 TTL 설정 (월 말까지)
  const ttl = await redis.ttl(REDIS_KEY);
  if (ttl === -1) {
    await redis.expire(REDIS_KEY, secondsUntilMonthEnd());
  }

  return { allowed: current <= MONTHLY_LIMIT, current };
}

// --- API 호출 함수 ---

/** X API v2로 최근 트윗을 검색한다 */
async function fetchTweets(
  query: string,
  celebrityId: string
): Promise<ParsedArticle[]> {
  const bearerToken = process.env.X_BEARER_TOKEN;

  if (!bearerToken) {
    throw new Error("X_BEARER_TOKEN 환경 변수가 필요합니다");
  }

  const { data } = await axios.get(
    "https://api.x.com/2/tweets/search/recent",
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      params: {
        query,
        max_results: 10,
        "tweet.fields": "created_at,public_metrics,author_id",
        expansions: "author_id",
      },
    }
  );

  const tweets: Tweet[] = data.data ?? [];
  const includes: TweetIncludes = data.includes ?? { users: [] };

  return parseTweets(tweets, includes, celebrityId);
}

// --- 딜레이 유틸리티 ---

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- CrawlerPlugin 구현 ---

/** CrawlerPlugin 인터페이스를 구현한 X(트위터) 크롤러 */
export class TwitterCrawlerPlugin implements CrawlerPlugin {
  sourceType = "X" as const;

  async crawl(
    celebrityId: string,
    keywords: string[]
  ): Promise<CrawlerResult> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) {
      console.warn("[X] X_BEARER_TOKEN 미설정, 건너뜀");
      return { articles: [], comments: new Map() };
    }

    const articles: ParsedArticle[] = [];
    // Free tier에서는 reply/conversation 검색 불가
    const comments = new Map<string, ParsedComment[]>();

    for (let i = 0; i < keywords.length; i++) {
      // 월간 할당량 확인 (키워드당 최대 10개 트윗)
      const { allowed, current } = await incrementMonthlyCount(10);
      if (!allowed) {
        console.warn(
          `X API 월간 할당량 초과 (${current}/${MONTHLY_LIMIT}). 남은 키워드 건너뜀.`
        );
        break;
      }

      const fetched = await fetchTweets(keywords[i], celebrityId);
      articles.push(...fetched);

      // Rate limiting: 키워드 간 15초 대기 (마지막 키워드 제외)
      if (i < keywords.length - 1) {
        await delay(15_000);
      }
    }

    return { articles, comments };
  }
}
