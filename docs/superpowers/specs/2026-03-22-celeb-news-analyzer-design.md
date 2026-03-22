# 셀럽 뉴스 감성 분석기 — 설계 문서

## 개요

셀럽(정치인, 연예인, 기타)에 대한 뉴스와 댓글을 다양한 소스에서 수집하고, AI 기반 심층 감성 분석을 수행하며, 시계열 추적·이벤트 감지·셀럽 비교·실시간 알림 기능을 제공하는 웹 애플리케이션.

## 대상 사용자

- **일반 대중**: 관심 셀럽의 여론 흐름을 추적
- **마케팅/PR 전문가**: 클라이언트의 온라인 평판 모니터링 및 리포트
- **미디어/저널리스트**: 여론 트렌드 분석, 기사 소재 발굴

## 배포 환경

- 홈서버 전용 (192.168.0.5, Docker Compose)
- 외부 클라우드 의존 최소화

---

## 1. 아키텍처

### 전체 구조: Next.js + 이벤트 드리븐 워커

```
┌─────────────────────────────────────────────────────┐
│                   Docker Compose                     │
│                  (192.168.0.5)                       │
│                                                      │
│  ┌──────────────┐     ┌──────────────┐              │
│  │  Next.js App │────▶│  PostgreSQL  │              │
│  │  (UI + API)  │     │  (port 5435) │              │
│  │  port 3200   │     └──────────────┘              │
│  └──────┬───────┘                                    │
│         │                                            │
│         ▼                                            │
│  ┌──────────────┐     ┌──────────────────────────┐  │
│  │    Redis      │────▶│  워커 컨테이너들          │  │
│  │  (BullMQ)    │     │                          │  │
│  │  port 6382   │     │  ┌─────────────────────┐ │  │
│  └──────────────┘     │  │ 크롤러 워커          │ │  │
│                       │  │ (네이버,YT,X,Meta등) │ │  │
│                       │  └─────────────────────┘ │  │
│                       │  ┌─────────────────────┐ │  │
│                       │  │ AI 분석 워커         │ │  │
│                       │  │ (감성분석, 주제분류)  │ │  │
│                       │  └─────────────────────┘ │  │
│                       │  ┌─────────────────────┐ │  │
│                       │  │ 알림 워커            │ │  │
│                       │  │ (급변 감지, 발송)     │ │  │
│                       │  └─────────────────────┘ │  │
│                       └──────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### 설계 근거

- **Next.js App**: UI 렌더링과 API만 담당하여 가볍게 유지
- **Redis Queue (BullMQ)**: 크롤링/분석/알림을 비동기 잡으로 처리, 메인 앱 블로킹 방지
- **별도 워커 컨테이너**: 무거운 작업(크롤링 5개 소스, AI 분석)을 메인 앱과 격리하여 홈서버 안정성 확보
- **PostgreSQL**: 모든 영구 데이터 저장
- **Redis**: 잡 큐 + 캐시 용도

---

## 2. 데이터 모델

### celebrities (셀럽)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| name | VARCHAR(100) | 이름 |
| aliases | TEXT[] | 별명/다른 표기 (검색 키워드) |
| category | ENUM | 정치인 / 연예인 / 기타 |
| profile_image | TEXT | 프로필 이미지 URL |
| description | TEXT | 설명 |
| created_at | TIMESTAMP | 생성일 |
| updated_at | TIMESTAMP | 수정일 |

### celebrity_sources (셀럽별 수집 소스 설정)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| celebrity_id | UUID | FK → celebrities |
| source_type | ENUM | naver / youtube / x / meta / community |
| search_keywords | TEXT[] | 소스별 검색 키워드 |
| enabled | BOOLEAN | 수집 활성화 여부 |

### articles (수집된 기사/게시물)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| celebrity_id | UUID | FK → celebrities |
| source_type | ENUM | 수집 소스 |
| source_url | TEXT | 원문 URL (UNIQUE, 중복 제거 기준) |
| title | TEXT | 제목 |
| content | TEXT | 본문 (요약 또는 전문) |
| author | VARCHAR(200) | 작성자 |
| published_at | TIMESTAMP | 원문 게시 시간 |
| collected_at | TIMESTAMP | 수집 시간 |
| sentiment_score | FLOAT | 기사 전체 감성 점수 (-1.0 ~ 1.0) |
| sentiment_label | ENUM | very_positive / positive / neutral / negative / very_negative |

### comments (댓글)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| article_id | UUID | FK → articles |
| content | TEXT | 댓글 내용 |
| author | VARCHAR(200) | 작성자 |
| likes | INTEGER | 좋아요 수 |
| published_at | TIMESTAMP | 댓글 작성 시간 |
| sentiment_score | FLOAT | 감성 점수 (-1.0 ~ 1.0) |
| sentiment_confidence | FLOAT | 1단계 모델 확신도 (0 ~ 1.0). < 0.7이면 2단계 분석 대상 |
| sentiment_label | ENUM | very_positive / positive / neutral / negative / very_negative |
| emotions | TEXT[] | 감정 태그 (분노, 조롱, 응원, 동정 등) |
| topics | TEXT[] | 주제 태그 (연기력, 인성, 외모 등) |
| analysis_depth | ENUM | basic (1단계) / deep (2단계 LLM) |

### sentiment_snapshots (시계열 집계)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| celebrity_id | UUID | FK → celebrities |
| period_type | ENUM | hourly / daily / weekly |
| period_start | TIMESTAMP | 집계 기간 시작 |
| source_type | ENUM | 소스별 집계 (nullable = 전체) |
| total_comments | INTEGER | 댓글 수 |
| avg_score | FLOAT | 평균 감성 점수 |
| positive_count | INTEGER | 긍정 댓글 수 |
| neutral_count | INTEGER | 중립 댓글 수 |
| negative_count | INTEGER | 부정 댓글 수 |
| top_emotions | JSONB | 주요 감정 분포 |
| top_topics | JSONB | 주요 주제 분포 |

### events (이벤트/사건)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| celebrity_id | UUID | FK → celebrities |
| title | VARCHAR(300) | 이벤트 제목 |
| description | TEXT | 상세 설명 |
| event_date | TIMESTAMP | 사건 발생일 |
| detected_at | TIMESTAMP | 감지/등록 시간 |
| sentiment_before | FLOAT | 이벤트 전 감성 점수 |
| sentiment_after | FLOAT | 이벤트 후 감성 점수 |
| impact_score | FLOAT | 영향도 점수 (0 ~ 1.0) |
| auto_detected | BOOLEAN | AI 자동 감지 여부 |

### alerts (알림 설정 & 이력)

| 컬럼 | 타입 | 설명 |
|------|------|------|
| id | UUID | PK |
| celebrity_id | UUID | FK → celebrities |
| alert_type | ENUM | sentiment_drop / sentiment_spike / volume_spike / keyword |
| threshold | FLOAT | 트리거 임계값 |
| channel | ENUM | email / telegram / webhook |
| channel_config | JSONB | 채널별 설정 (이메일 주소, 텔레그램 chat_id 등) |
| enabled | BOOLEAN | 활성화 여부 |
| last_triggered_at | TIMESTAMP | 마지막 발동 시간 |

### 인덱스 전략

- `articles`: (celebrity_id, published_at), (source_url) UNIQUE
- `comments`: (article_id), (sentiment_score), (published_at)
- `sentiment_snapshots`: (celebrity_id, period_type, period_start)
- `events`: (celebrity_id, event_date)

---

## 3. 크롤러 & 데이터 수집 파이프라인

### 소스별 크롤러

| 소스 | 수집 방법 | 수집 주기 | 비고 |
|------|----------|----------|------|
| 네이버 뉴스 | 네이버 검색 API + 댓글 비공식 API | 30분 | 댓글 API는 비공식, 변경 가능성 있음 |
| YouTube | YouTube Data API v3 | 1시간 | 일일 할당량 10,000 units (무료) |
| X (트위터) | X API v2 | 1시간 | Free tier 또는 Basic ($200/mo) |
| Meta | Instagram/Facebook Graph API | 2시간 | 공개 페이지/게시물 댓글만 |
| 커뮤니티 | Playwright 헤드리스 브라우저 | 1시간 | 디시인사이드, 더쿠 등. robots.txt 준수 |

### 파이프라인 흐름

```
크롤러 → [raw_queue] → 정규화 → [normalize_queue] → 중복 제거(source_url 해시)
   → DB 저장 → [analysis_queue] → AI 감성 분석 워커
   → 분석 결과 DB 업데이트 → [snapshot_queue] → 집계 워커
   → sentiment_snapshots 업데이트 → [alert_queue] → 알림 체크
```

### 설계 원칙

- 각 소스별 크롤러는 독립 BullMQ 잡 → 하나 실패해도 다른 소스 영향 없음
- 중복 제거: `source_url` 기준 해시
- Rate limiting: 소스별 요청 간격 설정
- Playwright는 API 없는 커뮤니티 소스에만 사용

---

## 4. AI 감성 분석 엔진

### 2단계 파이프라인

**1단계: 로컬 경량 모델 (비용 $0, 전체 댓글 100% 처리)**

- 모델: KcELECTRA 또는 KoBERT (한국어 특화 감성 분류)
- 출력: 감성 점수 (-1.0 ~ 1.0) + 5단계 라벨
- 처리 속도: ~50ms/댓글
- 구현: Transformers.js 또는 Python 마이크로서비스

**2단계: LLM 심층 분석 (선택적, 중요 댓글만)**

- 모델: Ollama (gemma2/llama3 등 로컬 LLM) 우선, Claude API 폴백
- 분석 내용:
  - 복합 감정 분리 ("연기는 잘하는데 인성이..." → {연기력: +0.8, 인성: -0.7})
  - 감정 태깅 (분노, 조롱, 응원, 동정, 무관심 등)
  - 주제 추출 (연기력, 외모, 발언, 사생활 등)
- 적용 대상:
  - 1단계 확신도 낮은 댓글 (confidence < 0.7)
  - 길이가 긴 댓글 (> 50자)
  - 좋아요 수 상위 댓글 (영향력 높은)

### 이벤트 자동 감지

- 감성 점수 급변 감지: 이동평균 대비 ±2σ (Z-score)
- 댓글량 급증 감지: 평소 대비 3배 이상
- 새로운 주제 클러스터 출현
- → events 테이블에 자동 등록 + alert_queue로 알림 트리거

---

## 5. 프론트엔드 UI

### 주요 화면

1. **메인 대시보드**: 즐겨찾기 셀럽의 여론 요약 카드, 핫 이벤트, 전체 트렌드
2. **셀럽 상세 페이지**:
   - 시계열 감성 그래프 (일/주/월, 소스별 필터)
   - 감정 분포 도넛 차트
   - 주제별 감성 히트맵 (연기력, 인성, 외모 등)
   - 최근 댓글 피드 (감성 라벨 + 원문 링크)
3. **셀럽 비교 페이지**: 2~4명 나란히 비교, 오버레이 차트, 레이더 차트
4. **이벤트 타임라인**: 시간순 이벤트 목록, 전후 감성 비교, 관련 기사/댓글 모아보기
5. **관리자 페이지**: 크롤러 상태 모니터링, 셀럽 CRUD, AI 분석 큐 현황, 알림 규칙 관리

### 네비게이션

- 사이드바: 셀럽 검색, 즐겨찾기 목록, 대시보드, 알림 설정, 관리

### UI 설계 원칙

- 다크 모드 기본 (데이터 대시보드에 적합)
- zinc/neutral 토큰 + 감성 색상 (초록=긍정, 회색=중립, 빨강=부정)
- Geist Sans (인터페이스) + Geist Mono (수치/ID)

---

## 6. 기술 스택

| 영역 | 기술 | 선택 이유 |
|------|------|----------|
| 프레임워크 | Next.js 16 (App Router) | Server Components, Server Actions, 풀스택 |
| 언어 | TypeScript | 타입 안전성 |
| UI 라이브러리 | shadcn/ui + Tailwind CSS | 커스텀 가능, 다크 모드 |
| 차트 | Recharts | React 네이티브, 다양한 차트 타입 |
| 데이터 페칭 | SWR | 실시간 갱신, 폴링 |
| 테이블 | TanStack Table | 정렬, 필터, 페이지네이션 |
| ORM | Prisma | 타입 안전 쿼리, 마이그레이션 |
| 잡 큐 | BullMQ | Redis 기반, 재시도/DLQ/스케줄링 |
| 유효성 검증 | Zod | 런타임 타입 검증 |
| HTML 크롤링 | Axios + Cheerio | 경량, 빠름 |
| 브라우저 크롤링 | Playwright | 커뮤니티 사이트용 |
| 로컬 AI | Transformers.js | 브라우저/Node.js 경량 모델 |
| 로컬 LLM | Ollama | 무료, 로컬 실행 |
| 폰트 | Geist Sans + Mono | Vercel 디자인 시스템 |
| DB | PostgreSQL 16 | JSONB, 배열, 안정성 |
| 캐시/큐 | Redis 7 | BullMQ + 캐시 |
| 컨테이너 | Docker Compose | 홈서버 단일 배포 |
| 테스트 | Vitest + Playwright | 단위/통합 + E2E |

---

## 7. 프로젝트 구조 (FSD)

```
src/
├── app/                          # Next.js App Router (라우팅만)
│   ├── (dashboard)/
│   │   ├── page.tsx              # 메인 대시보드
│   │   ├── celebrity/[id]/       # 셀럽 상세
│   │   ├── compare/              # 셀럽 비교
│   │   ├── events/               # 이벤트 타임라인
│   │   └── admin/                # 관리자
│   ├── api/                      # API Routes
│   └── layout.tsx
│
├── widgets/                      # 조합 컴포넌트
│   ├── sidebar/
│   ├── sentiment-chart/
│   ├── emotion-donut/
│   ├── topic-heatmap/
│   └── comment-feed/
│
├── features/                     # 기능 단위
│   ├── celebrity-search/
│   ├── sentiment-tracking/
│   ├── event-detection/
│   ├── celeb-comparison/
│   └── alert-management/
│
├── entities/                     # 비즈니스 엔티티
│   ├── celebrity/
│   ├── article/
│   ├── comment/
│   └── event/
│
├── shared/                       # 공유 리소스
│   ├── ui/                       # shadcn/ui
│   ├── lib/
│   ├── api/
│   └── config/
│
└── workers/                      # 별도 컨테이너에서 실행
    ├── crawler/                  # 소스별 크롤러
    ├── analyzer/                 # AI 분석
    └── notifier/                 # 알림 발송
```

FSD 의존성 규칙: `app → widgets → features → entities → shared`

---

## 8. 에러 처리 & 복원력

### 크롤러

- 재시도: 실패 시 3회 (지수 백오프: 1s → 4s → 16s)
- 서킷 브레이커: 연속 5회 실패 시 해당 소스 30분 일시 중단
- Rate Limiting: 소스별 요청 간격 준수
- Dead Letter Queue: 3회 실패 잡 → DLQ → 관리자 페이지에서 확인
- 헬스체크: 각 크롤러 마지막 성공 시간 모니터링

### AI 분석

- 로컬 모델 실패 → 기본 감성(중립) 할당 + 재분석 큐 등록
- Ollama 다운 → 1단계 결과만 저장, 복구 후 배치 처리
- 메모리 관리: 배치 사이즈 제한 (100댓글/배치)

### 인프라

- DB 연결 풀링 (Prisma connection pool: 10)
- Redis 자동 재연결 (BullMQ 기본 제공)
- Docker 컨테이너: `restart: unless-stopped`

---

## 9. 포트 배정

| 서비스 | 포트 | 비고 |
|--------|------|------|
| Next.js App | 3200 | 기존 서비스와 충돌 없음 |
| PostgreSQL | 5435 | 기존 5433, 5434 사용 중 |
| Redis | 6382 | 기존 6380, 6381 사용 중 |
| Ollama | 11434 | 기본 포트 |

---

## 10. 개발 단계 (서브 프로젝트)

### Phase 1: 기반 구축 + 네이버 뉴스 (MVP)

- 프로젝트 스캐폴딩 (Next.js, Docker Compose, Prisma)
- 셀럽 CRUD + 검색
- 네이버 뉴스 크롤러 (기사 + 댓글)
- 1단계 감성 분석 (로컬 모델)
- 기본 대시보드 (감성 추이 차트)
- **목표**: 하나의 소스로 전체 파이프라인 검증

### Phase 2: 소스 확장 + 심층 분석

- YouTube, X, Meta, 커뮤니티 크롤러 추가
- 2단계 LLM 심층 분석 (Ollama)
- 이벤트 자동 감지
- 주제별 감성 히트맵
- **목표**: 전체 소스 통합 + AI 심층 분석

### Phase 3: 추적 & 비교 기능

- 셀럽 간 비교 페이지
- 이벤트 타임라인
- 실시간 알림 (Telegram/이메일)
- 즐겨찾기 + 개인화
- **목표**: 추적/비교/알림 완성

### Phase 4: 고도화

- 리포트 생성 (PDF 내보내기)
- 사용자 인증 (관리자 vs 일반)
- 성능 최적화 (캐싱, 인덱싱)
- 관리자 대시보드 완성
- **목표**: 프로덕션 수준 완성

---

## 부록: 기술적 위험 & 완화 방안

| 위험 | 영향 | 완화 방안 |
|------|------|----------|
| 네이버 댓글 API 변경 | 댓글 수집 중단 | 비공식 API 모니터링 + Playwright 폴백 |
| X API 비용 증가 | 운영 비용 상승 | Free tier 한도 내 운영 또는 소스 비활성화 |
| 커뮤니티 사이트 차단 | 수집 불가 | User-Agent 로테이션, 요청 간격 준수 |
| Ollama 메모리 부족 | 분석 실패 | 작은 모델 (7B) 사용, 배치 사이즈 조절 |
| 홈서버 성능 한계 | 전체 서비스 지연 | 크롤링 주기 조절, 워커 동시성 제한 |
