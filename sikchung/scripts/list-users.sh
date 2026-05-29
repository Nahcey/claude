#!/data/data/com.termux/files/usr/bin/bash
# 사용자 목록 출력 (그룹별 + 무소속). username / displayName / sub 표시
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

ADMINS="$(group_usernames admin)"
LEADERS="$(group_usernames leader)"
MEMBERS="$(group_usernames member)"

in_set() { echo "$2" | grep -qxF "$1"; }

print_group() {
  local title="$1" set="$2"
  echo ""
  echo "── $title ────────────────────────────────────────"
  local any=0
  while IFS=$'\t' read -r uname dname sub; do
    [ -n "$uname" ] || continue
    if in_set "$uname" "$set"; then
      printf "  • %-16s | %-10s | %s\n" "$uname" "$dname" "$sub"
      any=1
    fi
  done <<< "$ALL"
  [ "$any" -eq 1 ] || echo "  (없음)"
}

print_ungrouped() {
  echo ""
  echo "── (무소속) ──────────────────────────────────────"
  local any=0
  while IFS=$'\t' read -r uname dname sub; do
    [ -n "$uname" ] || continue
    if ! in_set "$uname" "$ADMINS" && ! in_set "$uname" "$LEADERS" && ! in_set "$uname" "$MEMBERS"; then
      printf "  • %-16s | %-10s | %s\n" "$uname" "$dname" "$sub"
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
