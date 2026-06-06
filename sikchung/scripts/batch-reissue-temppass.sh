#!/data/data/com.termux/files/usr/bin/bash
# 전체(또는 지정 그룹) 계정에 임시 비번 일괄 재발급
# admin-set-user-password (--permanent 없음) → FORCE_CHANGE_PASSWORD 상태로 전환
# 다음 로그인 시 Hosted UI가 자동으로 비밀번호 변경 화면을 표시한다.
#
# 사용법: bash scripts/batch-reissue-temppass.sh 임시비번 [그룹...]
# 예시 (전체): bash scripts/batch-reissue-temppass.sh Temp1234!
# 예시 (멤버만): bash scripts/batch-reissue-temppass.sh Temp1234! member
# 예시 (멤버+분대장): bash scripts/batch-reissue-temppass.sh Temp1234! member leader

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

TEMP_PW="${1:-}"
shift || true
TARGET_GROUPS=("$@")   # 비어있으면 전체

if [ -z "$TEMP_PW" ]; then
  cat <<EOF
사용법: $0 임시비번 [그룹...]
예시 (전체):         $0 Temp1234!
예시 (멤버만):       $0 Temp1234! member
예시 (멤버+분대장): $0 Temp1234! member leader

재발급 후 각 사용자는 다음 로그인 시 Hosted UI에서
직접 새 비밀번호를 설정하게 됩니다.
EOF
  exit 1
fi

validate_password "$TEMP_PW" || { echo "비밀번호 정책 위반" >&2; exit 1; }

load_outputs

# 그룹 멤버 username 목록 (페이지네이션)
fetch_group_users() {
  local group="$1"
  local token="" page
  while :; do
    if [ -n "$token" ]; then
      page=$(aws cognito-idp list-users-in-group \
        --user-pool-id "$USER_POOL_ID" --region "$AWS_REGION" \
        --group-name "$group" --next-token "$token" --output json 2>/dev/null || echo '{"Users":[]}')
    else
      page=$(aws cognito-idp list-users-in-group \
        --user-pool-id "$USER_POOL_ID" --region "$AWS_REGION" \
        --group-name "$group" --output json 2>/dev/null || echo '{"Users":[]}')
    fi
    echo "$page" | jq -r '.Users[].Username'
    token=$(echo "$page" | jq -r '.NextToken // empty')
    [ -n "$token" ] || break
  done
}

# 전체 사용자 username 목록 (페이지네이션)
fetch_all_usernames() {
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
    echo "$page" | jq -r '.Users[].Username'
    token=$(echo "$page" | jq -r '.PaginationToken // empty')
    [ -n "$token" ] || break
  done
}

# 대상 목록 수집
if [ "${#TARGET_GROUPS[@]}" -gt 0 ]; then
  TARGETS=""
  for grp in "${TARGET_GROUPS[@]}"; do
    MEMBERS="$(fetch_group_users "$grp")"
    [ -z "$MEMBERS" ] || TARGETS="${TARGETS}${MEMBERS}"$'\n'
  done
  # 중복 제거
  TARGETS="$(echo "$TARGETS" | sort -u | grep -v '^$' || true)"
  SCOPE_LABEL="그룹: ${TARGET_GROUPS[*]}"
else
  TARGETS="$(fetch_all_usernames)"
  SCOPE_LABEL="전체 계정"
fi

if [ -z "$TARGETS" ]; then
  echo "대상 계정 없음."
  exit 0
fi

COUNT=$(echo "$TARGETS" | wc -l | tr -d ' ')
echo "대상 범위: ${SCOPE_LABEL}"
echo "재발급 대상: ${COUNT}명"
echo "$TARGETS" | while IFS= read -r uname; do [ -n "$uname" ] && echo "  • $uname"; done
echo ""
echo "재발급 후 각 계정은 다음 로그인 시 비밀번호 변경을 요구받습니다."
echo ""

read -r -p "계속할까요? [y/N] " CONFIRM
case "$CONFIRM" in
  [yY]|[yY][eE][sS]) ;;
  *) echo "취소됨."; exit 0 ;;
esac

echo ""
OK=0; FAIL=0
while IFS= read -r uname; do
  [ -n "$uname" ] || continue
  # --permanent 없음 → FORCE_CHANGE_PASSWORD 상태로 전환
  if aws cognito-idp admin-set-user-password \
       --user-pool-id "$USER_POOL_ID" \
       --region "$AWS_REGION" \
       --username "$uname" \
       --password "$TEMP_PW" \
       >/dev/null 2>&1; then
    echo "  ✓ $uname"
    OK=$((OK + 1))
  else
    echo "  ✗ $uname (실패)" >&2
    FAIL=$((FAIL + 1))
  fi
done <<< "$TARGETS"

echo ""
echo "완료: 성공 ${OK}명 / 실패 ${FAIL}명"
echo ""
echo "각 사용자에게 임시 비번 '${TEMP_PW}'을 전달하세요."
echo "로그인 시 Hosted UI에서 바로 새 비밀번호를 설정하게 됩니다."
[ "$FAIL" -eq 0 ] || exit 1
