#!/data/data/com.termux/files/usr/bin/bash
# 비밀번호 강제 재설정 (분대원 비번 분실 시 admin 이 사용)
# admin-set-user-password --permanent 로 즉시 영구 비번 설정 (변경요구 없음)
# 사용법: bash scripts/reset-password.sh username 새비번
# 예시:  bash scripts/reset-password.sh wjdqhwndeo05 NewPass123!

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

USERNAME="${1:-}"
NEW_PW="${2:-}"

if [ -z "$USERNAME" ] || [ -z "$NEW_PW" ]; then
  cat <<EOF
사용법: $0 USERNAME 새비번
예시:  $0 wjdqhwndeo05 NewPass123!
EOF
  exit 1
fi

validate_password "$NEW_PW" || { echo "비밀번호 정책 위반" >&2; exit 1; }

load_outputs

if ! user_exists "$USERNAME"; then
  echo "사용자를 찾을 수 없음: $USERNAME" >&2
  exit 1
fi

aws cognito-idp admin-set-user-password \
  --user-pool-id "$USER_POOL_ID" \
  --region "$AWS_REGION" \
  --username "$USERNAME" \
  --password "$NEW_PW" \
  --permanent

echo "✓ 비밀번호 재설정 완료: $USERNAME"
echo "  새 비번으로 즉시 로그인 가능 (변경 요구 없음)"
