#!/data/data/com.termux/files/usr/bin/bash
# 사용자 목록 출력 (그룹별 + 무소속). username / displayName / 분대그룹 / sub 표시
# 사용법: bash scripts/list-users.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

load_outputs

# 전체 사용자 조회 (페이지네이션). username/displayName/sub 추출.
fetch_all_users() {
  local token="" page
  while :; do
    if [ -n "$token" ]; then
      page=$(aws cognito-idp list-users \
        --user-pool-id "$USER_POOL_ID" --region "$AWS_REGION" \
        --pagination-token "$token" --output json)
    else
      page=$(aws cognito-idp list-users \
        --user-pool-id "$USER_POOL_ID" --region "$AWS_REGION" --output json)
    fi
    echo "$page" | jq -r '
      .Users[] |
      (.Attributes | from_entries) as $a |
      .Username + "\t" + ($a["custom:displayName"] // "-") + "\t" + ($a.sub // "-")
    '
    token=$(echo "$page" | jq -r '.PaginationToken // empty')
    [ -n "$token" ] || break
  done
}

# DynamoDB에서 sub→분대그룹 맵 로드 ("sub\t그룹" 형태)
fetch_dynamo_groups() {
  aws dynamodb query \
    --table-name "$TABLE_NAME" \
    --region "$AWS_REGION" \
    --key-condition-expression "PK = :pk" \
    --expression-attribute-values '{":pk":{"S":"MEMBER"}}' \
    --projection-expression "SK, #grp" \
    --expression-attribute-names '{"#grp":"group"}' \
    --output json 2>/dev/null \
  | jq -r '.Items[] | .SK.S + "\t" + (.group.S // "-")' || true
}

# sub 로 분대그룹 조회
get_dynamo_group() {
  echo "$DYNAMO_GROUPS" | awk -F'\t' -v s="$1" '$1==s{print $2; exit}'
}

# 그룹 멤버 username 집합
group_usernames() {
  aws cognito-idp list-users-in-group \
    --user-pool-id "$USER_POOL_ID" --region "$AWS_REGION" \
    --group-name "$1" --output json 2>/dev/null \
    | jq -r '.Users[].Username' || true
}

ALL="$(fetch_all_users)"
if [ -z "$ALL" ]; then
  echo "사용자 없음 (스택 재생성 직후라면 계정 생성 필요)"
  exit 0
fi

DYNAMO_GROUPS="$(fetch_dynamo_groups)"
ADMINS="$(group_usernames admin)"
LEADERS="$(group_usernames leader)"
MEMBERS="$(group_usernames member)"

in_set() { echo "$2" | grep -qxF "$1"; }

print_group() {
  local title="$1" set="$2"
  echo ""
  echo "── $title ────────────────────────────────────────"
  printf "  %-18s %-12s %-6s %s\n" "아이디" "이름" "라인" "sub"
  local any=0
  while IFS=$'\t' read -r uname dname sub; do
    [ -n "$uname" ] || continue
    if in_set "$uname" "$set"; then
      local grp
      grp="$(get_dynamo_group "$sub")"
      printf "  • %-16s %-12s %-6s %s\n" "$uname" "$dname" "${grp:--}" "$sub"
      any=1
    fi
  done <<< "$ALL"
  [ "$any" -eq 1 ] || echo "  (없음)"
}

print_ungrouped() {
  echo ""
  echo "── (무소속) ──────────────────────────────────────"
  printf "  %-18s %-12s %-6s %s\n" "아이디" "이름" "라인" "sub"
  local any=0
  while IFS=$'\t' read -r uname dname sub; do
    [ -n "$uname" ] || continue
    if ! in_set "$uname" "$ADMINS" && ! in_set "$uname" "$LEADERS" && ! in_set "$uname" "$MEMBERS"; then
      local grp
      grp="$(get_dynamo_group "$sub")"
      printf "  • %-16s %-12s %-6s %s\n" "$uname" "$dname" "${grp:--}" "$sub"
      any=1
    fi
  done <<< "$ALL"
  [ "$any" -eq 1 ] || echo "  (없음)"
}

print_group "admin"  "$ADMINS"
print_group "leader" "$LEADERS"
print_group "member" "$MEMBERS"
print_ungrouped
echo ""
