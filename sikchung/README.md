# 식당 청소 일정 생성기 — AWS 백엔드

## 개요

기존 `frontend/index3.html` 단일 파일 앱을 AWS 백엔드와 결합한다.  
빌드와 배포는 **GitHub Actions**가 처리하며, 개발자(Termux)는 `git push`만 한다.

```
Termux (git push)
  → GitHub Actions (sam build + sam deploy)
    → AWS: Cognito + API GW + Lambda + DynamoDB
    → (5단계) S3 + CloudFront
```

## GitHub Secrets 설정

저장소 Settings → Secrets and variables → Actions 에서 등록:

| Secret 이름             | 설명                                |
|------------------------|-------------------------------------|
| `AWS_ACCESS_KEY_ID`    | IAM 사용자 액세스 키                 |
| `AWS_SECRET_ACCESS_KEY`| IAM 사용자 시크릿 키                 |
| `AWS_REGION`           | `ap-northeast-2` (고정 — 선택 사항) |

### IAM 권한 (최소 권한 설정 시 필요한 서비스)
- CloudFormation (FullAccess)
- S3 (SAM artifact 버킷용)
- Lambda, API Gateway, DynamoDB, Cognito, IAM

> 간편하게는 `AdministratorAccess`를 사용하되, 프로덕션 전환 시 최소 권한으로 좁힐 것.

## Termux 최소 환경 준비

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs git jq curl

# AWS CLI (운영 스크립트용 — 배포에는 불필요)
pip install awscli

# 자격증명 설정 (Termux에서 사용자 관리 명령만 실행 시 필요)
aws configure
```

## 첫 배포 순서

```bash
# 1. 저장소 클론 (Termux)
git clone https://github.com/Nahcey/claude.git
cd claude

# 2. main 브랜치에 push
git checkout main  # 또는 PR 머지
git push origin main

# 3. GitHub → Actions 탭 → "Deploy Sikchung Backend" 워크플로우 확인
```

Actions가 완료되면 AWS CloudFormation 스택 `sikchung`이 생성된다.

## 프로젝트 구조

```
sikchung/
├── frontend/
│   ├── index3.html       메인 앱 (백엔드 연동 완료)
│   ├── auth.js           Cognito Hosted UI OAuth2 로그인 흐름
│   ├── api.js            백엔드 API 클라이언트
│   ├── permissions.js    JWT 디코딩 + 역할 확인
│   ├── config.example.js 런타임 설정 예시
│   └── config.js         실제 설정값 (gitignore — 수동 생성)
├── backend/
│   ├── handlers/
│   │   ├── me.js             GET/PUT /me
│   │   ├── members.js        GET /members, PUT /member/{sub}
│   │   ├── schedule.js       POST /schedule, GET /schedule/latest
│   │   ├── admin.js          POST/DELETE/PUT /user (admin 전용)
│   │   └── postConfirmation.js  Cognito 이메일 인증 완료 트리거
│   ├── lib/
│   │   ├── auth.js           역할 기반 권한 확인
│   │   ├── db.js             DynamoDB DocumentClient 래퍼
│   │   └── response.js       HTTP 응답 헬퍼
│   └── package.json
├── infra/
│   ├── template.yaml     SAM 템플릿 (IaC)
│   └── samconfig.toml    SAM 배포 기본값
├── scripts/              Termux 운영 스크립트 (5단계에서 작성)
└── README.md
.github/workflows/
└── deploy.yml            GitHub Actions CI/CD
```

## 권한 구조

| 역할   | 인원 | 가능한 작업                            |
|--------|------|----------------------------------------|
| admin  | 1명  | 전체 권한, 사용자 생성/삭제/역할 변경   |
| leader | 2명  | 전체 인원 조회/수정, 주간 일정 생성     |
| member | 다수 | 본인 정보 조회/수정, 최신 일정 조회     |

## DynamoDB 스키마 (SikchungData)

| PK       | SK            | 속성                                                        |
|----------|---------------|-------------------------------------------------------------|
| MEMBER   | {cognito_sub} | name, restricted[], double, rookie, priority, updatedAt     |
| SCHEDULE | {yyyy-ww}     | scheduleData(JSON), generatedBy(sub), generatedAt           |

## 단계별 개발 계획

| 단계 | 내용                                        | 상태  |
|------|---------------------------------------------|-------|
| 1    | 구조·골격·CI/CD 파이프라인                  | ✅ 완료 |
| 2    | Lambda CRUD 로직 구현                       | ✅ 완료 |
| 3    | 스케줄/관리자/PostConfirmation 엔드포인트   | ✅ 완료 |
| 4    | Cognito 로그인 + 프론트엔드 연동            | ✅ 완료 |
| **5**| S3+CloudFront 호스팅 + 자동 URL 주입        | **다음** |

## 4단계 자가검증

### 전제
- GitHub Actions `Deploy Sikchung Backend` 워크플로우가 성공적으로 완료됐어야 함
- 워크플로우의 **"Print stack outputs"** 단계에서 ApiEndpoint, CognitoDomain, ClientId 값을 확인

### config.js 수동 생성 (로컬 테스트용)

```bash
# sikchung/frontend/ 디렉토리에 config.js 생성
# (이 파일은 .gitignore에 있으므로 커밋되지 않음)
cat > sikchung/frontend/config.js <<'EOF'
window.APP_CONFIG = {
  apiEndpoint:   'https://실제API엔드포인트.execute-api.ap-northeast-2.amazonaws.com/prod',
  cognitoDomain: 'https://sikchung-auth-ACCOUNTID.auth.ap-northeast-2.amazoncognito.com',
  clientId:      '실제클라이언트ID',
  redirectUri:   'http://localhost:8080/index3.html',
};
EOF
```

### 로컬 서버 실행 및 테스트

```bash
# 1. 프론트엔드 디렉토리에서 HTTP 서버 실행 (Python 3)
cd sikchung/frontend
python3 -m http.server 8080

# 2. 브라우저에서 http://localhost:8080/index3.html 열기
# 3. "로그인" 버튼 클릭 → Cognito Hosted UI로 이동
# 4. 이메일/비밀번호로 로그인 (POST /user 로 생성된 계정)
# 5. 로그인 완료 후 http://localhost:8080/index3.html?code=... 로 리다이렉트됨
#    → auth.js가 code를 토큰으로 교환하고 localStorage에 저장
```

### 역할별 동작 확인

| 역할   | 기대 동작 |
|--------|-----------|
| leader | 전체 인원 카드 표시, 일정 생성 버튼 활성, "확정 저장" 버튼 생성 후 표시 |
| admin  | leader와 동일 + 모달에서 멤버 삭제 버튼 표시 |
| member | "내 설정" 카드(본인만), 최신 일정 표, 생성 버튼 없음 |

> **참고**: 5단계(CloudFront)가 완료되면 `redirectUri`를 HTTPS URL로 교체하고  
> GitHub Actions가 자동으로 config.js를 생성·업로드함.

### 디버그 콘솔 (모바일)

```
http://localhost:8080/index3.html?eruda=1
```

## 운영 명령어 (5단계에서 채움)

```bash
# 사용자 초대, 역할 변경 등 scripts/ 디렉토리 참고
```
