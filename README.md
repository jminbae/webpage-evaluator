# 웹페이지 분석 도구 (Site Evaluation Toolkit)

블로그·웹사이트·웹앱을 평가하기 위한 무료 도구를 한 페이지에 카테고리별로 정리한 카탈로그.

## 미리보기

`index.html`을 브라우저로 열거나 GitHub Pages로 배포하면 바로 사용 가능합니다.

## 카테고리

1. 🏗️ 구조화 데이터(Schema) 검증
2. 🔍 SEO 기본 (검색엔진 등록·관리)
3. ⚡ 페이지 속도·Core Web Vitals
4. 🤖 AEO·GEO (AI 검색 가시성)
5. 📊 도메인 점수·백링크
6. 🏪 로컬·비즈니스 노출
7. 📈 트렌드·키워드 리서치
8. 👁️ 사용자 행동 분석
9. ♿ 접근성·기술 SEO
10. 📝 AEO 필수 파일 (robots.txt, llms.txt)

## 종합 분석 도구 (개발 예정)

URL 한 개를 입력하면 위 도구들의 핵심 점검을 자동으로 돌리고 Claude가 자연어 보고서를 작성하는 별도 웹앱.

### 기술 스택 (안)

```
analyzer/
├── frontend/        Next.js + Tailwind (Vercel 무료 호스팅)
├── api/             Vercel Serverless Functions
│   ├── psi          Google PageSpeed Insights API (무료)
│   ├── schema       JSON-LD 추출 및 검증
│   ├── robots       robots.txt → AI 크롤러 점검
│   ├── llms         llms.txt 존재 + 형식 검증
│   ├── meta         OG/Twitter Card/canonical/viewport
│   └── claude       Claude API 종합 보고서 생성
└── README.md
```

### 자동 점검 항목

- Google PageSpeed Insights API → Core Web Vitals
- HTML 파싱 → JSON-LD/meta/OG 추출
- robots.txt → GPTBot, ClaudeBot, PerplexityBot, Google-Extended 허용 여부
- llms.txt 존재 및 형식
- 이미지 alt·크기, 모바일 viewport, canonical, hreflang
- Schema 타입별 필수 필드 (LocalBusiness/Person/Article 등)
- 한국 SEO 가이드 체크리스트 (네이버)
- Claude API 종합 진단 리포트

### BYOK (Bring Your Own Key)

사용자가 직접 Claude API 키와 Google PSI 키를 입력하는 방식으로 비용 0원 운영.

## 배포 (GitHub Pages)

1. GitHub 새 레포 생성 (예: `site-evaluation-toolkit`)
2. 이 폴더의 파일을 push
3. Settings → Pages → Source: `main` branch / `/ (root)` → Save
4. `https://{username}.github.io/site-evaluation-toolkit/` 접속

## 라이선스

MIT
