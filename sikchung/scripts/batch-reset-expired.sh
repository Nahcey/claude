#!/data/data/com.termux/files/usr/bin/bash
# FORCE_CHANGE_PASSWORD 상태(임시 비번 만료)인 계정 전원 일괄 복구
# admin-set-user-password --permanent 로 영구 비번으로 즉시 승격
# 사용법: bash scripts/batch-reset-expired.sh 새비번
# 예시:  bash scripts/batch-reset-expired.sh NewPass123!

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

NEW_PW="${1:-}"
if [ -z "$NEW_PW" ]; then
  cat <<EOF
사용법: $0 새비번
예시:  $0 NewPass123!

FORCE_CHANGE_PASSWORD 상태인 계정 전원의 비밀번호를 영구 비번으로 일괄 재설정합니다.
재설정 후 바로 로그인 가능 (추가 변경 요구 없음).
EOF
  exit 1
fi

validate_password "$NEW_PW" || { echo "비밀번호 정책 위반" >&2; exit 1; }

load_outputs

# FORCE_CHANGE_PASSWORD 사용자 목록 수집 (페이지네이션)
fetch_expired_users() {
  local token="" page
  while :; do
    if [ -n "$token" ]; then
      page=$(aws cognito-idp list-users \
        --user-pool-id "$USER_POOL_ID" \
        --region "$AWS_REGION" \
        --filter 'cognito:user_status = "FORCE_CHANGE_PASSWORD"' \
        --pagination-token "$token" \
        --output json)
    else
      page=$(aws cognito-idp list-users \
        --user-pool-id "$USER_POOL_ID" \
        --region "$AWS_REGION" \
        --filter 'cognito:user_status = "FORCE_CHANGE_PASSWORD"' \
        --output json)
    fi
    echo "$page" | jq -r '.Users[].Username'
    token=$(echo "$page" | jq -r '.PaginationToken // empty')
    [ -n "$token" ] || break
  done
}

EXPIRED_USERS="$(fetch_expired_users)"

if [ -z "$EXPIRED_USERS" ]; then
  echo "FORCE_CHANGE_PASSWORD 상태인 계정 없음 — 모두 정상입니다."
  exit 0
fi

COUNT=$(echo "$EXPIRED_USERS" | wc -l | tr -d ' ')
echo "복구 대상: ${COUNT}명"
echo "$EXPIRED_USERS" | while read -r uname; do
  echo "  • $uname"
done
echo ""

read -r -p "위 계정 전원을 비번 '${NEW_PW}'로 재설정합니다. 계속할까요? [y/N] " CONFIRM
case "$CONFIRM" in
  [yY]|[yY][eE][sS]) ;;
  *) echo "취소됨."; exit 0 ;;
esac

echo ""
OK=0; FAIL=0
while IFS= read -r uname; do
  [ -n "$uname" ] || continue
  if aws cognito-idp admin-set-user-password \
       --user-pool-id "$USER_POOL_ID" \
       --region "$AWS_REGION" \
       --username "$uname" \
       --password "$NEW_PW" \
       --permanent >/dev/null 2>&1; then
    echo "  ✓ $uname"
    OK=$((OK + 1))
  else
    echo "  ✗ $uname (실패)" >&2
    FAIL=$((FAIL + 1))
  fi
done <<< "$EXPIRED_USERS"

echo ""
echo "완료: 성공 ${OK}명 / 실패 ${FAIL}명"
[ "$FAIL" -eq 0 ] || exit 1
