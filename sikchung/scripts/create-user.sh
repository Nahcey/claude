#!/data/data/com.termux/files/usr/bin/bash
# leader/member 사용자 단건 생성 (Cognito username 기반 + DynamoDB MEMBER 레코드)
# 사용법: bash scripts/create-user.sh username role "표시이름" tempPassword group
# 예시:  bash scripts/create-user.sh wjdqhwndeo01 member "이동민" TempPass123! A

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

USERNAME="${1:-}"
ROLE="${2:-}"
NAME="${3:-}"
TEMP_PW="${4:-}"
GROUP="${5:-}"

usage() {
  cat <<EOF
사용법: $0 USERNAME ROLE "표시이름" TEMP_PASSWORD GROUP
  ROLE   : leader | member
  GROUP  : A~E 중 하나 (필수)
예시:
  $0 wjdqhwndeo02 leader "김기환" TempPass123! A
  $0 wjdqhwndeo07 member "정한결" TempPass123! B
  $0 wjdqhwndeo09 member "오승호" TempPass123! C
EOF
  exit 1
}

[ -n "$USERNAME" ] && [ -n "$ROLE" ] && [ -n "$NAME" ] && [ -n "$TEMP_PW" ] && [ -n "$GROUP" ] || usage

case "$ROLE" in
  leader|member) ;;
  *) echo "ROLE 은 leader 또는 member 만 허용됩니다 (입력: $ROLE)" >&2; usage ;;
esac

case "$GROUP" in
  A|B|C|D|E) ;;
  *) echo "GROUP 은 A~E 중 하나여야 합니다 (입력: $GROUP)" >&2; usage ;;
esac

validate_password "$TEMP_PW" || { echo "비밀번호 정책 위반" >&2; exit 1; }

load_outputs

echo "→ 사용자 생성: $USERNAME ($ROLE / $NAME${GROUP:+ / 그룹 $GROUP})"
if create_cognito_user "$USERNAME" "$NAME" "$ROLE" "$TEMP_PW" "$GROUP"; then
  echo ""
  echo "✓ 생성 완료  username=$USERNAME  role=$ROLE  name=$NAME${GROUP:+  group=$GROUP}"
else
  rc=$?
  if [ "$rc" -eq 2 ]; then
    echo "이미 존재하는 사용자: $USERNAME (스킵). 권한 변경은 set-role.sh 사용." >&2
    exit 0
  fi
  exit "$rc"
fi
