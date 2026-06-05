#!/data/data/com.termux/files/usr/bin/bash
# 특정 사용자의 라인(그룹) 변경
# 사용법: bash scripts/set-group.sh username GROUP
# 예시:  bash scripts/set-group.sh wjdqhwndeo07 C

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

USERNAME="${1:-}"
GROUP="${2:-}"

usage() {
  cat <<EOF
사용법: $0 USERNAME GROUP
  GROUP  : A~E 중 하나
예시:
  $0 wjdqhwndeo07 C
  $0 wjdqhwndeo03 B
EOF
  exit 1
}

[ -n "$USERNAME" ] && [ -n "$GROUP" ] || usage

case "$GROUP" in
  A|B|C|D|E) ;;
  *) echo "GROUP 은 A~E 중 하나여야 합니다 (입력: $GROUP)" >&2; usage ;;
esac

load_outputs

# sub 조회
SUB="$(get_user_sub "$USERNAME")"
if [ -z "$SUB" ] || [ "$SUB" = "None" ]; then
  echo "사용자를 찾을 수 없습니다: $USERNAME" >&2
  exit 1
fi

# 현재 라인 조회
CURRENT=$(aws dynamodb get-item \
  --table-name "$TABLE_NAME" \
  --region "$AWS_REGION" \
  --key "{\"PK\":{\"S\":\"MEMBER\"},\"SK\":{\"S\":\"$SUB\"}}" \
  --projection-expression "#g" \
  --expression-attribute-names '{"#g":"group"}' \
  --output json 2>/dev/null \
  | jq -r '.Item.group.S // "(미지정)"')

echo "  사용자 : $USERNAME"
echo "  현재   : $CURRENT"
echo "  변경 → : $GROUP"
echo ""
printf "라인을 변경하시겠습니까? (y/N) "
read -r CONFIRM
case "$CONFIRM" in
  y|Y|yes|YES) ;;
  *) echo "취소됨"; exit 0 ;;
esac

aws dynamodb update-item \
  --table-name "$TABLE_NAME" \
  --region "$AWS_REGION" \
  --key "{\"PK\":{\"S\":\"MEMBER\"},\"SK\":{\"S\":\"$SUB\"}}" \
  --update-expression "SET #g = :g, updatedAt = :ts" \
  --expression-attribute-names '{"#g":"group"}' \
  --expression-attribute-values "{\":g\":{\"S\":\"$GROUP\"},\":ts\":{\"S\":\"$(date -u +%FT%TZ)\"}}" \
  >/dev/null

echo "✓ 완료  $USERNAME : $CURRENT → $GROUP"
