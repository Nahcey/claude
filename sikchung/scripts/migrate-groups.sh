#!/data/data/com.termux/files/usr/bin/bash
# 기존 MEMBER 레코드에 group 필드 일괄 설정 (일회성 마이그레이션)
#
# 매핑 (이름 기준):
#   A: 이동민, 김기환, 정우진
#   B: 윤민형, 한우현, 권정훈, 정한결, 김최원
#   C: 오승호, 박예찬, 권기범, 최정협, 전유찬
#
# 이미 group 필드가 있는 레코드는 덮어씀 (강제 설정).
# 사용법: bash scripts/migrate-groups.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

# 이름 → 그룹 매핑
declare -A NAME_TO_GROUP=(
  ["이동민"]="A"
  ["김기환"]="A"
  ["정우진"]="A"
  ["윤민형"]="B"
  ["한우현"]="B"
  ["권정훈"]="B"
  ["정한결"]="B"
  ["김최원"]="B"
  ["오승호"]="C"
  ["박예찬"]="C"
  ["권기범"]="C"
  ["최정협"]="C"
  ["전유찬"]="C"
)

load_outputs

# ── 전체 MEMBER 레코드 조회 ──────────────────────────────────────────────────
echo "→ MEMBER 레코드 조회 중..."
ITEMS=$(aws dynamodb query \
  --table-name "$TABLE_NAME" \
  --region "$AWS_REGION" \
  --key-condition-expression "PK = :pk" \
  --expression-attribute-values '{":pk":{"S":"MEMBER"}}' \
  --output json | jq '.Items')

TOTAL=$(echo "$ITEMS" | jq 'length')
echo "  총 인원: $TOTAL 명"
echo ""

# ── 변경 계획 미리보기 ────────────────────────────────────────────────────────
echo "변경 계획:"
printf "  %-20s %-10s %-10s %s\n" "이름" "현재 그룹" "→ 변경" "sub"

declare -a PLAN_SUBS=()
declare -a PLAN_NAMES=()
declare -a PLAN_GROUPS=()

while IFS= read -r item; do
  sub=$(echo "$item" | jq -r '.SK.S')
  name=$(echo "$item" | jq -r '.name.S // ""')
  current_group=$(echo "$item" | jq -r '.group.S // "(미지정)"')
  target_group="${NAME_TO_GROUP[$name]:-}"

  if [ -z "$target_group" ]; then
    printf "  %-20s %-10s %-10s %s\n" "$name" "$current_group" "(매핑없음)" "$sub"
    continue
  fi

  printf "  %-20s %-10s %-10s %s\n" "$name" "$current_group" "$target_group" "$sub"
  PLAN_SUBS+=("$sub")
  PLAN_NAMES+=("$name")
  PLAN_GROUPS+=("$target_group")
done < <(echo "$ITEMS" | jq -c '.[]')

echo ""
echo "  대상: ${#PLAN_SUBS[@]}명 / 전체 $TOTAL 명"
echo ""

if [ ${#PLAN_SUBS[@]} -eq 0 ]; then
  echo "업데이트할 레코드가 없습니다."
  exit 0
fi

printf "위 내용으로 group 필드를 설정하시겠습니까? (y/N) "
read -r CONFIRM
case "$CONFIRM" in
  y|Y|yes|YES) ;;
  *) echo "취소됨"; exit 0 ;;
esac

echo ""

# ── 실제 DynamoDB 업데이트 ───────────────────────────────────────────────────
UPDATED=0
FAILED=0
for idx in "${!PLAN_SUBS[@]}"; do
  sub="${PLAN_SUBS[$idx]}"
  name="${PLAN_NAMES[$idx]}"
  grp="${PLAN_GROUPS[$idx]}"

  if aws dynamodb update-item \
    --table-name "$TABLE_NAME" \
    --region "$AWS_REGION" \
    --key "{\"PK\":{\"S\":\"MEMBER\"},\"SK\":{\"S\":\"$sub\"}}" \
    --update-expression "SET #g = :g, updatedAt = :ts" \
    --expression-attribute-names '{"#g":"group"}' \
    --expression-attribute-values "{\":g\":{\"S\":\"$grp\"},\":ts\":{\"S\":\"$(date -u +%FT%TZ)\"}}" \
    >/dev/null; then
    echo "  ✓ $name → $grp"
    UPDATED=$((UPDATED + 1))
  else
    echo "  ✗ $name 실패" >&2
    FAILED=$((FAILED + 1))
  fi
done

echo ""
echo "──────────────────────────────────────────"
echo "마이그레이션 완료: 성공 ${UPDATED}명 / 실패 ${FAILED}명"
echo "──────────────────────────────────────────"

# ── 업데이트 후 분포 재출력 ──────────────────────────────────────────────────
echo ""
echo "업데이트 후 그룹 분포:"
ITEMS_AFTER=$(aws dynamodb query \
  --table-name "$TABLE_NAME" \
  --region "$AWS_REGION" \
  --key-condition-expression "PK = :pk" \
  --expression-attribute-values '{":pk":{"S":"MEMBER"}}' \
  --output json | jq '.Items')

for g in A B C D E; do
  cnt=$(echo "$ITEMS_AFTER" | jq --arg g "$g" '[.[] | select(.group.S == $g)] | length')
  printf "  %s : %d명\n" "$g" "$cnt"
done
none_cnt=$(echo "$ITEMS_AFTER" | jq '[.[] | select(has("group") == false or .group.S == null)] | length')
printf "  미지정 : %d명\n" "$none_cnt"
