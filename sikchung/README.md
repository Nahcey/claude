# 식당 청소 일정 생성기 — AWS 백엔드 + CloudFront 호스팅

분대 청소 일정 자동 생성 앱. 모바일 우선, 역할 기반 권한 (admin / leader / member).
Termux 에서 `git push` 만으로 전체 배포가 끝나도록 구성됨.

```
Termux (git push)
  → GitHub Actions (sam build/deploy → s3 sync → cloudfront invalidate)
    → AWS: Cognito + API GW + Lambda + DynamoDB + S3 + CloudFront
    → 접속: https://<cloudfront_domain>
```

---

## 0. 환경 준비 (Termux)

이미 설치되어 있다면 스킵. 새 기기에서는:

```bash
pkg update && pkg upgrade -y
pkg install -y nodejs git curl jq python
pip install awscli

# IAM 사용자 자격증명 설정 (한 번)
aws configure
#   AWS Access Key ID:     ...
#   AWS Secret Access Key: ...
#   Default region name:   ap-northeast-2
#   Default output format: json
```

> Termux 는 `git push` + 운영 스크립트만 실행함. `sam` / `cdk` / `docker` 는 필요 없음.

### GitHub Secrets (한 번 설정)

저장소 Settings → Secrets and variables → Actions:

| Secret 이름             | 설명                  |
|-------------------------|----------------------|
| `AWS_ACCESS_KEY_ID`     | IAM 사용자 액세스 키 |
| `AWS_SECRET_ACCESS_KEY` | IAM 사용자 시크릿 키 |

IAM 사용자에는 CloudFormation·S3·Lambda·API Gateway·DynamoDB·Cognito·IAM·CloudFront 권한이 필요함 (개발 단계에서는 `AdministratorAccess` 도 가능).

---

## 1. 최초 배포

```bash
git push origin main   # 또는 PR 머지
```

GitHub → Actions 탭의 **"Deploy Sikchung Backend"** 워크플로우 진행 확인.

**예상 소요 시간**
- SAM build/deploy: 3~5 분
- CloudFront 최초 전파: **10~20 분**
- 전체: **15~25 분**

워크플로우 종료 후 Job Summary 에 다음이 출력됨:
- **URL**: `https://<cloudfront_domain>`
- 스택 출력값 표 (UserPoolId / ClientId / ApiEndpoint 등)

---

## 2. 관리자 계정 생성 (배포 후 한 번)

```bash
bash sikchung/scripts/create-admin.sh your@email.com TempPass123! "이름"
```

- 비밀번호는 8자+ · 대소문자+숫자+특수문자 포함
- 생성 즉시 Cognito 사용자 + admin 그룹 + DynamoDB MEMBER 레코드 모두 만들어짐
- 첫 로그인 시 Cognito 가 새 비밀번호 변경 화면을 자동 표시

---

## 3. 일상 운영 명령

```bash
# 분대장 추가
bash sikchung/scripts/create-user.sh leader@email.com leader "홍길동" TempPass123!

# 분대원 추가
bash sikchung/scripts/create-user.sh member@email.com member "김철수" TempPass123!

# 사용자 삭제 (확인 프롬프트 있음)
bash sikchung/scripts/delete-user.sh user@example.com

# 그룹별 사용자 목록
bash sikchung/scripts/list-users.sh

# Lambda 로그 (인자 없으면 함수 목록 출력)
bash sikchung/scripts/logs.sh
bash sikchung/scripts/logs.sh MeFunction

# 배포 헬스체크
bash sikchung/scripts/check-deployment.sh

# 코드 변경 시
git push        # → Actions 가 자동 재배포 + CloudFront 무효화
```

---

## 4. 권한 구조

| 역할   | 인원 | 가능한 작업                              |
|--------|------|------------------------------------------|
| admin  | 1명  | 전체 권한 · 사용자 생성/삭제/역할 변경    |
| leader | 2명  | 전체 인원 조회/수정 · 주간 일정 생성/저장 |
| member | 다수 | 본인 정보 조회/수정 · 최신 일정 조회      |

JWT 의 `cognito:groups` 클레임으로 판정. 백엔드(`lib/auth.js`) 와 프론트엔드(`permissions.js`) 양쪽에서 검증.

---

## 5. DynamoDB 스키마 (`SikchungData`, PAY_PER_REQUEST)

| PK       | SK            | 속성                                                        |
|----------|---------------|-------------------------------------------------------------|
| MEMBER   | `{cognito_sub}` | email, name, restricted[12], double, rookie, priority, updatedAt |
| SCHEDULE | `{yyyy-ww}`     | scheduleData(JSON), generatedBy, generatedByEmail, generatedAt   |

---

## 6. 프로젝트 구조

```
sikchung/
├── frontend/
│   ├── index3.html          메인 앱 (백엔드 연동 완료)
│   ├── auth.js              Cognito Hosted UI OAuth2 로그인 흐름
│   ├── api.js               백엔드 API 클라이언트
│   ├── permissions.js       JWT 디코딩 + 역할 확인
│   ├── config.example.js    런타임 설정 예시
│   └── config.js            실제 값 (gitignore · Actions 가 자동 생성)
├── backend/
│   ├── handlers/  me / members / schedule / admin / postConfirmation
│   ├── lib/       auth · db · response
│   └── package.json
├── infra/
│   ├── template.yaml        SAM 템플릿 (Cognito · API GW · Lambda · DDB · S3 · CloudFront)
│   └── samconfig.toml
├── scripts/                 Termux 운영 스크립트
│   ├── _lib.sh              공통 라이브러리 (source 전용)
│   ├── create-admin.sh
│   ├── create-user.sh
│   ├── delete-user.sh
│   ├── list-users.sh
│   ├── logs.sh
│   └── check-deployment.sh
└── README.md
.github/workflows/deploy.yml  CI/CD
```

---

## 7. 트러블슈팅 (Termux 특화)

| 증상 | 진단/해결 |
|------|----------|
| GitHub Actions 실패 | Actions 탭에서 실패 단계 로그 확인. SAM build 실패 시 `template.yaml` 문법 점검. |
| CloudFront 가 새 코드를 안 보여줌 | 캐시 무효화 대기 5~10 분. 브라우저 시크릿 모드로 재접속. |
| CORS 에러 | URL 끝에 `?debug=1` 붙여서 Eruda 콘솔 → Network 탭 확인. `OPTIONS` 응답 상태 점검. |
| Cognito `redirect_mismatch` | Actions 의 **Update Cognito callback URLs** 단계 재실행 (workflow_dispatch). |
| Lambda 에러 | `bash scripts/logs.sh <함수명>` 으로 실시간 로그 확인. |
| 임시 비밀번호 거부 | Cognito 정책 8자+ · 대소문자+숫자+특수문자 미충족. |
| 401 만 반복 | 토큰 만료 (auth.js 가 자동 재발급 시도하지만 refresh 도 만료된 경우 재로그인 필요). |
| `aws` 명령 not found | `pip install awscli` 후 `aws configure`. |

---

## 8. 비용 추정 (분대 ~15 명, 월간)

| 서비스 | 사용량 | 비용 |
|--------|-------|------|
| Cognito MAU | <50 | 무료 (월 10,000명까지) |
| Lambda 호출 | ~수천 | 무료 (월 1M까지) |
| API Gateway HTTP API | ~수천 | 무료 (월 1M까지) |
| DynamoDB on-demand | 매우 적음 | < $0.10 |
| S3 | 정적 자원 ~1MB | < $0.01 |
| CloudFront | < 1GB/월 | 무료 등급 |
| **합계** | | **$0 ~ $1** |

---

## 9. 모바일 디버깅

브라우저 URL 끝에 `?debug=1` 추가 → Eruda 콘솔이 우측 하단에 표시됨.

```
https://<cloudfront_domain>/?debug=1
```

---

## 10. 동작 확인 체크리스트

배포 후 다음을 순서대로 확인:

- [ ] GitHub Actions 녹색 ✓ 완료
- [ ] Actions Job Summary 에 CloudFront URL 표시
- [ ] `curl -I https://<cloudfront_domain>/` → `HTTP/2 200`
- [ ] `bash scripts/check-deployment.sh` 가 모든 항목 ✓
- [ ] 모바일 Chrome 으로 접속 시 자동으로 Cognito 로그인 화면 표시
- [ ] admin 임시비번 로그인 → 새 비번 설정 화면 자동 표시
- [ ] 새 비번 설정 후 leader UI (전체 인원 카드 + "일정 생성" 버튼) 노출
- [ ] 분대원 계정으로 로그인 → "내 설정" 카드 + 최신 일정 표만 표시
- [ ] member 가 다른 인원 카드를 볼 수 없음
- [ ] leader 가 "일정 생성" → "확정 저장" → 모든 계정에서 동일 일정 조회
- [ ] `?debug=1` 으로 Eruda 콘솔 표시

---

## 11. 알려진 제약 / 후속 작업

- **커스텀 도메인 미지원**: CloudFront 기본 `*.cloudfront.net` 도메인만 사용. 추후 ACM + Route53 추가 시 별도 작업 필요.
- **API CORS 가 `*`**: 운영 환경에서는 CloudFront 도메인으로 제한 권장 (`template.yaml` 의 `CorsConfiguration.AllowOrigins`).
- **localhost 콜백 URL**: Stage 4 의 localhost 콜백은 deploy 시 CloudFront URL 로 **덮어쓰기됨**. 로컬 개발 재개 시 `aws cognito-idp update-user-pool-client` 로 `http://localhost:8080/index3.html` 을 추가 필요.
- **Cognito 사용자 수 증가**: MAU 10,000 초과 시 유료. 분대 단위에선 무관.
- **PostConfirmation 트리거**: 스크립트로 생성된 사용자는 트리거가 거의 발화하지 않음 (이미 `email_verified=true`). 스크립트가 DynamoDB MEMBER 레코드를 직접 생성하여 안전.
