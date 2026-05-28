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

## 2. 로그인 방식 — 아이디(username) 기반

이메일이 아닌 **아이디(username)** 로 로그인한다. 분대원의 아이디-이름은
생성 시점에 `custom:displayName` 으로 고정 입력된다 (로그인 후 이름 선택 불필요).

### 아이디-이름 매핑 (고정)

| 아이디         | 이름   | 권한    |  | 아이디         | 이름   | 권한    |
|----------------|--------|---------|--|----------------|--------|---------|
| wjdqhwndeo00   | 박예찬 | admin   |  | wjdqhwndeo07   | 정한결 | member  |
| wjdqhwndeo01   | 이동민 | member  |  | wjdqhwndeo08   | 김최원 | member  |
| wjdqhwndeo02   | 김기환 | member  |  | wjdqhwndeo09   | 오승호 | member  |
| wjdqhwndeo03   | 정우진 | member  |  | wjdqhwndeo11   | 권기범 | member  |
| wjdqhwndeo04   | 윤민형 | member  |  | wjdqhwndeo12   | 최정협 | member  |
| wjdqhwndeo05   | 한우현 | member  |  | wjdqhwndeo13   | 전유찬 | member  |
| wjdqhwndeo06   | 권정훈 | member  |  | _(wjdqhwndeo10 없음)_ |  |  |

> **wjdqhwndeo10 은 존재하지 않음.** 박예찬은 admin 으로 `wjdqhwndeo00` 에 별도 생성되며,
> 박예찬도 청소 당번 인원 카드를 가진다 (분대장 2명은 아래 set-role 로 지정).

> ⚠️ **User Pool 재생성 주의** — 이번 변경(이메일→아이디 로그인)은 Cognito
> User Pool 의 `UsernameAttributes` 변경이라 CloudFormation 이 **User Pool 을
> 교체(replace)** 한다. 결과적으로:
> - UserPoolId / ClientId 가 새로 발급됨 (config.js·콜백 URL 은 워크플로우가 자동 갱신)
> - **기존 모든 계정(admin 포함)이 삭제됨** → 배포 후 admin + 분대원 **재생성 필요**

---

## 3. 배포 후 운영 순서 (최초 1회)

```bash
# 1) Actions 통과 + 스택 UPDATE_COMPLETE 확인 후

# 2) admin(박예찬) 생성
bash sikchung/scripts/create-admin.sh wjdqhwndeo00 TempPass123! "박예찬"

# 3) 분대원 12명 일괄 생성 (전원 member)
bash sikchung/scripts/batch-create-members.sh TempPass123!

# 4) 분대장 2명 지정 (예: 김기환·한우현)
bash sikchung/scripts/set-role.sh wjdqhwndeo02 leader
bash sikchung/scripts/set-role.sh wjdqhwndeo05 leader

# 5) 분대원에게 "아이디 wjdqhwndeoNN / 임시비번 TempPass123!" 배포
# 6) 각자 첫 로그인 시 새 비밀번호 설정 (Cognito 기본 동작)
```

---

## 4. 일상 운영 명령

```bash
# 분대원 단건 추가 (배치에서 누락된 경우 등)
bash sikchung/scripts/create-user.sh wjdqhwndeo01 member "이동민" TempPass123!

# 권한 부여 (분대장 지정)
bash sikchung/scripts/set-role.sh wjdqhwndeo02 leader

# 권한 회수 (분대원으로 되돌리기)
bash sikchung/scripts/set-role.sh wjdqhwndeo02 member

# 비밀번호 리셋 (분실 시 admin 이 강제 설정 — 즉시 영구 적용)
bash sikchung/scripts/reset-password.sh wjdqhwndeo05 NewPass123!

# 사용자 삭제 (확인 프롬프트 있음)
bash sikchung/scripts/delete-user.sh wjdqhwndeo05

# 사용자 목록 (그룹별 + 무소속, 아이디/이름/sub 표시)
bash sikchung/scripts/list-users.sh

# Lambda 로그 (인자 없으면 함수 목록 출력)
bash sikchung/scripts/logs.sh
bash sikchung/scripts/logs.sh MeFunction

# 배포 헬스체크
bash sikchung/scripts/check-deployment.sh

# 코드 변경 시
git push        # → Actions 가 자동 재배포 + CloudFront 무효화
```

> 권한 변경(set-role) 후 해당 사용자는 **다음 로그인부터** 새 권한 토큰을 받는다.

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
| MEMBER   | `{cognito_sub}` | username, name(한글), restricted[12], double, rookie, priority, updatedAt |
| SCHEDULE | `{yyyy-ww}`     | scheduleData(JSON), generatedBy, generatedByEmail, generatedAt   |

> `name` 은 생성 시 박은 한글 이름(`custom:displayName`). `username` 은
> Cognito 아이디(wjdqhwndeoNN) 로, 삭제·권한변경 시 Cognito 조회에 사용.

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
│   ├── _lib.sh                  공통 라이브러리 (source 전용)
│   ├── create-admin.sh         admin 생성 (username 기반)
│   ├── batch-create-members.sh 분대원 12명 일괄 생성
│   ├── create-user.sh          단건 사용자 생성
│   ├── set-role.sh             권한 부여/회수 (admin/leader/member)
│   ├── reset-password.sh       비밀번호 강제 재설정
│   ├── delete-user.sh          사용자 삭제
│   ├── list-users.sh           그룹별+무소속 목록
│   ├── logs.sh                 Lambda 로그 tail
│   └── check-deployment.sh     배포 헬스체크
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

- [ ] GitHub Actions 녹색 ✓ 완료, 스택 UPDATE_COMPLETE
- [ ] Actions Job Summary 에 CloudFront URL 표시
- [ ] `curl -I https://<cloudfront_domain>/` → `HTTP/2 200`
- [ ] `bash scripts/check-deployment.sh` 가 모든 항목 ✓
- [ ] User Pool 이 **아이디(username) 로그인**으로 재생성됨 (이메일 입력란 없음)
- [ ] `create-admin.sh wjdqhwndeo00 ... "박예찬"` + `batch-create-members.sh` 로 13명 생성
- [ ] `list-users.sh` 가 admin 1 · member 12 · 각자 한글 이름 표시
- [ ] 모바일 Chrome 접속 시 Cognito 로그인 화면이 **"사용자 이름"** 입력을 받음
- [ ] 아이디 `wjdqhwndeo00` + 임시비번 로그인 → 새 비번 설정 화면 자동 표시
- [ ] 새 비번 설정 후 admin/leader UI (전체 인원 카드 + "일정 생성" 버튼) 노출
- [ ] `set-role.sh wjdqhwndeo02 leader` 후 해당 계정 재로그인 → leader UI 노출
- [ ] 분대원 계정으로 로그인 → 본인 한글 이름 "내 설정" 카드 + 최신 일정만 표시
- [ ] member 가 다른 인원 카드를 볼 수 없음
- [ ] leader 가 "일정 생성" → "확정 저장" → 모든 계정에서 동일 일정 조회
- [ ] `?debug=1` 으로 Eruda 콘솔 표시

---

## 11. 알려진 제약 / 후속 작업

- **커스텀 도메인 미지원**: CloudFront 기본 `*.cloudfront.net` 도메인만 사용. 추후 ACM + Route53 추가 시 별도 작업 필요.
- **API CORS 가 `*`**: 운영 환경에서는 CloudFront 도메인으로 제한 권장 (`template.yaml` 의 `CorsConfiguration.AllowOrigins`).
- **localhost 콜백 URL**: Stage 4 의 localhost 콜백은 deploy 시 CloudFront URL 로 **덮어쓰기됨**. 로컬 개발 재개 시 `aws cognito-idp update-user-pool-client` 로 `http://localhost:8080/index3.html` 을 추가 필요.
- **Cognito 사용자 수 증가**: MAU 10,000 초과 시 유료. 분대 단위에선 무관.
- **PostConfirmation 트리거**: 스크립트로 생성된 사용자는 트리거가 거의 발화하지 않음. 스크립트(`_lib.sh` 의 `create_cognito_user`)가 DynamoDB MEMBER 레코드를 직접 생성하여 안전.
- **이메일 미사용**: 아이디 기반 로그인이라 이메일 검증·비밀번호 자동복구(forgot password) 미지원. 비번 분실 시 admin 이 `reset-password.sh` 로 처리.
- **권한 변경 반영 시점**: `set-role.sh` 후 기존 발급된 토큰에는 옛 권한이 남아있음 → 해당 사용자가 재로그인(또는 토큰 만료)해야 새 권한 적용.
