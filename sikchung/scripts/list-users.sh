#!/data/data/com.termux/files/usr/bin/bash
# 사용자 목록 출력 (그룹별)
# 사용법: bash scripts/list-users.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

load_outputs

list_group() {
  local group="$1"
  echo ""
  echo "── $group ────────────────────────────────────────"
  local resp
  resp=$(aws cognito-idp list-users-in-group \
           --user-pool-id "$USER_POOL_ID" \
           --region "$AWS_REGION" \
           --group-name "$group" \
           --output json 2>/dev/null || echo '{"Users":[]}')
  local count
  count=$(echo "$resp" | jq '.Users | length')
  if [ "$count" -eq 0 ]; then
    echo "  (없음)"
    return
  fi
  echo "$resp" | jq -r '
    .Users[] |
    (.Attributes | from_entries) as $a |
    "  • " + ($a.email // "?") +
    "  | name=" + ($a["custom:displayName"] // "-") +
    "  | sub=" + ($a.sub // "-")
  '
}

list_group admin
list_group leader
list_group member
echo ""
