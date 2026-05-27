#!/data/data/com.termux/files/usr/bin/bash
# admin 권한 사용자 생성 (Cognito + DynamoDB MEMBER 레코드)
# 사용법: bash scripts/create-admin.sh email TempPass! "표시이름"

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

EMAIL="${1:-}"
TEMP_PW="${2:-}"
NAME="${3:-}"

if [ -z "$EMAIL" ] || [ -z "$TEMP_PW" ] || [ -z "$NAME" ]; then
  cat <<EOF
사용법: $0 EMAIL TEMP_PASSWORD "표시이름"
예시:  $0 admin@example.com TempPass123! "관리자"
EOF
  exit 1
fi

validate_password "$TEMP_PW" || { echo "비밀번호 정책 위반" >&2; exit 1; }

load_outputs

echo "→ Cognito 사용자 생성: $EMAIL"
RESP=$(aws cognito-idp admin-create-user \
  --user-pool-id "$USER_POOL_ID" \
  --region "$AWS_REGION" \
  --username "$EMAIL" \
  --user-attributes \
      Name=email,Value="$EMAIL" \
      Name=email_verified,Value=true \
      Name=custom:displayName,Value="$NAME" \
  --temporary-password "$TEMP_PW" \
  --output json)

SUB=$(echo "$RESP" | jq -r '.User.Attributes[] | select(.Name=="sub") | .Value')
if [ -z "$SUB" ] || [ "$SUB" = "null" ]; then
  echo "sub 조회 실패" >&2
  exit 1
fi

echo "→ admin 그룹 추가"
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$USER_POOL_ID" \
  --region "$AWS_REGION" \
  --username "$EMAIL" \
  --group-name admin

echo "→ DynamoDB MEMBER 레코드 생성"
put_member_default "$SUB" "$EMAIL" "$NAME"

cat <<EOF

✓ admin 계정 생성 완료
  email : $EMAIL
  name  : $NAME
  sub   : $SUB

다음 안내:
  1. https://${CF_DOMAIN:-<CloudFrontDomain>} 접속
  2. 로그인 화면에서 $EMAIL + 임시비번 입력
  3. 새 비밀번호 설정 화면이 자동 표시됨 (Cognito 기본 동작)
EOF
