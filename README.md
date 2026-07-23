# 냉장고 레시피 앱 (Fridge Recipe App)

냉장고 사진을 업로드하면 AI가 식재료를 인식하고, 그 재료로 만들 수 있는 레시피를 추천해주는 웹 앱입니다.

## 기능 개요

3단계로 나뉘어 개발됩니다.

1. **재료 인식** — 냉장고 내부 사진을 업로드하면 비전 모델이 식재료 목록을 추출 (`docs/PRD_01.md`)
2. **레시피 생성** — 인식된 재료를 바탕으로 텍스트 생성 모델이 레시피를 추천 (`docs/PRD_02.md`)
3. **사용자 프로필 & 저장** — 회원가입/로그인 후 마음에 든 레시피를 저장/조회 (`docs/PRD_03.md`)

## 기술 스택

- **Backend**: FastAPI
- **Frontend**: 순수 HTML/CSS/JS (`static/`)
- **AI**: [OpenRouter](https://openrouter.ai) API (vision 모델 + text 모델)

## 시작하기

### 1. 의존성 설치

```bash
pip install -r requirements.txt
```

### 2. 환경변수 설정

`.env.example`을 참고해 `.env` 파일을 만들고 API 키를 채워주세요.

```bash
cp .env.example .env
```

```
OPENROUTER_API_KEY=<발급받은 키>
OPENROUTER_VISION_MODEL=nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free
OPENROUTER_TEXT_MODEL=openai/gpt-oss-20b:free
```

### 3. 서버 실행

```bash
uvicorn app.main:app --reload
```

실행 후 브라우저에서 `http://localhost:8000` 접속.

## API

| Method | Path | 설명 |
|---|---|---|
| GET | `/` | 프론트엔드 페이지 |
| POST | `/api/recognize` | 이미지 업로드 → 식재료 목록 인식 |
| POST | `/api/recipes` | 재료 목록 → 레시피 생성 |

## 프로젝트 구조

```
app/            FastAPI 백엔드 (라우팅, OpenRouter 연동)
static/         프론트엔드 (HTML/CSS/JS)
docs/           PRD 문서 (단계별 기획)
```
