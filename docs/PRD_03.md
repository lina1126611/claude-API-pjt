# PRD_03: 사용자 프로필 및 레시피 저장 (Step 3)

## 개요
사용자 계정(프로필)을 생성하고, 2단계에서 생성된 레시피를 사용자별로 저장/조회/관리할 수 있는 기능을 제공한다.

## 목표
- 사용자가 회원가입/로그인을 통해 프로필을 만들 수 있다.
- 사용자가 마음에 든 레시피를 자신의 프로필에 저장하고, 이후 다시 조회할 수 있다.

## 범위
- 포함: 사용자 프로필 생성/조회, 레시피 저장/조회/삭제, 인증(로그인)
- 제외: 이미지 인식(1단계), 레시피 생성(2단계)
- 전제조건: [[PRD_02]]에서 생성된 레시피 데이터가 저장 대상이 됨

## 데이터 모델 (예시)

### User
```json
{
  "user_id": "uuid",
  "email": "user@example.com",
  "nickname": "닉네임",
  "created_at": "2026-07-23T00:00:00Z",
  "preferences": {
    "allergies": ["땅콩"],
    "dislikes": ["오이"]
  }
}
```

### SavedRecipe
```json
{
  "recipe_id": "uuid",
  "user_id": "uuid",
  "title": "양파 계란볶음",
  "ingredients_have": ["계란", "양파"],
  "ingredients_missing": ["대파"],
  "steps": ["..."],
  "estimated_time_minutes": 15,
  "source": "fridge-scan",
  "saved_at": "2026-07-23T00:00:00Z"
}
```

## 사용자 플로우
1. 사용자가 이메일/비밀번호(또는 소셜 로그인)로 회원가입/로그인한다.
2. 2단계에서 생성된 레시피 목록 중 "저장" 버튼을 눌러 자신의 프로필에 저장한다.
3. 마이페이지에서 저장된 레시피 목록을 조회, 삭제할 수 있다.
4. (선택) 알레르기/비선호 재료를 프로필에 등록하면, 2단계 레시피 생성 시 해당 재료를 제외하도록 반영한다.

## API 설계 (예시)
- `POST /api/auth/signup` — 회원가입
- `POST /api/auth/login` — 로그인
- `GET /api/users/me` — 내 프로필 조회
- `PATCH /api/users/me/preferences` — 알레르기/비선호 재료 설정
- `POST /api/recipes` — 레시피 저장
- `GET /api/recipes?user_id=...` — 저장된 레시피 목록 조회
- `DELETE /api/recipes/{recipe_id}` — 저장된 레시피 삭제

## 저장소
- 초기 버전: 로컬 DB(SQLite) 또는 파일 기반 저장 고려 가능
- 확장 시: PostgreSQL 등으로 마이그레이션 고려 (계정/인증 정보 포함이므로 비밀번호는 반드시 해시 저장)

## 보안 고려사항
- 비밀번호는 평문 저장 금지, bcrypt 등으로 해싱
- 사용자는 본인의 레시피만 조회/삭제 가능하도록 인가(authorization) 처리

## 완료 기준 (Acceptance Criteria)
- [ ] 회원가입/로그인이 정상 동작함
- [ ] 로그인한 사용자가 레시피를 저장할 수 있음
- [ ] 저장된 레시피 목록을 조회/삭제할 수 있음
- [ ] 타 사용자의 레시피에는 접근 불가함 (인가 검증)
