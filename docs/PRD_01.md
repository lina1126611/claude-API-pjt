# PRD_01: 냉장고 이미지 인식 (Step 1)

## 개요
사용자가 업로드한 냉장고 내부 사진을 비전 모델로 분석하여, 사진 속에 존재하는 식재료 목록을 텍스트로 추출한다. 이 결과는 2단계(레시피 생성)의 입력으로 사용된다.

## 목표
- 사용자가 이미지 파일을 업로드하면, 냉장고 안에 어떤 재료가 있는지 구조화된 형태로 인식한다.
- 인식 결과를 다음 단계에서 바로 활용 가능한 JSON 형태로 저장/전달한다.

## 범위
- 포함: 이미지 업로드 UI, OpenRouter API 연동, 이미지 인식 결과 파싱 및 저장
- 제외: 레시피 생성(2단계), 사용자 프로필/저장(3단계)

## 사용 모델
- `nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free` (OpenRouter, vision 지원)
- 환경변수: `OPENROUTER_API_KEY`, `OPENROUTER_VISION_MODEL`

## 사용자 플로우
1. 사용자가 웹 화면에서 냉장고 사진을 업로드한다 (jpg/png).
2. 서버가 이미지를 base64로 인코딩하여 OpenRouter Chat Completions API에 전송한다.
3. 모델이 이미지 속 식재료 목록을 텍스트로 응답한다.
4. 서버는 응답을 파싱하여 구조화된 재료 목록(JSON)으로 변환한다.
5. 사용자에게 인식된 재료 목록을 화면에 보여주고, 필요 시 수동으로 추가/삭제할 수 있게 한다.

## API 요청 형식 (예시)
```json
{
  "model": "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "이 냉장고 사진에 있는 식재료 목록을 한국어로, 항목별로 나열해줘." },
        { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,<BASE64>" } }
      ]
    }
  ]
}
```

## 출력 데이터 구조 (예시)
```json
{
  "ingredients": [
    { "name": "계란", "confidence": "high" },
    { "name": "우유", "confidence": "high" },
    { "name": "양파", "confidence": "medium" }
  ],
  "raw_model_response": "..."
}
```

## 입력 제약
- 이미지 형식: JPEG, PNG
- 이미지는 base64 data URI로 전송 (외부 URL 방식은 프로바이더가 접근 불가한 경우 502 오류 발생 이력 있음 → data URI 방식 채택)
- 최대 파일 크기 제한 필요 (예: 5MB)

## 에러 처리
- API 429/502/504 등 프로바이더 오류 발생 시 재시도 로직(예: 1회 재시도) 적용
- 인식 실패 또는 빈 응답 시 사용자에게 "재인식" 또는 "수동 입력" 옵션 제공

## 완료 기준 (Acceptance Criteria)
- [ ] 이미지 업로드 후 5초 이내 인식 결과 반환 (정상 상황 기준)
- [ ] 인식된 재료 목록이 화면에 정상 표시됨
- [ ] 사용자가 인식 결과를 수정(추가/삭제)할 수 있음
- [ ] 인식 결과가 2단계로 전달 가능한 형태(JSON)로 저장됨
