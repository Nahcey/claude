#!/data/data/com.termux/files/usr/bin/bash
# 기수 승급: 빈 그룹이 생겼을 때 아래 기수를 한 단계씩 위로 올린다.
#
# 승급 규칙:
#   그룹 순서: A(위) > B > C > D > E(아래)
#   빈 그룹 X 발견 시 → X보다 아래 그룹의 인원 전원을 한 단계 위로 이동.
#   예) C가 비면 → D→C, E→D  (A, B 불변. E는 빔)
#   빈 그룹이 없으면 종료.
#   한 번 실행 = 한 단계 처리 (빈 그룹 1개 기준). 반복은 사용자가 판단.
#
# 사용법: bash scripts/promote.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

GROUPS=(A B C D E)

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

# ── 현재 그룹 분포 출력 ──────────────────────────────────────────────────────
echo "현재 그룹 분포:"
declare -A GROUP_COUNT
for g in "${GROUPS[@]}"; do
  cnt=$(echo "$ITEMS" | jq --arg g "$g" '[.[] | select(.group.S == $g)] | length')
  GROUP_COUNT[$g]=$cnt
  printf "  %s : %d명\n" "$g" "$cnt"
done
none_cnt=$(echo "$ITEMS" | jq '[.[] | select(.group == null or .group.S == null or has("group") == false)] | length')
printf "  미지정 : %d명\n" "$none_cnt"
echo ""

# ── 빈 그룹 감지 (A부터 순서대로 첫 번째만) ────────────────────────────────
EMPTY_GROUP=""
for g in "${GROUPS[@]}"; do
  if [ "${GROUP_COUNT[$g]}" -eq 0 ]; then
    EMPTY_GROUP="$g"
    break
  fi
done

if [ -z "$EMPTY_GROUP" ]; then
  echo "승급할 빈 그룹이 없습니다. 모든 그룹에 인원이 배정돼 있습니다."
  exit 0
fi

echo "빈 그룹 감지: $EMPTY_GROUP"
echo ""

# ── 이동 계획 수립 (빈 그룹 아래의 그룹들을 한 단계 위로) ──────────────────
# EMPTY_GROUP보다 아래에 있는 그룹의 인원을 찾아 한 단계 위로 이동
declare -a PLAN_FROM=()
declare -a PLAN_TO=()

# 그룹 인덱스 찾기 (A=0, B=1, C=2, D=3, E=4)
EMPTY_IDX=-1
for i in "${!GROUPS[@]}"; do
  if [ "${GROUPS[$i]}" = "$EMPTY_GROUP" ]; then
    EMPTY_IDX=$i
    break
  fi
done

# 빈 그룹 아래의 그룹들 (empty+1 ~ 4) 각각 한 단계 위로
for (( i=EMPTY_IDX+1; i<${#GROUPS[@]}; i++ )); do
  from="${GROUPS[$i]}"
  to="${GROUPS[$((i-1))]}"
  cnt="${GROUP_COUNT[$from]}"
  if [ "$cnt" -gt 0 ]; then
    PLAN_FROM+=("$from")
    PLAN_TO+=("$to")
    echo "  $from ($cnt명) → $to"
  fi
done

if [ ${#PLAN_FROM[@]} -eq 0 ]; then
  echo "이동할 인원이 없습니다 ($EMPTY_GROUP 아래 그룹이 모두 비어 있음)."
  exit 0
fi

echo ""
printf "위 이동을 실행하시겠습니까? (y/N) "
read -r CONFIRM
case "$CONFIRM" in
  y|Y|yes|YES) ;;
  *) echo "취소됨"; exit 0 ;;
esac

echo ""

# ── 실제 DynamoDB 업데이트 ───────────────────────────────────────────────────
UPDATED=0
for idx in "${!PLAN_FROM[@]}"; do
  from="${PLAN_FROM[$idx]}"
  to="${PLAN_TO[$idx]}"
  echo "→ $from → $to 이동 중..."

  # 해당 그룹 인원 sub 목록
  SUBS=$(echo "$ITEMS" | jq -r --arg g "$from" '.[] | select(.group.S == $g) | .SK.S')

  while IFS= read -r sub; do
    [ -z "$sub" ] && continue
    aws dynamodb update-item \
      --table-name "$TABLE_NAME" \
      --region "$AWS_REGION" \
      --key "{\"PK\":{\"S\":\"MEMBER\"},\"SK\":{\"S\":\"$sub\"}}" \
      --update-expression "SET #g = :g, updatedAt = :ts" \
      --expression-attribute-names '{"#g":"group"}' \
      --expression-attribute-values "{\":g\":{\"S\":\"$to\"},\":ts\":{\"S\":\"$(date -u +%FT%TZ)\"}}" \
      >/dev/null
    UPDATED=$((UPDATED + 1))
  done <<< "$SUBS"

  echo "  ✓ $from → $to : $(echo "$SUBS" | grep -c .) 명 완료"
done

echo ""
echo "──────────────────────────────────────────"
echo "승급 완료: 총 ${UPDATED}명 업데이트"
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

for g in "${GROUPS[@]}"; do
  cnt=$(echo "$ITEMS_AFTER" | jq --arg g "$g" '[.[] | select(.group.S == $g)] | length')
  printf "  %s : %d명\n" "$g" "$cnt"
done
