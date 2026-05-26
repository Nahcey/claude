# 식당 청소 일정 생성기 — AWS 백엔드

> Android Termux 기반 개발 환경을 전제로 작성된 가이드

## 아키텍처 개요

```
Frontend (S3+CloudFront)  ←→  Cognito Hosted UI
        ↓ JWT
API Gateway (HTTP API)  →  Lambda (Node.js 20.x)  →  DynamoDB
```

## Termux 환경 준비

```bash
# 패키지 업데이트 및 기본 도구 설치
pkg update && pkg upgrade -y
pkg install -y nodejs python git tmux jq curl nano

# AWS CLI
pip install awscli

# AWS SAM CLI
pip install aws-sam-cli
```

## AWS 자격증명 설정

```bash
aws configure
# AWS Access Key ID:     <발급받은 키>
# AWS Secret Access Key: <시크릿>
# Default region name:   ap-northeast-2
# Default output format: json

# 설정 확인
aws sts get-caller-identity
```

## tmux 사용 안내 (긴 작업 권장)

```bash
# 새 세션 시작 (Android 화면 꺼져도 유지)
tmux new -s deploy

# 세션 분리 (백그라운드 유지)
# Ctrl+B 누른 후 D

# 세션 복귀
tmux attach -t deploy
```

> Android Termux에서 긴 작업을 실행할 때는 Termux 앱을 포그라운드에 유지하거나
> wakelock 앱(예: Termux:Boot)을 사용해 슬립 방지를 권장합니다.

## 프로젝트 구조

```
sikchung/
├── frontend/           # 프론트엔드 HTML/JS (S3 호스팅 — 5단계)
│   └── index3.html
├── backend/            # Lambda 함수 코드
│   ├── handlers/       # 엔드포인트별 핸들러
│   │   ├── me.js           GET /me, PUT /me
│   │   ├── members.js      GET /members, PUT /member/{sub}
│   │   ├── schedule.js     POST /schedule, GET /schedule/latest
│   │   ├── admin.js        POST /user, DELETE /user/{sub}, PUT /user/{sub}/role
│   │   └── postConfirmation.js  Cognito 트리거
│   ├── lib/
│   │   ├── auth.js     역할 기반 권한 확인
│   │   └── db.js       DynamoDB DocumentClient 래퍼
│   └── package.json
├── infra/
│   └── template.yaml   SAM 템플릿 (IaC)
├── scripts/            # Termux 배포 스크립트 (5단계에서 작성)
└── events/             # sam local invoke 테스트 이벤트 (2단계~)
```

## 권한 구조

| 역할   | 인원 | 가능한 작업                          |
|--------|------|--------------------------------------|
| admin  | 1명  | 전체 권한, 사용자 생성/삭제/역할 변경 |
| leader | 2명  | 전체 인원 조회/수정, 일정 생성        |
| member | 다수 | 본인 정보 조회/수정, 최신 일정 조회   |

## DynamoDB 스키마 (SikchungData)

| PK       | SK            | 주요 속성                                    |
|----------|---------------|----------------------------------------------|
| MEMBER   | {cognito_sub} | name, restricted[], double, rookie, priority, updatedAt |
| SCHEDULE | {yyyy-ww}     | scheduleData(JSON), generatedBy, generatedAt |

## 첫 빌드 (1단계 검증)

```bash
cd ~/path/to/sikchung/infra

# 템플릿 유효성 검사
sam validate

# 빌드 (node_modules 설치 포함)
sam build
```

## 단계별 개발 계획

| 단계 | 내용                                  |
|------|---------------------------------------|
| 1    | 구조·골격 (현재)                      |
| 2    | Cognito 연동 + 기본 CRUD Lambda 구현  |
| 3    | 일정 생성 로직 이식                   |
| 4    | sam local로 로컬 테스트               |
| 5    | S3+CloudFront 호스팅 + 프론트 연동    |
