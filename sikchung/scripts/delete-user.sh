#!/data/data/com.termux/files/usr/bin/bash
# 사용자 삭제 (Cognito + DynamoDB MEMBER 레코드)
# 사용법: bash scripts/delete-user.sh username
# 예시:  bash scripts/delete-user.sh wjdqhwndeo05

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

USERNAME="${1:-}"

if [ -z "$USERNAME" ]; then
  echo "사용법: $0 USERNAME"
  echo "예시:   $0 wjdqhwndeo05"
  exit 1
fi

load_outputs

SUB="$(get_user_sub "$USERNAME")"
if [ -z "$SUB" ] || [ "$SUB" = "None" ]; then
  echo "사용자를 찾을 수 없음: $USERNAME" >&2
  exit 1
fi

echo "삭제 대상:"
echo "  username : $USERNAME"
echo "  sub      : $SUB"
echo ""
printf "정말 삭제하시겠습니까? (y/N) "
read -r CONFIRM
case "$CONFIRM" in
  y|Y|yes|YES) ;;
  *) echo "취소됨"; exit 0 ;;
esac

echo "→ Cognito 사용자 삭제"
aws cognito-idp admin-delete-user \
  --user-pool-id "$USER_POOL_ID" \
  --region "$AWS_REGION" \
  --username "$USERNAME"

echo "→ DynamoDB MEMBER 레코드 삭제"
aws dynamodb delete-item \
  --table-name "$TABLE_NAME" \
  --region "$AWS_REGION" \
  --key "{\"PK\":{\"S\":\"MEMBER\"},\"SK\":{\"S\":\"$SUB\"}}" >/dev/null

echo "✓ 삭제 완료: $USERNAME"
