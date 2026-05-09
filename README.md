# 웹페이지 분석 도구 (Site Evaluation Toolkit)

블로그·웹사이트·웹앱을 평가하기 위한 무료 도구를 한 페이지에 카테고리별로 정리한 카탈로그 + **즉시 자동 분석** + **크롬 확장**.

> **LLM API 사용 안함** · 결정적 metric only · GitHub Pages 배포

## 두 가지 사용 방법

### 1. 웹 버전 (GitHub Pages)
URL을 입력하면 모든 외부 도구 링크가 자동으로 그 URL을 전달하도록 갱신되고, 즉시 자동 분석도 수행.

🔗 **https://jminbae.github.io/webpage-evaluator/**

### 2. 크롬 확장 (권장)
웹 버전의 한계(CORS 프록시 의존, JS 렌더링 전 HTML만 분석)를 해결.

#### 설치

```bash
# 1. 레포 클론 또는 ZIP 다운로드
git clone https://github.com/jminbae/webpage-evaluator.git

# 2. Chrome → chrome://extensions/
# 3. "개발자 모드" ON
# 4. "압축해제된 확장 프로그램을 로드합니다" → extension/ 폴더 선택
```

#### 기능

- **현재 탭 자동 인식** (URL 입력 불필요)
- **렌더링된 DOM 분석** (SPA·CSR 사이트도 정확)
- **CORS 우회** (host_permissions: `<all_urls>`)
- **17개 진단 카드 + 5개 카테고리 점수**
- **23개 외부 도구 자동 URL 전달** (Rich Results, Schema.org, PSI, WAVE, Wayback 등)
- **키워드 제안**: Google Suggest, Naver 자동완성, 페이지 H1·title 추출
- **도메인 정보**: Wayback 첫 스냅샷·총 스냅샷 수
- **(선택) PageSpeed Insights API**: Mobile/Desktop CWV 자동

## 기능 비교

| 항목 | 웹 버전 | 크롬 확장 |
|---|---|---|
| CORS 우회 | 공용 프록시 의존 (가끔 다운) | ❌ 없음 — 직접 fetch |
| DOM 분석 | 서버 사이드 HTML만 | ✅ 렌더링 후 DOM |
| URL 입력 | 매번 필요 | ✅ 현재 탭 자동 |
| 외부 도구 자동 전달 | ✅ | ✅ |
| 진단 카드 | 16개 | 17개 (+ E-E-A-T) |
| 키워드 제안 | ❌ | ✅ Google + Naver |
| 도메인 아카이브 정보 | ❌ | ✅ Wayback |
| 다중 페이지 분석 | ❌ | 가능 (개발 예정) |

## 카테고리 (외부 도구)

1. 🏗️ 구조화 데이터(Schema) 검증 — Rich Results, Schema.org, Classy
2. 🔍 SEO 기본 — GSC, Naver Search Advisor, Bing Webmaster
3. ⚡ 속도·CWV — PageSpeed Insights, Lighthouse
4. 🤖 AEO·GEO — AI Rank Lab, Geoptie, OtterlyAI, Chrome 확장
5. 📊 도메인 점수 — Ubersuggest, Moz, Ahrefs Webmaster, SimilarWeb
6. 🏪 로컬·비즈니스 — Google Business Profile, Naver 스마트플레이스
7. 📈 트렌드·키워드 — Google Trends, Naver DataLab
8. 👁️ 사용자 행동 — Microsoft Clarity, GA4
9. ♿ 접근성·기술 SEO — WAVE, Screaming Frog, This vs That
10. 📝 AEO 필수 파일 — robots.txt, llms.txt

## 자동 점검 항목 (LLM 없이)

### HTML 분석 (DOM 직접 파싱)
- JSON-LD 스키마 (블록 수, 타입, parse error)
- Title, description (길이 검증)
- OG 태그 (5개), Twitter Card (4개)
- Canonical, Hreflang
- Mobile viewport
- Heading 계층 (H1~H3)
- Image alt 누락, lazy loading
- Internal/external links
- FAQ/Q&A 스키마
- E-E-A-T 신호 (저자, 발행일, 조직, sameAs)
- 한국 SEO (RSS, lang, OG)

### 외부 fetch
- `/robots.txt` → 12개 AI 봇 차단 여부 (GPTBot, ClaudeBot, anthropic-ai, PerplexityBot, Google-Extended, CCBot, cohere-ai, Bytespider, Applebot-Extended, Diffbot, omgili, meta-externalagent)
- `/llms.txt` → 존재, 크기, H1 형식
- `/sitemap.xml` → URL 수
- Wayback Machine → 첫 스냅샷, 총 스냅샷 수
- (옵션) PageSpeed Insights API → Mobile/Desktop CWV

### 키워드 (Ubersuggest 일부 대체)
- 페이지 title·H1에서 시드 키워드 추출
- Google Suggest API (영문)
- Naver 자동완성 API (한국어)
- 질문 패턴 추출 (AEO 핵심)

## 점수 시스템

5개 카테고리 + 종합 점수 (모두 0~100):
- **Schema** — JSON-LD 완성도
- **Meta** — title/description/OG/canonical/viewport/heading/sitemap
- **AEO** — robots AI 봇, llms.txt, FAQ, E-E-A-T
- **Perf** — PSI Performance (PSI 키 입력 시)
- **A11y** — alt 텍스트, ARIA, semantic

## 프라이버시

- LLM API 사용 안함 (모든 분석은 결정적 로직)
- 외부 서버로 사용자 데이터 전송 없음
- PSI 키는 `chrome.storage.sync`에만 저장
- 호출하는 공개 API: Google PSI · Google Suggest · Naver 자동완성 · Wayback · 분석 대상 사이트의 robots/llms/sitemap

## 한계 (서드파티 독점 데이터)

다음은 외부에서 복제 불가능 (각 도구 직접 사용):
- Domain Authority (Moz), Domain Rating (Ahrefs) — 자체 인덱스
- 정확한 백링크 목록 — 자체 크롤링
- 키워드 검색량 — 자체 데이터
- GSC/Naver Advisor 데이터 — 본인 인증 필요

## 라이선스

MIT
