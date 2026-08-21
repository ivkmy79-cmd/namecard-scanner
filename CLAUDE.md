# Card2Contact — 명함 스캐너

명함을 촬영해 글자를 인식하고, 주소록 파일(.vcf)로 내보내는 설치형 웹앱(PWA).
빌드 도구·프레임워크·npm 의존성이 **전혀 없습니다.** 정적 파일을 그대로 서빙하면 동작합니다.

## 파일 구조

```
index.html                  앱 전체 (HTML + CSS + JS 단일 파일, 약 1,300줄)
sw.js                       서비스워커 — 오프라인 캐시
manifest.webmanifest        홈 화면 설치 정보
netlify.toml                Netlify 설정 (publish=".", functions 디렉터리)
netlify/functions/ai.mjs    인식 엔진 프록시 (CORS 우회용, 선택)
netlify/functions/ocr.mjs   구버전 Gemini 전용 프록시 (하위 호환)
icon-*.png, favicon.png     앱 아이콘
```

**거의 모든 작업은 `index.html` 안에서 끝납니다.**

## index.html 내부 구조

`<style>` 하나, `<body>` 마크업, 마지막에 `<script>` 하나(전체가 IIFE). 주요 섹션은 주석으로 구분돼 있습니다.

| 섹션 주석 | 내용 |
|---|---|
| `/* util */` | `$()`, `toast()`, `dl()` (파일 내려받기) |
| `/* tabs */` | 촬영·저장목록·사용법 탭 전환 |
| `/* image preprocess */` | Tesseract용 그레이스케일·대비 보정 |
| `/* PARSER */` | `parseCard(text)` — OCR 텍스트를 이름/회사/전화/이메일로 분류 |
| `/* self-test */` | `selfTest()` — 한/영/베트남 명함 3종 회귀 테스트. 콘솔에 결과 출력 |
| `/* OCR flow */` | 카메라·파일 입력, Tesseract 실행(`runOCR`) |
| `/* 인식 엔진 */` | Groq / OCR.space / Gemini 호출부, `runAI()` |
| `/* 설정 화면 */` | 엔진 선택·키 저장·연결 시험 |
| `/* storage */` | localStorage 저장·불러오기 |
| `/* vCard / CSV */` | `vcard()`, `splitName()`, CSV 내보내기 |
| `/* list */` | 저장 목록 렌더링 |
| `/* PWA */` | 서비스워커 등록, 홈 화면 추가 |

## 주소록 등록 경로

`addToContacts(c)` 가 아래 순서로 자동 전환합니다.

1. **구글 People API** — `gLinked()` 가 true 면 `people:createContact` 로 직접 생성. 파일·탭 없음
2. **Web Share API Level 2** — `navigator.share({files})` 로 OS 공유 시트에 .vcf 전달
3. **파일 내려받기** — blob `<a download>`
4. **텍스트 복사 창** — iOS 홈화면 앱은 1·2 가 막히므로 여기로

구글 연결은 OAuth 클라이언트 ID(사용자가 직접 발급)와 GIS 토큰 클라이언트를 씁니다.
토큰은 `c2c_google_token` 에 만료시각과 함께 저장, 401/403 이면 재인증 후 1회 재시도.

주요 함수: `gAuth()`, `personBody()`, `gCreate()`, `gAddContact()`, `gAddMany()`, `gSync()`

## 인식 엔진

`runAI()` 가 `prov()` 값에 따라 분기합니다.

| 엔진 | 값 | 동작 | 키 형식 |
|---|---|---|---|
| Groq (Qwen3.6-27B) | `groq` | 이미지 → JSON 직행 | `gsk_…` 56자 |
| OCR.space | `ocrspace` | 글자만 추출 → `parseCard()` 로 분류 | `K…` 15자 내외 |
| Google Gemini | `gemini` | 이미지 → JSON 직행 (결제 필요) | `AIza…` 또는 `AQ.…` |
| Tesseract.js | (별도 버튼) | 오프라인 전용, 정확도 낮음 | 불필요 |

- 브라우저에서 직접 호출 → 실패하면 `netlify/functions/ai.mjs` 프록시로 자동 재시도
- 모든 요청은 `tfetch()` 로 감싸 시간제한이 걸려 있음 (45~60초)
- 키는 **localStorage 에만** 저장. 서버에 보관하지 않음

### localStorage 키

```
c2c_provider           선택된 엔진 ('groq' | 'ocrspace' | 'gemini')
c2c_google_client_id   구글 OAuth 클라이언트 ID
c2c_google_token       {token, exp} — 구글 액세스 토큰
c2c_key_groq        Groq API 키
c2c_key_ocrspace    OCR.space API 키
c2c_gemini_key      Gemini API 키
card2contact_v1     저장된 명함 배열(JSON)
```

## 로컬에서 실행하기

정적 서버 하나면 됩니다. **`localhost` 는 보안 컨텍스트로 취급되어 카메라도 동작합니다.**

```bash
# 방법 1 — 파이썬
python -m http.server 8080

# 방법 2 — node
npx serve -l 8080

# 방법 3 — Netlify 함수까지 함께 (프록시 경로 테스트용)
npx netlify-cli dev
```

브라우저에서 `http://localhost:8080` 접속.

- 함수(`/.netlify/functions/ai`) 는 방법 1·2 에서는 404 입니다. 앱은 이 경우 직접 호출만 씁니다.
- 서비스워커가 옛 파일을 붙잡고 있으면 개발자도구 → Application → Service Workers → Unregister.

## 테스트

파서 회귀 테스트가 페이지 로드 시 자동 실행됩니다. 콘솔에서 확인:

```
PARSER SELF-TEST 8/8
```

수동 재실행: 콘솔에서 `__selfTest()`

파서를 수정했다면 이 테스트가 8/8 을 유지하는지 반드시 확인하세요.
새 명함 유형을 지원한다면 `selfTest()` 의 `cases` 배열에 케이스를 추가하세요.

## 배포

Netlify 드래그 앤 드롭. 폴더 전체를 zip 으로 묶어 기존 프로젝트의 **Deploys** 화면에 떨어뜨립니다.
(프로젝트 목록 화면에 떨어뜨리면 새 프로젝트가 생기니 주의)

`sw.js` 의 `VERSION` 값을 올려야 사용자 기기의 캐시가 갱신됩니다.

## 코드 규칙

- **ES5 문법 유지** — 구형 모바일 브라우저 대응. `var`, `function`, 화살표 함수·`const`·템플릿 리터럴 사용하지 않음
- **외부 의존성 추가 금지** — Tesseract.js CDN 하나가 전부. 단일 파일 원칙을 지킬 것
- **localStorage/sessionStorage 는 앱 데이터용으로만** 사용
- 사용자에게 보이는 문구는 모두 한국어

## 알려진 제약

- 명함 촬영 비율은 90 × 50 mm (9:5) 고정. 실시간 카메라 촬영 시 이 영역만 잘라냄
- OCR.space 는 무료 등급에서 이미지 1MB 제한 → `imgToB64(img, 1400, 950000)` 로 압축
- OCR.space 응답이 10초 이상 걸리는 경우가 흔함
- Gemini 는 2026년 8월 기준 결제 계정 없이는 모든 모델이 403
