#!/data/data/com.termux/files/usr/bin/bash
# leader/member 사용자 생성 (Cognito + DynamoDB MEMBER 레코드)
# 사용법: bash scripts/create-user.sh email role displayName tempPassword

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

EMAIL="${1:-}"
ROLE="${2:-}"
NAME="${3:-}"
TEMP_PW="${4:-}"

usage() {
  cat <<EOF
사용법: $0 EMAIL ROLE "표시이름" TEMP_PASSWORD
  ROLE   : leader | member
예시:
  $0 leader@example.com leader "홍길동" TempPass123!
  $0 member@example.com member "김철수" TempPass123!
EOF
  exit 1
}

[ -n "$EMAIL" ] && [ -n "$ROLE" ] && [ -n "$NAME" ] && [ -n "$TEMP_PW" ] || usage

case "$ROLE" in
  leader|member) ;;
  *) echo "ROLE 은 leader 또는 member 만 허용됩니다 (입력: $ROLE)" >&2; usage ;;
esac

validate_password "$TEMP_PW" || { echo "비밀번호 정책 위반" >&2; exit 1; }

load_outputs

echo "→ Cognito 사용자 생성: $EMAIL ($ROLE)"
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

echo "→ $ROLE 그룹 추가"
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$USER_POOL_ID" \
  --region "$AWS_REGION" \
  --username "$EMAIL" \
  --group-name "$ROLE"

echo "→ DynamoDB MEMBER 레코드 생성"
put_member_default "$SUB" "$EMAIL" "$NAME"

cat <<EOF

✓ 사용자 생성 완료
  email : $EMAIL
  role  : $ROLE
  name  : $NAME
  sub   : $SUB
EOF
