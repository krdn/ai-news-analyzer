# Phase 2A: 크롤러 소스 확장 — 설계 문서

## 개요

Phase 1에서 구축한 네이버 뉴스 크롤러 기반 위에, YouTube, X(트위터), Meta(인스타/페이스북), 디시인사이드 크롤러를 추가한다. 크롤러 플러그인 아키텍처를 도입하여 소스 추가를 일관되게 관리한다.

## 범위

| 소스 | 수집 방법 | 수집 주기 | API 비용 |
|------|----------|----------|---------|
| YouTube | YouTube Data API v3 | 1시간 | 무료 (10,000 units/day) |
| X (트위터) | X API v2 Free tier | 2시간 | 무료 (월 1,500 트윗) |
| Meta | Graph API (공개 페이지) | 2시간 | 무료 (App 생성 필요) |
| 디시인사이드 | Playwright 헤드리스 | 1시간 | 무료 (IP 차단 주의) |

## 범위 외

- LLM 심층 분석 (Phase 2B에서 진행)
- 더쿠, 에펨코리아 등 추가 커뮤니티
- 새로운 UI 페이지 (기존 관리자 페이지 업데이트만)

---

## 1. 크롤러 플러그인 아키텍처

### 인터페이스

```typescript
// src/workers/crawler/types.ts

interface ParsedArticle {
  celebrityId: string;
  sourceType: SourceType;
  sourceUrl: string;
  title: string;
  content: string;
  author?: string;
  publishedAt: Date;
}

interface ParsedComment {
  content: string;
  author: string;
  likes: number;
  publishedAt: Date;
}

interface CrawlerResult {
  articles: ParsedArticle[];
  comments: Map<string, ParsedComment[]>; // articleSourceUrl → comments
}

interface CrawlerPlugin {
  sourceType: SourceType;
  crawl(celebrityId: string, keywords: string[]): Promise<CrawlerResult>;
}
```

### 플러그인 레지스트리

```typescript
// src/workers/crawler/registry.ts

const crawlerRegistry: Map<SourceType, CrawlerPlugin>;

function registerCrawler(plugin: CrawlerPlugin): void;
function getCrawler(sourceType: SourceType): CrawlerPlugin | undefined;

// DB 저장 + 분석 큐 추가 공통 로직
async function processCrawlResult(
  result: CrawlerResult,
  celebrityId: string,
  sourceType: SourceType
): Promise<{ articlesCreated: number; commentsCreated: number }>;
```

`processCrawlResult`는 기존 `crawlNaverForCelebrity`에서 DB 저장 + 큐 추가 로직을 추출한 것이다. 모든 크롤러가 공유한다:
1. `sourceUrl` 기준 중복 체크
2. 새 기사 DB 저장
3. 해당 기사의 댓글 DB 저장
4. `analysisQueue`에 분석 잡 추가

### 네이버 크롤러 리팩토링

기존 `naver.ts`를 `CrawlerPlugin` 인터페이스에 맞게 수정:
- `crawlNaverForCelebrity` → DB 저장 로직 제거, `CrawlerResult` 반환
- `parseNaverSearchResponse`, `fetchNaverNews`, `fetchNaverComments`는 그대로 유지
- 새 `NaverCrawlerPlugin` 클래스 export

---

## 2. 소스별 크롤러

### YouTube 크롤러

```
YouTube Data API v3
├── 검색: GET /youtube/v3/search
│   ├── params: q, type=video, order=date, maxResults=10
│   ├── 비용: 100 units/요청
│   └── 응답 → videoId 목록
├── 댓글: GET /youtube/v3/commentThreads
│   ├── params: videoId, maxResults=100, order=relevance
│   ├── 비용: 1 unit/요청
│   └── 응답 → comment.textDisplay, authorDisplayName, likeCount
├── 일일 할당량 관리
│   ├── 총 10,000 units/day (무료)
│   ├── 검색 20회 = 2,000 units
│   ├── 댓글 80회 = 80 units
│   └── 여유: ~7,920 units
└── 파싱
    ├── 기사 = YouTube 동영상 (title, url, publishedAt)
    └── 댓글 = commentThread의 topLevelComment
```

**환경 변수:** `YOUTUBE_API_KEY`

**에러 처리:**
- 403 (할당량 초과): 당일 크롤링 중단, 로그 기록
- 404 (동영상 삭제): 건너뛰기

### X (트위터) 크롤러

```
X API v2 Free tier
├── 검색: GET /2/tweets/search/recent
│   ├── params: query, max_results=10
│   ├── 제한: 월 1,500 트윗 읽기
│   └── 1 요청당 15초 대기 필수
├── 트윗 = "기사"로 취급
│   ├── text, author_id, created_at
│   └── public_metrics.reply_count, retweet_count, like_count
├── 댓글 수집 방법 (Free tier 제한)
│   ├── Free tier에서 conversation_id 기반 reply 검색 불가
│   └── 대안: 트윗 자체만 수집, 댓글은 빈 배열
│       (인용/멘션은 별도 트윗으로 수집됨)
├── 할당량 전략
│   ├── 셀럽 수에 따라 수집 빈도 자동 조절
│   ├── 월초에 일일 한도 계산: 1500 / 30 / 셀럽수
│   ├── 월간 사용량 추적: Redis 카운터 (키: x_monthly_count, TTL: 월말까지)
│   └── 한도 도달 시 해당 월 크롤링 자동 중단
└── 파싱
    ├── 기사 = 트윗 (content=text, sourceUrl=tweet URL)
    └── 댓글 = 빈 배열 (Free tier 제한)
```

**환경 변수:** `X_BEARER_TOKEN`

**에러 처리:**
- 429 (Rate limit): 15초 대기 후 재시도
- 월간 한도 도달: 로그 + 다음 달까지 비활성화

### Meta 크롤러

```
Graph API v21.0
├── Facebook 페이지 게시물
│   ├── GET /{page-id}/posts
│   ├── fields: message, created_time, permalink_url
│   └── 댓글: GET /{post-id}/comments (message, from, like_count, created_time)
├── Instagram 비즈니스 계정 미디어
│   ├── GET /{ig-user-id}/media
│   ├── fields: caption, timestamp, permalink
│   └── 댓글: GET /{media-id}/comments (text, username, timestamp)
├── 인증
│   ├── Facebook App 생성 필요
│   ├── Page Access Token (장기 토큰, 60일)
│   ├── 자동 갱신: GET /oauth/access_token?grant_type=fb_exchange_token
│   ├── 갱신된 토큰은 DB(celebrity_sources.search_keywords JSON)에 저장 (env만 의존하면 재시작 시 유실)
│   └── 갱신 실패 시 알림 발송
├── 셀럽 설정
│   ├── celebrity_sources 레코드에 page_id / ig_user_id 저장
│   └── search_keywords 대신 소셜 계정 ID를 사용
└── 파싱
    ├── 기사 = 게시물 (title=message 앞 100자, content=전체)
    └── 댓글 = 게시물 댓글
```

**환경 변수:** `META_APP_ID`, `META_APP_SECRET`, `META_PAGE_TOKEN`

**에러 처리:**
- 190 (토큰 만료): 자동 갱신 시도, 실패 시 해당 소스 비활성화 + 로그
- 4 (Rate limit): 재시도 (지수 백오프)

### 디시인사이드 크롤러

```
Playwright 헤드리스 브라우저
├── 검색 URL: https://gall.dcinside.com/board/lists?id={갤러리ID}&s_keyword={검색어}
├── 게시물 목록 파싱
│   ├── CSS 셀렉터: .gall_list .ub-content
│   ├── 제목, 작성자, 날짜, 조회수, 추천수 추출
│   └── 개별 게시물 URL 생성
├── 게시물 상세 파싱
│   ├── 본문: .write_div
│   └── 댓글: .reply_list .usertxt
├── Rate limiting
│   ├── 요청 간 3초 대기
│   ├── User-Agent 로테이션 (5개 패턴)
│   └── 동시 탭: 최대 2개
├── Playwright 인스턴스 관리
│   ├── 워커 시작 시 브라우저 1개 생성
│   ├── 크롤링 시 새 페이지(탭) 열기 → 완료 후 닫기
│   ├── 메모리 관리: 50개 게시물 처리 후 브라우저 재시작
│   └── 워커 종료 시 브라우저 정리 (graceful shutdown)
├── 갤러리 ID 관리
│   ├── celebrity_sources.search_keywords에 갤러리 ID 저장
│   └── 예: ["hit"] (연예인 갤러리), ["politics_talk"] (정치 갤러리)
└── 파싱
    ├── 기사 = 게시물 (title, content=본문텍스트)
    └── 댓글 = 게시물 댓글
```

**에러 처리:**
- 차단 (403/Captcha): 서킷 브레이커 (5연속 실패 → 30분 중단)
- HTML 구조 변경: 셀렉터 실패 감지 → 로그 경고 + DLQ
- 타임아웃: 페이지 로딩 10초 제한

---

## 3. 워커 통합

### crawl 워커 수정

```
기존:
  잡 데이터: { celebrityId }
  → crawlNaverForCelebrity(celebrityId)

변경:
  잡 데이터: { celebrityId, sourceType }
  → registry.getCrawler(sourceType).crawl(celebrityId, keywords)
  → registry.processCrawlResult(result, celebrityId, sourceType)
```

### 스케줄러 (BullMQ Repeat Jobs)

앱 시작 시 또는 API 호출로 각 셀럽의 활성 소스에 대해 반복 잡을 등록한다.

```
소스별 기본 수집 주기:
├── NAVER:     every 30min (기존)
├── YOUTUBE:   every 1h
├── X:         every 2h
├── META:      every 2h
└── COMMUNITY: every 1h
```

`celebrity_sources` 테이블의 `enabled` 플래그가 `false`면 스케줄에서 제외.

**재시작 처리:** 앱 시작 시 기존 BullMQ repeat jobs를 모두 제거한 뒤 DB 기반으로 재등록한다. 이렇게 하면 중복 스케줄이 생기지 않는다.

### 새 API

```
POST /api/crawl/schedule
├── body: { celebrityId, sourceType, enabled, interval? }
├── BullMQ repeat job 등록/해제
└── celebrity_sources 레코드 업데이트

GET /api/crawl/status
├── 각 소스별 마지막 수집 시간
├── 큐 대기 잡 수
├── 최근 에러 목록 (DLQ)
└── 할당량 사용 현황 (YouTube units, X 트윗 수)
```

---

## 4. 환경 변수

```
# 기존
NAVER_CLIENT_ID=""
NAVER_CLIENT_SECRET=""

# Phase 2A 추가
YOUTUBE_API_KEY=""
X_BEARER_TOKEN=""
META_APP_ID=""
META_APP_SECRET=""
META_PAGE_TOKEN=""
```

---

## 5. 파일 구조

```
src/workers/crawler/
├── types.ts           (신규) CrawlerPlugin, ParsedArticle, ParsedComment 인터페이스
├── registry.ts        (신규) 플러그인 레지스트리 + processCrawlResult
├── naver.ts           (수정) NaverCrawlerPlugin으로 리팩토링
├── youtube.ts         (신규) YouTubeCrawlerPlugin
├── twitter.ts         (신규) TwitterCrawlerPlugin
├── meta.ts            (신규) MetaCrawlerPlugin
├── dcinside.ts        (신규) DcinsideCrawlerPlugin
├── naver.test.ts      (수정) 리팩토링 반영
├── youtube.test.ts    (신규)
├── twitter.test.ts    (신규)
├── meta.test.ts       (신규)
└── dcinside.test.ts   (신규)

src/workers/index.ts   (수정) 플러그인 레지스트리 연동 + 스케줄러

src/app/api/crawl/
├── trigger/route.ts   (수정) sourceType 파라미터 추가
├── schedule/route.ts  (신규) 스케줄 관리 API
└── status/route.ts    (신규) 크롤러 상태 API

src/app/(dashboard)/admin/crawler/
└── page.tsx           (수정) 소스별 상태 표시 + 스케줄 토글

.env.example           (수정) 새 API 키 추가
```

---

## 6. 에러 처리 전략

| 소스 | 주요 에러 | 대응 |
|------|----------|------|
| YouTube | 403 할당량 초과 | 당일 크롤링 중단, 다음 날 자동 재개 |
| X | 429 Rate limit | 15초 대기 후 재시도 |
| X | 월간 한도 도달 | 로그 + 다음 달까지 자동 비활성화 |
| Meta | 190 토큰 만료 | 자동 갱신 시도, 실패 시 소스 비활성화 + 로그 |
| Meta | 4 Rate limit | 지수 백오프 재시도 |
| 디시 | 403/Captcha 차단 | 서킷 브레이커 (5연속 실패 → 30분 중단) |
| 디시 | HTML 구조 변경 | 셀렉터 실패 감지 → 경고 로그 + DLQ |
| 공통 | 네트워크 에러 | 3회 재시도 (지수 백오프 1s→4s→16s), 이후 DLQ |

---

## 7. 의존성 추가

```bash
pnpm add googleapis    # YouTube Data API
pnpm add playwright    # 디시인사이드 크롤링
```

X API, Meta Graph API는 기존 axios로 직접 호출.

---

## 8. 개발 순서

| Task | 내용 | 의존성 |
|------|------|--------|
| 1 | 크롤러 플러그인 인터페이스 + 레지스트리 | 없음 |
| 2 | 네이버 크롤러 리팩토링 | Task 1 |
| 3 | YouTube 크롤러 | Task 1 |
| 4 | X 크롤러 | Task 1 |
| 5 | Meta 크롤러 | Task 1 |
| 6 | 디시인사이드 크롤러 | Task 1 |
| 7 | 워커 통합 + 스케줄러 | Task 1-6 |
| 8 | 스케줄/상태 API + 관리자 UI 업데이트 | Task 7 |
| 9 | 환경 변수 + 최종 정리 | Task 8 |
