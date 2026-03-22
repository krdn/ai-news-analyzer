# AI News Analyzer — 셀럽 뉴스 감성 분석기

셀럽(정치인, 연예인, 기타)의 뉴스와 댓글을 수집하고 AI 감성 분석을 수행하는 웹 앱.

## 기술 스택
- Next.js 16 (App Router) + TypeScript
- Prisma 7 + PostgreSQL 16
- BullMQ + Redis 7 (잡 큐)
- shadcn/ui + Tailwind CSS 4 (다크 모드)
- Recharts (차트), SWR (데이터 페칭)
- Docker Compose (홈서버 배포)

## 구조 (FSD)
- `src/app/` — 라우팅만 (App Router)
- `src/widgets/` — 조합 컴포넌트 (sidebar, sentiment-chart, comment-feed)
- `src/features/` — 기능 단위 (sentiment-tracking)
- `src/entities/` — 비즈니스 엔티티 (celebrity, comment)
- `src/shared/` — 공유 리소스 (lib, config)
- `src/workers/` — 별도 컨테이너 워커 (crawler, analyzer, snapshot)
- `src/components/ui/` — shadcn/ui 컴포넌트

FSD 의존성: `app → widgets → features → entities → shared`

## 개발 명령어
```bash
pnpm dev --port 3200          # 개발 서버
pnpm vitest run               # 테스트
pnpm prisma migrate dev       # DB 마이그레이션
pnpm prisma studio            # DB GUI
docker compose up -d postgres redis  # DB/Redis 시작
```

## 포트
| 서비스 | 포트 |
|--------|------|
| App | 3200 |
| PostgreSQL | 5437 |
| Redis | 6382 |

## 환경 변수
`.env` 참조 (`.env.example`에 템플릿)
- `DATABASE_URL` — PostgreSQL 연결
- `REDIS_URL` — Redis 연결
- `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET` — 네이버 검색 API
- `YOUTUBE_API_KEY` — YouTube Data API v3
- `X_BEARER_TOKEN` — X(트위터) API v2
- `META_APP_ID` / `META_APP_SECRET` / `META_PAGE_TOKEN` — Meta Graph API
- `OLLAMA_URL` / `OLLAMA_MODEL` — Ollama LLM (심층 분석)

## 감성 분석 파이프라인
```
1단계 (규칙 기반, 전체 댓글) → sentiment.ts
  ↓ 대상 필터링 (confidence < 0.7 | 길이 > 50 | 좋아요 상위)
2단계 (Ollama LLM, 선별 댓글) → llm-analyzer.ts + deep-analysis.ts
  → emotions[], topics[] 채움
```

## 크롤러 플러그인 아키텍처
`src/workers/crawler/` — CrawlerPlugin 인터페이스 기반
| 소스 | 파일 | 수집 주기 |
|------|------|----------|
| 네이버 | `naver.ts` | 30분 |
| YouTube | `youtube.ts` | 1시간 |
| X(트위터) | `twitter.ts` | 2시간 |
| Meta | `meta.ts` | 2시간 |
| 디시인사이드 | `dcinside.ts` | 1시간 |

## 개발 단계
- Phase 1: 기반 + 네이버 뉴스 MVP ✅
- Phase 2A: 크롤러 소스 확장 ✅
- Phase 2B: Ollama LLM 심층 분석 ✅
- Phase 3A: 이벤트 감지 + 타임라인 + 비교 ✅
- Phase 3B: 알림 + 즐겨찾기
- Phase 4: 고도화
