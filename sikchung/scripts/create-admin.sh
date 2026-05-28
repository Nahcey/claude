#!/data/data/com.termux/files/usr/bin/bash
# admin 권한 사용자 생성 (Cognito username 기반 + DynamoDB MEMBER 레코드)
# 사용법: bash scripts/create-admin.sh username tempPassword "이름"
# 예시:  bash scripts/create-admin.sh wjdqhwndeo00 TempPass123! "박예찬"

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

USERNAME="${1:-}"
TEMP_PW="${2:-}"
NAME="${3:-}"

if [ -z "$USERNAME" ] || [ -z "$TEMP_PW" ] || [ -z "$NAME" ]; then
  cat <<EOF
사용법: $0 USERNAME TEMP_PASSWORD "표시이름"
예시:  $0 wjdqhwndeo00 TempPass123! "박예찬"
EOF
  exit 1
fi

validate_password "$TEMP_PW" || { echo "비밀번호 정책 위반" >&2; exit 1; }

load_outputs

echo "→ admin 사용자 생성: $USERNAME ($NAME)"
if create_cognito_user "$USERNAME" "$NAME" admin "$TEMP_PW"; then
  :
else
  rc=$?
  if [ "$rc" -eq 2 ]; then
    echo "이미 존재하는 사용자: $USERNAME — admin 그룹만 보정" >&2
    aws cognito-idp admin-add-user-to-group \
      --user-pool-id "$USER_POOL_ID" --region "$AWS_REGION" \
      --username "$USERNAME" --group-name admin >/dev/null
  else
    exit "$rc"
  fi
fi

cat <<EOF

✓ admin 계정 준비 완료
  username : $USERNAME
  name     : $NAME

다음 안내:
  1. https://${CF_DOMAIN:-<CloudFrontDomain>} 접속
  2. 로그인 화면에서 아이디 $USERNAME + 임시비번 입력
  3. 새 비밀번호 설정 화면이 자동 표시됨 (Cognito 기본 동작)
  4. 박예찬도 청소 당번 인원 카드를 가짐 (displayName=$NAME)
EOF
