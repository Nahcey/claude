#!/data/data/com.termux/files/usr/bin/bash
# 권한 부여/회수 (admin / leader / member)
# 기존 admin/leader/member 그룹에서 모두 제거 후 지정 role 그룹에 추가
# 사용법: bash scripts/set-role.sh username role
# 예시:  bash scripts/set-role.sh wjdqhwndeo02 leader   (분대장 지정)
#        bash scripts/set-role.sh wjdqhwndeo02 member   (분대원으로 회수)

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

USERNAME="${1:-}"
ROLE="${2:-}"

usage() {
  cat <<EOF
사용법: $0 USERNAME ROLE
  ROLE : admin | leader | member
예시:
  $0 wjdqhwndeo02 leader
  $0 wjdqhwndeo02 member
EOF
  exit 1
}

[ -n "$USERNAME" ] && [ -n "$ROLE" ] || usage

case "$ROLE" in
  admin|leader|member) ;;
  *) echo "ROLE 은 admin / leader / member 중 하나여야 합니다 (입력: $ROLE)" >&2; usage ;;
esac

load_outputs

if ! user_exists "$USERNAME"; then
  echo "사용자를 찾을 수 없음: $USERNAME" >&2
  exit 1
fi

current_groups() {
  aws cognito-idp admin-list-groups-for-user \
    --user-pool-id "$USER_POOL_ID" \
    --region "$AWS_REGION" \
    --username "$USERNAME" \
    --query 'Groups[*].GroupName' \
    --output text 2>/dev/null | tr '\t' ' ' | xargs || true
}

BEFORE="$(current_groups)"
echo "변경 전 권한: ${BEFORE:-(없음)}"

# 기존 역할 그룹에서 제거
for g in admin leader member; do
  aws cognito-idp admin-remove-user-from-group \
    --user-pool-id "$USER_POOL_ID" \
    --region "$AWS_REGION" \
    --username "$USERNAME" \
    --group-name "$g" >/dev/null 2>&1 || true
done

# 지정 role 추가
aws cognito-idp admin-add-user-to-group \
  --user-pool-id "$USER_POOL_ID" \
  --region "$AWS_REGION" \
  --username "$USERNAME" \
  --group-name "$ROLE" >/dev/null

AFTER="$(current_groups)"
echo "변경 후 권한: ${AFTER:-(없음)}"
echo ""
echo "✓ $USERNAME → $ROLE"
echo "  (사용자는 다음 로그인 시 새 권한이 적용된 토큰을 받음)"
