# Phase 2A: 크롤러 소스 확장 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 크롤러 플러그인 아키텍처를 도입하고, YouTube/X/Meta/디시인사이드 크롤러를 추가하여 5개 소스에서 셀럽 뉴스를 수집한다.

**Architecture:** CrawlerPlugin 인터페이스를 정의하고 각 소스를 독립 플러그인으로 구현. 공통 DB 저장 + 큐 추가 로직을 `processCrawlResult`로 추출. 워커에서 sourceType에 따라 플러그인을 선택하여 호출. BullMQ Repeat Jobs로 소스별 자동 스케줄링.

**Tech Stack:** googleapis (YouTube), Playwright (디시인사이드), axios (X/Meta API), BullMQ

**Spec:** `docs/superpowers/specs/2026-03-22-phase2a-crawler-expansion-design.md`

---

## 파일 구조 (Phase 2A 범위)

```
src/workers/crawler/
├── types.ts              (신규) CrawlerPlugin 인터페이스, ParsedArticle, ParsedComment
├── registry.ts           (신규) 플러그인 레지스트리 + processCrawlResult
├── naver.ts              (수정) NaverCrawlerPlugin으로 리팩토링
├── naver.test.ts         (수정) 리팩토링 반영
├── youtube.ts            (신규) YouTubeCrawlerPlugin
├── youtube.test.ts       (신규)
├── twitter.ts            (신규) TwitterCrawlerPlugin
├── twitter.test.ts       (신규)
├── meta.ts               (신규) MetaCrawlerPlugin
├── meta.test.ts          (신규)
├── dcinside.ts           (신규) DcinsideCrawlerPlugin
└── dcinside.test.ts      (신규)

src/workers/index.ts      (수정) 플러그인 레지스트리 연동 + 스케줄러

src/app/api/crawl/
├── trigger/route.ts      (수정) sourceType 파라미터 추가
├── schedule/route.ts     (신규) 스케줄 관리 API
└── status/route.ts       (신규) 크롤러 상태 API

src/app/(dashboard)/admin/crawler/
└── page.tsx              (수정) 소스별 상태 + 스케줄 토글

.env.example              (수정) 새 API 키 추가
```

---

## Task 1: 크롤러 플러그인 인터페이스 & 레지스트리

**Files:**
- Create: `src/workers/crawler/types.ts`
- Create: `src/workers/crawler/registry.ts`
- Test: `src/workers/crawler/registry.test.ts`

- [ ] **Step 1: 플러그인 인터페이스 테스트 작성**

```typescript
// src/workers/crawler/registry.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CrawlerRegistry } from "./registry";
import type { CrawlerPlugin, CrawlerResult } from "./types";

describe("CrawlerRegistry", () => {
  let registry: CrawlerRegistry;

  beforeEach(() => {
    registry = new CrawlerRegistry();
  });

  it("플러그인을 등록하고 조회할 수 있다", () => {
    const plugin: CrawlerPlugin = {
      sourceType: "NAVER",
      crawl: vi.fn(),
    };
    registry.register(plugin);
    expect(registry.get("NAVER")).toBe(plugin);
  });

  it("등록되지 않은 소스 타입은 undefined를 반환한다", () => {
    expect(registry.get("YOUTUBE")).toBeUndefined();
  });

  it("등록된 모든 소스 타입을 반환한다", () => {
    const naver: CrawlerPlugin = { sourceType: "NAVER", crawl: vi.fn() };
    const youtube: CrawlerPlugin = { sourceType: "YOUTUBE", crawl: vi.fn() };
    registry.register(naver);
    registry.register(youtube);
    expect(registry.getRegisteredTypes()).toEqual(["NAVER", "YOUTUBE"]);
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
pnpm vitest run src/workers/crawler/registry.test.ts
```

- [ ] **Step 3: 타입 정의 구현**

```typescript
// src/workers/crawler/types.ts
import type { SourceType } from "@prisma/client";

export interface ParsedArticle {
  celebrityId: string;
  sourceType: SourceType;
  sourceUrl: string;
  title: string;
  content: string;
  author?: string;
  publishedAt: Date;
}

export interface ParsedComment {
  content: string;
  author: string;
  likes: number;
  publishedAt: Date;
}

export interface CrawlerResult {
  articles: ParsedArticle[];
  comments: Map<string, ParsedComment[]>; // articleSourceUrl → comments
}

export interface CrawlerPlugin {
  sourceType: SourceType;
  crawl(celebrityId: string, keywords: string[]): Promise<CrawlerResult>;
}
```

- [ ] **Step 4: 레지스트리 구현**

```typescript
// src/workers/crawler/registry.ts
import type { SourceType } from "@prisma/client";
import type { CrawlerPlugin, CrawlerResult } from "./types";

export class CrawlerRegistry {
  private plugins = new Map<SourceType, CrawlerPlugin>();

  register(plugin: CrawlerPlugin): void {
    this.plugins.set(plugin.sourceType, plugin);
  }

  get(sourceType: SourceType): CrawlerPlugin | undefined {
    return this.plugins.get(sourceType);
  }

  getRegisteredTypes(): SourceType[] {
    return Array.from(this.plugins.keys());
  }
}

// DB 저장 + 분석 큐 추가 공통 로직
export async function processCrawlResult(
  result: CrawlerResult,
  celebrityId: string,
  sourceType: SourceType
): Promise<{ articlesCreated: number; commentsCreated: number }> {
  const { prisma } = await import("@/shared/lib/prisma");
  const { analysisQueue } = await import("@/shared/lib/queue");

  let articlesCreated = 0;
  let commentsCreated = 0;

  for (const article of result.articles) {
    const existing = await prisma.article.findUnique({
      where: { sourceUrl: article.sourceUrl },
    });
    if (existing) continue;

    const saved = await prisma.article.create({
      data: {
        celebrityId: article.celebrityId,
        sourceType: article.sourceType,
        sourceUrl: article.sourceUrl,
        title: article.title,
        content: article.content,
        author: article.author,
        publishedAt: article.publishedAt,
      },
    });
    articlesCreated++;

    const comments = result.comments.get(article.sourceUrl) ?? [];
    if (comments.length > 0) {
      await prisma.comment.createMany({
        data: comments.map((c) => ({
          articleId: saved.id,
          content: c.content,
          author: c.author,
          likes: c.likes,
          publishedAt: c.publishedAt,
        })),
      });
      commentsCreated += comments.length;
    }

    await analysisQueue.add("analyze-article", {
      articleId: saved.id,
      celebrityId,
    });
  }

  return { articlesCreated, commentsCreated };
}

// 글로벌 레지스트리 인스턴스
export const crawlerRegistry = new CrawlerRegistry();
```

- [ ] **Step 5: 테스트 실행 → 성공 확인**

```bash
pnpm vitest run src/workers/crawler/registry.test.ts
```

Expected: PASS (3/3)

- [ ] **Step 6: 커밋**

```bash
git add src/workers/crawler/types.ts src/workers/crawler/registry.ts src/workers/crawler/registry.test.ts
git commit -m "feat: 크롤러 플러그인 인터페이스 및 레지스트리

CrawlerPlugin 인터페이스, CrawlerRegistry 클래스, processCrawlResult 공통 로직
- 소스별 크롤러를 플러그인으로 등록/조회
- DB 저장 + 분석 큐 추가 로직 공통화

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: 네이버 크롤러 리팩토링

**Files:**
- Modify: `src/workers/crawler/naver.ts`
- Modify: `src/workers/crawler/naver.test.ts`

- [ ] **Step 1: 기존 테스트가 통과하는지 확인**

```bash
pnpm vitest run src/workers/crawler/naver.test.ts
```

Expected: PASS (5/5)

- [ ] **Step 2: NaverCrawlerPlugin 클래스로 리팩토링**

`naver.ts`를 수정:
- 기존 `parseNaverSearchResponse`, `parseNaverComments`, `fetchNaverNews`, `fetchNaverComments`는 그대로 유지 (내부 함수)
- `crawlNaverForCelebrity` 삭제 (DB 저장 로직은 `processCrawlResult`로 이동됨)
- 새로 `NaverCrawlerPlugin` 클래스 추가: `CrawlerPlugin` 인터페이스 구현
  - `crawl(celebrityId, keywords)` → `fetchNaverNews` + `fetchNaverComments` 호출 → `CrawlerResult` 반환

```typescript
// naver.ts 끝부분에 추가
import type { CrawlerPlugin, CrawlerResult, ParsedArticle as CrawlerParsedArticle, ParsedComment as CrawlerParsedComment } from "./types";

export class NaverCrawlerPlugin implements CrawlerPlugin {
  sourceType = "NAVER" as const;

  async crawl(celebrityId: string, keywords: string[]): Promise<CrawlerResult> {
    const articles: CrawlerParsedArticle[] = [];
    const comments = new Map<string, CrawlerParsedComment[]>();

    for (const keyword of keywords) {
      const fetched = await fetchNaverNews(keyword, celebrityId);
      for (const article of fetched) {
        articles.push({
          celebrityId: article.celebrityId,
          sourceType: "NAVER",
          sourceUrl: article.sourceUrl,
          title: article.title,
          content: article.content,
          publishedAt: article.publishedAt,
        });

        const articleComments = await fetchNaverComments(article.sourceUrl);
        if (articleComments.length > 0) {
          comments.set(article.sourceUrl, articleComments);
        }
      }
    }

    return { articles, comments };
  }
}
```

- [ ] **Step 3: 테스트에 NaverCrawlerPlugin 인스턴스 테스트 추가**

```typescript
// naver.test.ts 끝부분에 추가
import { NaverCrawlerPlugin } from "./naver";

describe("NaverCrawlerPlugin", () => {
  it("sourceType이 NAVER이다", () => {
    const plugin = new NaverCrawlerPlugin();
    expect(plugin.sourceType).toBe("NAVER");
  });
});
```

- [ ] **Step 4: 테스트 실행 → 성공 확인**

```bash
pnpm vitest run src/workers/crawler/naver.test.ts
```

Expected: PASS (6/6)

- [ ] **Step 5: 커밋**

```bash
git add src/workers/crawler/naver.ts src/workers/crawler/naver.test.ts
git commit -m "refactor: 네이버 크롤러를 CrawlerPlugin 인터페이스로 리팩토링

NaverCrawlerPlugin 클래스 추가
- 기존 파서 함수는 유지 (하위 호환)
- crawl() 메서드가 CrawlerResult 반환

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: YouTube 크롤러

**Files:**
- Create: `src/workers/crawler/youtube.ts`
- Create: `src/workers/crawler/youtube.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// src/workers/crawler/youtube.test.ts
import { describe, it, expect } from "vitest";
import { parseYouTubeSearchResponse, parseYouTubeComments, YouTubeCrawlerPlugin } from "./youtube";

describe("YouTube 크롤러", () => {
  it("검색 결과를 ParsedArticle로 변환한다", () => {
    const mockItems = [
      {
        id: { videoId: "abc123" },
        snippet: {
          title: "셀럽 인터뷰",
          description: "최신 인터뷰 영상",
          channelTitle: "뉴스채널",
          publishedAt: "2026-03-22T10:00:00Z",
        },
      },
    ];
    const articles = parseYouTubeSearchResponse(mockItems, "celeb-id");
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe("셀럽 인터뷰");
    expect(articles[0].sourceUrl).toBe("https://www.youtube.com/watch?v=abc123");
    expect(articles[0].sourceType).toBe("YOUTUBE");
    expect(articles[0].author).toBe("뉴스채널");
  });

  it("댓글을 ParsedComment로 변환한다", () => {
    const mockComments = [
      {
        snippet: {
          topLevelComment: {
            snippet: {
              textDisplay: "좋은 영상이에요",
              authorDisplayName: "사용자1",
              likeCount: 15,
              publishedAt: "2026-03-22T12:00:00Z",
            },
          },
        },
      },
    ];
    const comments = parseYouTubeComments(mockComments);
    expect(comments).toHaveLength(1);
    expect(comments[0].content).toBe("좋은 영상이에요");
    expect(comments[0].author).toBe("사용자1");
    expect(comments[0].likes).toBe(15);
  });

  it("빈 결과를 처리한다", () => {
    expect(parseYouTubeSearchResponse([], "id")).toHaveLength(0);
    expect(parseYouTubeComments([])).toHaveLength(0);
  });

  it("sourceType이 YOUTUBE이다", () => {
    const plugin = new YouTubeCrawlerPlugin();
    expect(plugin.sourceType).toBe("YOUTUBE");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
pnpm vitest run src/workers/crawler/youtube.test.ts
```

- [ ] **Step 3: YouTube 크롤러 구현**

```typescript
// src/workers/crawler/youtube.ts
import axios from "axios";
import type { CrawlerPlugin, CrawlerResult, ParsedArticle, ParsedComment } from "./types";

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

export function parseYouTubeSearchResponse(
  items: YouTubeSearchItem[],
  celebrityId: string
): ParsedArticle[] {
  return items.map((item) => ({
    celebrityId,
    sourceType: "YOUTUBE" as const,
    sourceUrl: `https://www.youtube.com/watch?v=${item.id.videoId}`,
    title: item.snippet.title,
    content: item.snippet.description,
    author: item.snippet.channelTitle,
    publishedAt: new Date(item.snippet.publishedAt),
  }));
}

export function parseYouTubeComments(
  threads: YouTubeCommentThread[]
): ParsedComment[] {
  return threads.map((t) => {
    const s = t.snippet.topLevelComment.snippet;
    return {
      content: s.textDisplay,
      author: s.authorDisplayName,
      likes: s.likeCount,
      publishedAt: new Date(s.publishedAt),
    };
  });
}

async function searchVideos(
  query: string,
  apiKey: string
): Promise<YouTubeSearchItem[]> {
  const { data } = await axios.get("https://www.googleapis.com/youtube/v3/search", {
    params: {
      key: apiKey,
      q: query,
      type: "video",
      part: "snippet",
      order: "date",
      maxResults: 10,
    },
  });
  return data.items ?? [];
}

async function fetchComments(
  videoId: string,
  apiKey: string
): Promise<YouTubeCommentThread[]> {
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
    return data.items ?? [];
  } catch {
    return [];
  }
}

export class YouTubeCrawlerPlugin implements CrawlerPlugin {
  sourceType = "YOUTUBE" as const;

  async crawl(celebrityId: string, keywords: string[]): Promise<CrawlerResult> {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) throw new Error("YOUTUBE_API_KEY 환경 변수가 필요합니다");

    const articles: ParsedArticle[] = [];
    const comments = new Map<string, ParsedComment[]>();

    for (const keyword of keywords) {
      const items = await searchVideos(keyword, apiKey);
      const parsed = parseYouTubeSearchResponse(items, celebrityId);

      for (const article of parsed) {
        articles.push(article);
        const videoId = new URL(article.sourceUrl).searchParams.get("v")!;
        const videoComments = await fetchComments(videoId, apiKey);
        if (videoComments.length > 0) {
          comments.set(article.sourceUrl, parseYouTubeComments(videoComments));
        }
      }
    }

    return { articles, comments };
  }
}
```

- [ ] **Step 4: 테스트 실행 → 성공 확인**

```bash
pnpm vitest run src/workers/crawler/youtube.test.ts
```

Expected: PASS (4/4)

- [ ] **Step 5: 커밋**

```bash
git add src/workers/crawler/youtube.ts src/workers/crawler/youtube.test.ts
git commit -m "feat: YouTube 크롤러 구현

YouTube Data API v3 연동 (검색 + 댓글)
- CrawlerPlugin 인터페이스 준수
- 할당량 관리: 검색 100units, 댓글 1unit

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: X (트위터) 크롤러

**Files:**
- Create: `src/workers/crawler/twitter.ts`
- Create: `src/workers/crawler/twitter.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// src/workers/crawler/twitter.test.ts
import { describe, it, expect } from "vitest";
import { parseTweets, TwitterCrawlerPlugin } from "./twitter";

describe("X(트위터) 크롤러", () => {
  it("트윗을 ParsedArticle로 변환한다", () => {
    const mockTweets = [
      {
        id: "123456",
        text: "셀럽 관련 트윗 내용입니다",
        author_id: "user1",
        created_at: "2026-03-22T10:00:00.000Z",
        public_metrics: {
          reply_count: 5,
          retweet_count: 10,
          like_count: 50,
        },
      },
    ];
    const includes = {
      users: [{ id: "user1", username: "testuser", name: "테스트유저" }],
    };

    const articles = parseTweets(mockTweets, includes, "celeb-id");
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe("셀럽 관련 트윗 내용입니다");
    expect(articles[0].sourceUrl).toBe("https://x.com/testuser/status/123456");
    expect(articles[0].sourceType).toBe("X");
    expect(articles[0].author).toBe("@testuser");
  });

  it("빈 트윗 목록을 처리한다", () => {
    expect(parseTweets([], { users: [] }, "id")).toHaveLength(0);
  });

  it("sourceType이 X이다", () => {
    const plugin = new TwitterCrawlerPlugin();
    expect(plugin.sourceType).toBe("X");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

- [ ] **Step 3: X 크롤러 구현**

```typescript
// src/workers/crawler/twitter.ts
import axios from "axios";
import type { CrawlerPlugin, CrawlerResult, ParsedArticle, ParsedComment } from "./types";

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

export function parseTweets(
  tweets: Tweet[],
  includes: TweetIncludes,
  celebrityId: string
): ParsedArticle[] {
  const userMap = new Map(includes.users.map((u) => [u.id, u]));

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

export class TwitterCrawlerPlugin implements CrawlerPlugin {
  sourceType = "X" as const;

  async crawl(celebrityId: string, keywords: string[]): Promise<CrawlerResult> {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (!bearerToken) throw new Error("X_BEARER_TOKEN 환경 변수가 필요합니다");

    // 월간 할당량 체크
    const { redis } = await import("@/shared/lib/redis");
    const monthlyCount = parseInt((await redis.get("x_monthly_count")) ?? "0");
    if (monthlyCount >= 1500) {
      console.warn("[X] 월간 할당량 초과, 크롤링 건너뜀");
      return { articles: [], comments: new Map() };
    }

    const articles: ParsedArticle[] = [];
    const comments = new Map<string, ParsedComment[]>();

    for (const keyword of keywords) {
      try {
        const { data } = await axios.get(
          "https://api.x.com/2/tweets/search/recent",
          {
            params: {
              query: keyword,
              max_results: 10,
              "tweet.fields": "created_at,public_metrics,author_id",
              expansions: "author_id",
            },
            headers: { Authorization: `Bearer ${bearerToken}` },
          }
        );

        const tweets: Tweet[] = data.data ?? [];
        const includes: TweetIncludes = data.includes ?? { users: [] };
        const parsed = parseTweets(tweets, includes, celebrityId);
        articles.push(...parsed);

        // 월간 카운터 원자적 업데이트 (INCRBY)
        const now = new Date();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const ttl = Math.floor((monthEnd.getTime() - now.getTime()) / 1000);
        await redis.incrby("x_monthly_count", tweets.length);
        await redis.expire("x_monthly_count", ttl);

        // Rate limit: 1 요청/15초
        await new Promise((resolve) => setTimeout(resolve, 15000));
      } catch (err: any) {
        if (err?.response?.status === 429) {
          console.warn("[X] Rate limit 도달, 대기 중");
          break;
        }
        throw err;
      }
    }

    // Free tier에서는 댓글(replies) 수집 불가 → 빈 Map
    return { articles, comments };
  }
}
```

- [ ] **Step 4: 테스트 실행 → 성공 확인**

```bash
pnpm vitest run src/workers/crawler/twitter.test.ts
```

Expected: PASS (3/3)

- [ ] **Step 5: 커밋**

```bash
git add src/workers/crawler/twitter.ts src/workers/crawler/twitter.test.ts
git commit -m "feat: X(트위터) 크롤러 구현

X API v2 Free tier 연동 (최근 트윗 검색)
- 월간 1,500 트윗 할당량 관리 (Redis 카운터)
- Rate limiting (15초/요청)
- Free tier 댓글 수집 불가 → 트윗만 수집

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: Meta 크롤러

**Files:**
- Create: `src/workers/crawler/meta.ts`
- Create: `src/workers/crawler/meta.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// src/workers/crawler/meta.test.ts
import { describe, it, expect } from "vitest";
import { parseFacebookPosts, parseFacebookComments, MetaCrawlerPlugin } from "./meta";

describe("Meta 크롤러", () => {
  it("Facebook 게시물을 ParsedArticle로 변환한다", () => {
    const mockPosts = [
      {
        id: "page_123",
        message: "새로운 소식을 전합니다. 많은 관심 부탁드립니다.",
        created_time: "2026-03-22T10:00:00+0000",
        permalink_url: "https://www.facebook.com/page/posts/123",
      },
    ];
    const articles = parseFacebookPosts(mockPosts, "celeb-id");
    expect(articles).toHaveLength(1);
    expect(articles[0].title).toBe("새로운 소식을 전합니다. 많은 관심 부탁드립니다.");
    expect(articles[0].sourceType).toBe("META");
  });

  it("Facebook 댓글을 ParsedComment로 변환한다", () => {
    const mockComments = [
      {
        id: "comment_1",
        message: "축하합니다!",
        from: { name: "팬1" },
        like_count: 5,
        created_time: "2026-03-22T12:00:00+0000",
      },
    ];
    const comments = parseFacebookComments(mockComments);
    expect(comments).toHaveLength(1);
    expect(comments[0].content).toBe("축하합니다!");
    expect(comments[0].author).toBe("팬1");
    expect(comments[0].likes).toBe(5);
  });

  it("빈 결과를 처리한다", () => {
    expect(parseFacebookPosts([], "id")).toHaveLength(0);
    expect(parseFacebookComments([])).toHaveLength(0);
  });

  it("sourceType이 META이다", () => {
    const plugin = new MetaCrawlerPlugin();
    expect(plugin.sourceType).toBe("META");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

- [ ] **Step 3: Meta 크롤러 구현**

```typescript
// src/workers/crawler/meta.ts
import axios from "axios";
import type { CrawlerPlugin, CrawlerResult, ParsedArticle, ParsedComment } from "./types";

interface FacebookPost {
  id: string;
  message?: string;
  created_time: string;
  permalink_url: string;
}

interface FacebookComment {
  id: string;
  message: string;
  from?: { name: string };
  like_count: number;
  created_time: string;
}

export function parseFacebookPosts(
  posts: FacebookPost[],
  celebrityId: string
): ParsedArticle[] {
  return posts
    .filter((p) => p.message)
    .map((post) => ({
      celebrityId,
      sourceType: "META" as const,
      sourceUrl: post.permalink_url,
      title: (post.message ?? "").slice(0, 200),
      content: post.message ?? "",
      publishedAt: new Date(post.created_time),
    }));
}

export function parseFacebookComments(
  comments: FacebookComment[]
): ParsedComment[] {
  return comments.map((c) => ({
    content: c.message,
    author: c.from?.name ?? "익명",
    likes: c.like_count,
    publishedAt: new Date(c.created_time),
  }));
}

async function fetchPagePosts(
  pageId: string,
  token: string
): Promise<FacebookPost[]> {
  const { data } = await axios.get(
    `https://graph.facebook.com/v21.0/${pageId}/posts`,
    {
      params: {
        access_token: token,
        fields: "id,message,created_time,permalink_url",
        limit: 20,
      },
    }
  );
  return data.data ?? [];
}

async function fetchPostComments(
  postId: string,
  token: string
): Promise<FacebookComment[]> {
  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/v21.0/${postId}/comments`,
      {
        params: {
          access_token: token,
          fields: "id,message,from,like_count,created_time",
          limit: 100,
        },
      }
    );
    return data.data ?? [];
  } catch {
    return [];
  }
}

export class MetaCrawlerPlugin implements CrawlerPlugin {
  sourceType = "META" as const;

  async crawl(celebrityId: string, keywords: string[]): Promise<CrawlerResult> {
    const token = process.env.META_PAGE_TOKEN;
    if (!token) throw new Error("META_PAGE_TOKEN 환경 변수가 필요합니다");

    // keywords에는 page_id 또는 ig_user_id가 들어옴
    const articles: ParsedArticle[] = [];
    const comments = new Map<string, ParsedComment[]>();

    for (const pageId of keywords) {
      const posts = await fetchPagePosts(pageId, token);
      const parsed = parseFacebookPosts(posts, celebrityId);

      for (const article of parsed) {
        articles.push(article);
        const postId = posts.find(
          (p) => p.permalink_url === article.sourceUrl
        )?.id;
        if (postId) {
          const postComments = await fetchPostComments(postId, token);
          if (postComments.length > 0) {
            comments.set(
              article.sourceUrl,
              parseFacebookComments(postComments)
            );
          }
        }
      }
    }

    return { articles, comments };
  }
}
```

- [ ] **Step 4: 테스트 실행 → 성공 확인**

```bash
pnpm vitest run src/workers/crawler/meta.test.ts
```

Expected: PASS (4/4)

- [ ] **Step 5: 커밋**

```bash
git add src/workers/crawler/meta.ts src/workers/crawler/meta.test.ts
git commit -m "feat: Meta(Facebook/Instagram) 크롤러 구현

Graph API v21.0 연동 (공개 페이지 게시물 + 댓글)
- CrawlerPlugin 인터페이스 준수
- celebrity_sources.search_keywords에 page_id 저장

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: 디시인사이드 크롤러

**Files:**
- Create: `src/workers/crawler/dcinside.ts`
- Create: `src/workers/crawler/dcinside.test.ts`

- [ ] **Step 1: 테스트 작성**

```typescript
// src/workers/crawler/dcinside.test.ts
import { describe, it, expect } from "vitest";
import { parsePostListHtml, parsePostDetailHtml, DcinsideCrawlerPlugin } from "./dcinside";

describe("디시인사이드 크롤러", () => {
  it("게시물 목록 HTML을 파싱한다", () => {
    const html = `
      <tr class="ub-content us-post" data-no="12345">
        <td class="gall_tit ub-word">
          <a href="/board/view/?id=hit&no=12345">테스트 제목</a>
        </td>
        <td class="gall_writer ub-writer"><span class="nickname">작성자1</span></td>
        <td class="gall_date">2026.03.22</td>
      </tr>
    `;
    const posts = parsePostListHtml(html, "hit");
    expect(posts).toHaveLength(1);
    expect(posts[0].title).toBe("테스트 제목");
    expect(posts[0].postNo).toBe("12345");
    expect(posts[0].galleryId).toBe("hit");
  });

  it("게시물 상세 HTML에서 댓글을 파싱한다", () => {
    const mockComments = [
      { memo: "좋은 글이네요", name: "댓글러1", rcnt: "3", reg_date: "2026.03.22 12:00:00" },
      { memo: "동의합니다", name: "댓글러2", rcnt: "1", reg_date: "2026.03.22 13:00:00" },
    ];
    const comments = parsePostDetailHtml(mockComments);
    expect(comments).toHaveLength(2);
    expect(comments[0].content).toBe("좋은 글이네요");
    expect(comments[0].author).toBe("댓글러1");
    expect(comments[0].likes).toBe(3);
  });

  it("빈 결과를 처리한다", () => {
    expect(parsePostListHtml("", "hit")).toHaveLength(0);
    expect(parsePostDetailHtml([])).toHaveLength(0);
  });

  it("sourceType이 COMMUNITY이다", () => {
    const plugin = new DcinsideCrawlerPlugin();
    expect(plugin.sourceType).toBe("COMMUNITY");
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

- [ ] **Step 3: 디시인사이드 크롤러 구현**

```typescript
// src/workers/crawler/dcinside.ts
import * as cheerio from "cheerio";
import type { CrawlerPlugin, CrawlerResult, ParsedArticle, ParsedComment } from "./types";

interface DcPost {
  title: string;
  postNo: string;
  galleryId: string;
  author?: string;
  date?: string;
}

interface DcRawComment {
  memo: string;
  name: string;
  rcnt: string;
  reg_date: string;
}

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
];

function getRandomUserAgent(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

export function parsePostListHtml(html: string, galleryId: string): DcPost[] {
  if (!html) return [];
  const $ = cheerio.load(html);
  const posts: DcPost[] = [];

  $("tr.ub-content.us-post").each((_, el) => {
    const $el = $(el);
    const postNo = $el.attr("data-no");
    const title = $el.find(".gall_tit a").first().text().trim();
    const author = $el.find(".gall_writer .nickname").text().trim() || undefined;
    const date = $el.find(".gall_date").text().trim() || undefined;

    if (postNo && title) {
      posts.push({ title, postNo, galleryId, author, date });
    }
  });

  return posts;
}

export function parsePostDetailHtml(rawComments: DcRawComment[]): ParsedComment[] {
  return rawComments.map((c) => ({
    content: c.memo,
    author: c.name,
    likes: parseInt(c.rcnt) || 0,
    publishedAt: new Date(c.reg_date.replace(/\./g, "-")),
  }));
}

export class DcinsideCrawlerPlugin implements CrawlerPlugin {
  sourceType = "COMMUNITY" as const;
  private browser: any = null;

  private async getBrowser() {
    if (!this.browser) {
      const { chromium } = await import("playwright");
      this.browser = await chromium.launch({ headless: true });
    }
    return this.browser;
  }

  async crawl(celebrityId: string, keywords: string[]): Promise<CrawlerResult> {
    const articles: ParsedArticle[] = [];
    const comments = new Map<string, ParsedComment[]>();
    const browser = await this.getBrowser();

    for (const galleryId of keywords) {
      const page = await browser.newPage({
        userAgent: getRandomUserAgent(),
      });

      try {
        // 갤러리 검색 페이지 접속
        await page.goto(
          `https://gall.dcinside.com/board/lists?id=${galleryId}`,
          { waitUntil: "domcontentloaded", timeout: 10000 }
        );

        const html = await page.content();
        const posts = parsePostListHtml(html, galleryId);

        // 상위 20개 게시물만 처리
        for (const post of posts.slice(0, 20)) {
          const postUrl = `https://gall.dcinside.com/board/view/?id=${galleryId}&no=${post.postNo}`;

          articles.push({
            celebrityId,
            sourceType: "COMMUNITY",
            sourceUrl: postUrl,
            title: post.title,
            content: post.title,
            author: post.author,
            publishedAt: post.date ? new Date(post.date.replace(/\./g, "-")) : new Date(),
          });

          // 게시물 상세 페이지에서 댓글 수집
          try {
            const detailPage = await browser.newPage({ userAgent: getRandomUserAgent() });
            await detailPage.goto(postUrl, { waitUntil: "domcontentloaded", timeout: 10000 });

            // 디시인사이드 댓글 API 호출 (JSON)
            const commentData = await detailPage.evaluate(async (params: { galleryId: string; postNo: string }) => {
              const res = await fetch(`https://gall.dcinside.com/board/comment_page?id=${params.galleryId}&no=${params.postNo}`, {
                headers: { "X-Requested-With": "XMLHttpRequest" },
              });
              return res.json();
            }, { galleryId, postNo: post.postNo });

            const rawComments: DcRawComment[] = commentData?.comments ?? [];
            if (rawComments.length > 0) {
              comments.set(postUrl, parsePostDetailHtml(rawComments));
            }

            await detailPage.close();
          } catch {
            // 댓글 수집 실패 시 무시 (게시물은 이미 추가됨)
          }

          // Rate limiting: 3초 대기
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      } catch (err) {
        console.warn(`[DCINSIDE] 크롤링 실패: ${galleryId}`, err);
      } finally {
        await page.close();
      }
    }

    return { articles, comments };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}
```

- [ ] **Step 4: 테스트 실행 → 성공 확인**

```bash
pnpm vitest run src/workers/crawler/dcinside.test.ts
```

Expected: PASS (4/4)

- [ ] **Step 5: Playwright 의존성 설치**

```bash
pnpm add playwright
pnpm exec playwright install chromium
```

- [ ] **Step 6: 커밋**

```bash
git add src/workers/crawler/dcinside.ts src/workers/crawler/dcinside.test.ts
git commit -m "feat: 디시인사이드 크롤러 구현

Playwright 헤드리스 브라우저 기반 크롤링
- HTML 파싱 (cheerio), Rate limiting (3초)
- User-Agent 로테이션 (5패턴)
- celebrity_sources.search_keywords에 갤러리 ID 저장

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: 워커 통합 + 스케줄러

**Files:**
- Modify: `src/workers/index.ts`
- Modify: `src/app/api/crawl/trigger/route.ts`

- [ ] **Step 1: 플러그인 디스패치 로직 테스트 작성**

```typescript
// src/workers/crawler/dispatch.test.ts
import { describe, it, expect, vi } from "vitest";
import { CrawlerRegistry } from "./registry";
import type { CrawlerPlugin } from "./types";

describe("크롤러 디스패치", () => {
  it("sourceType에 맞는 플러그인을 호출한다", async () => {
    const registry = new CrawlerRegistry();
    const mockCrawl = vi.fn().mockResolvedValue({ articles: [], comments: new Map() });
    const plugin: CrawlerPlugin = { sourceType: "YOUTUBE", crawl: mockCrawl };
    registry.register(plugin);

    const crawler = registry.get("YOUTUBE");
    expect(crawler).toBeDefined();
    await crawler!.crawl("celeb-1", ["키워드"]);
    expect(mockCrawl).toHaveBeenCalledWith("celeb-1", ["키워드"]);
  });

  it("등록되지 않은 소스 타입은 undefined 반환", () => {
    const registry = new CrawlerRegistry();
    expect(registry.get("META")).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실행 → 성공 확인** (레지스트리는 Task 1에서 이미 구현됨)

- [ ] **Step 3: 워커 index.ts 리팩토링**

`src/workers/index.ts`를 수정:
- 플러그인 레지스트리에 5개 크롤러 등록
- crawl 워커가 `{ celebrityId, sourceType }` 잡 데이터를 받아 해당 플러그인 호출
- `processCrawlResult`로 DB 저장
- 스케줄러: 앱 시작 시 DB 기반으로 repeat jobs 등록

```typescript
// workers/index.ts 수정사항 핵심:
import { crawlerRegistry, processCrawlResult } from "./crawler/registry";
import { NaverCrawlerPlugin } from "./crawler/naver";
import { YouTubeCrawlerPlugin } from "./crawler/youtube";
import { TwitterCrawlerPlugin } from "./crawler/twitter";
import { MetaCrawlerPlugin } from "./crawler/meta";
import { DcinsideCrawlerPlugin } from "./crawler/dcinside";

// 플러그인 등록
crawlerRegistry.register(new NaverCrawlerPlugin());
crawlerRegistry.register(new YouTubeCrawlerPlugin());
crawlerRegistry.register(new TwitterCrawlerPlugin());
crawlerRegistry.register(new MetaCrawlerPlugin());
crawlerRegistry.register(new DcinsideCrawlerPlugin());

// 수집 주기 설정
const CRAWL_INTERVALS: Record<string, number> = {
  NAVER: 30 * 60 * 1000,      // 30분
  YOUTUBE: 60 * 60 * 1000,    // 1시간
  X: 2 * 60 * 60 * 1000,      // 2시간
  META: 2 * 60 * 60 * 1000,   // 2시간
  COMMUNITY: 60 * 60 * 1000,  // 1시간
};

// crawl 워커 수정: sourceType 기반 플러그인 선택
const crawlWorker = new Worker(
  QUEUE_NAMES.CRAWL,
  async (job) => {
    const { celebrityId, sourceType } = job.data;
    const plugin = crawlerRegistry.get(sourceType);
    if (!plugin) throw new Error(`크롤러 없음: ${sourceType}`);

    // 키워드 조회
    const celebrity = await prisma.celebrity.findUnique({
      where: { id: celebrityId },
      include: { sources: { where: { sourceType, enabled: true } } },
    });
    if (!celebrity) return;

    const keywords = celebrity.sources[0]?.searchKeywords
      ?? [celebrity.name, ...celebrity.aliases];

    const result = await plugin.crawl(celebrityId, keywords);
    const { articlesCreated, commentsCreated } = await processCrawlResult(
      result, celebrityId, sourceType
    );

    console.log(`[Crawl:${sourceType}] ${articlesCreated}건 기사, ${commentsCreated}건 댓글`);
  },
  { connection: redis, concurrency: 2, limiter: { max: 1, duration: 2000 } }
);

// 스케줄러: 시작 시 기존 repeat jobs 정리 후 재등록
async function setupSchedules() {
  // 기존 repeat jobs 제거
  const repeatJobs = await crawlQueue.getRepeatableJobs();
  for (const job of repeatJobs) {
    await crawlQueue.removeRepeatableByKey(job.key);
  }

  // DB에서 활성 소스 조회 후 등록
  const sources = await prisma.celebritySource.findMany({
    where: { enabled: true },
  });

  for (const source of sources) {
    const interval = CRAWL_INTERVALS[source.sourceType];
    if (!interval) continue;

    await crawlQueue.add(
      `crawl-${source.sourceType}-${source.celebrityId}`,
      { celebrityId: source.celebrityId, sourceType: source.sourceType },
      { repeat: { every: interval }, jobId: `schedule-${source.id}` }
    );
  }

  console.log(`[Scheduler] ${sources.length}개 스케줄 등록`);
}

setupSchedules();
```

- [ ] **Step 2: trigger API에 sourceType 추가**

```typescript
// src/app/api/crawl/trigger/route.ts 수정
// body: { celebrityId?, sourceType? }
// sourceType이 있으면 해당 소스만, 없으면 전체 활성 소스 크롤링
```

- [ ] **Step 3: 커밋**

```bash
git add src/workers/index.ts src/app/api/crawl/trigger/route.ts
git commit -m "feat: 워커 플러그인 레지스트리 통합 및 스케줄러

5개 크롤러 플러그인 등록, sourceType 기반 동적 디스패치
- BullMQ Repeat Jobs로 소스별 자동 스케줄링
- 앱 시작 시 기존 스케줄 정리 후 DB 기반 재등록
- trigger API에 sourceType 파라미터 추가

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: 스케줄/상태 API + 관리자 UI 업데이트

**Files:**
- Create: `src/app/api/crawl/schedule/route.ts`
- Create: `src/app/api/crawl/status/route.ts`
- Modify: `src/app/(dashboard)/admin/crawler/page.tsx`

- [ ] **Step 1: 스케줄 API 구현**

```typescript
// src/app/api/crawl/schedule/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import { crawlQueue } from "@/shared/lib/queue";

export async function POST(request: NextRequest) {
  const { celebrityId, sourceType, enabled } = await request.json();

  // celebrity_sources 업데이트 또는 생성
  const existing = await prisma.celebritySource.findFirst({
    where: { celebrityId, sourceType },
  });

  let source;
  if (existing) {
    source = await prisma.celebritySource.update({
      where: { id: existing.id },
      data: { enabled },
    });
  } else {
    source = await prisma.celebritySource.create({
      data: { celebrityId, sourceType, searchKeywords: [], enabled },
    });
  }

  return NextResponse.json(source);
}
```

- [ ] **Step 2: 상태 API 구현**

```typescript
// src/app/api/crawl/status/route.ts
import { NextResponse } from "next/server";
import { prisma } from "@/shared/lib/prisma";
import { crawlQueue } from "@/shared/lib/queue";

export async function GET() {
  // 소스별 최근 수집 기사
  const latestBySource = await prisma.article.groupBy({
    by: ["sourceType"],
    _max: { collectedAt: true },
    _count: true,
  });

  // 큐 상태
  const waiting = await crawlQueue.getWaitingCount();
  const active = await crawlQueue.getActiveCount();
  const failed = await crawlQueue.getFailedCount();

  // 스케줄된 잡 목록
  const repeatableJobs = await crawlQueue.getRepeatableJobs();

  return NextResponse.json({
    sources: latestBySource,
    queue: { waiting, active, failed },
    schedules: repeatableJobs.length,
  });
}
```

- [ ] **Step 3: 관리자 크롤러 페이지 업데이트**

`page.tsx`를 수정하여:
- 소스별 탭 또는 섹션 추가 (NAVER, YOUTUBE, X, META, COMMUNITY)
- 각 소스의 마지막 수집 시간 표시
- 소스별 개별 크롤링 트리거 버튼
- 큐 상태 표시 (대기/활성/실패)

- [ ] **Step 4: 커밋**

```bash
git add src/app/api/crawl/schedule/ src/app/api/crawl/status/ src/app/\(dashboard\)/admin/crawler/
git commit -m "feat: 크롤러 스케줄/상태 API 및 관리자 UI 업데이트

소스별 스케줄 관리 + 상태 모니터링 API
- 크롤러 상태 페이지에 소스별 정보 표시
- 큐 상태 (대기/활성/실패) 실시간 확인

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: 환경 변수 + 최종 정리

**Files:**
- Modify: `.env.example`
- Modify: `CLAUDE.md`

- [ ] **Step 1: .env.example 업데이트**

```bash
# 기존
DATABASE_URL="postgresql://celeb_user:celeb_pass@localhost:5437/celeb_news"
REDIS_URL="redis://localhost:6382"
NAVER_CLIENT_ID=""
NAVER_CLIENT_SECRET=""
NEXT_PUBLIC_APP_URL="http://192.168.0.5:3200"

# Phase 2A 추가
YOUTUBE_API_KEY=""
X_BEARER_TOKEN=""
META_APP_ID=""
META_APP_SECRET=""
META_PAGE_TOKEN=""
```

- [ ] **Step 2: CLAUDE.md 업데이트**

Phase 2A 완료 상태 반영, 새 의존성 및 환경 변수 문서화.

- [ ] **Step 3: 전체 테스트 실행**

```bash
pnpm vitest run
```

모든 테스트 통과 확인.

- [ ] **Step 4: 커밋**

```bash
git add .env.example CLAUDE.md
git commit -m "docs: Phase 2A 환경 변수 및 문서 업데이트

YouTube, X, Meta API 키 환경 변수 추가
- CLAUDE.md Phase 2A 완료 반영

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## 실행 순서 요약

| Task | 내용 | 의존성 | 병렬 가능 |
|------|------|--------|----------|
| 1 | 플러그인 인터페이스 + 레지스트리 | 없음 | - |
| 2 | 네이버 크롤러 리팩토링 | Task 1 | - |
| 3 | YouTube 크롤러 | Task 1 | Task 2, 4, 5, 6과 병렬 |
| 4 | X 크롤러 | Task 1 | Task 2, 3, 5, 6과 병렬 |
| 5 | Meta 크롤러 | Task 1 | Task 2, 3, 4, 6과 병렬 |
| 6 | 디시인사이드 크롤러 | Task 1 | Task 2, 3, 4, 5와 병렬 |
| 7 | 워커 통합 + 스케줄러 | Task 1-6 | - |
| 8 | API + 관리자 UI | Task 7 | - |
| 9 | 환경 변수 + 정리 | Task 8 | - |
