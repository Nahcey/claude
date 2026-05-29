#!/data/data/com.termux/files/usr/bin/bash
# 분대원 12명 일괄 생성 (username 기반, 전원 member 그룹)
# 아이디-이름 고정 매핑. wjdqhwndeo10 은 생성하지 않음 (박예찬은 admin: wjdqhwndeo00).
# 사용법: bash scripts/batch-create-members.sh [tempPassword]

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

TEMP_PW="${1:-TempPass123!}"

validate_password "$TEMP_PW" || { echo "비밀번호 정책 위반" >&2; exit 1; }

# 고정 매핑 (username:이름). 순서 = 인원 카드 표시 순서.
MEMBERS=(
  "wjdqhwndeo01:이동민"
  "wjdqhwndeo02:김기환"
  "wjdqhwndeo03:정우진"
  "wjdqhwndeo04:윤민형"
  "wjdqhwndeo05:한우현"
  "wjdqhwndeo06:권정훈"
  "wjdqhwndeo07:정한결"
  "wjdqhwndeo08:김최원"
  "wjdqhwndeo09:오승호"
  "wjdqhwndeo11:권기범"
  "wjdqhwndeo12:최정협"
  "wjdqhwndeo13:전유찬"
)

load_outputs

CREATED=0
SKIPPED=0
echo "→ 분대원 ${#MEMBERS[@]}명 생성 시작 (임시비번: $TEMP_PW)"
echo ""

for entry in "${MEMBERS[@]}"; do
  username="${entry%%:*}"
  name="${entry#*:}"
  if create_cognito_user "$username" "$name" member "$TEMP_PW"; then
    echo "  ✓ 생성  $username = $name"
    CREATED=$((CREATED + 1))
  else
    rc=$?
    if [ "$rc" -eq 2 ]; then
      echo "  - 스킵  $username = $name (이미 존재)"
      SKIPPED=$((SKIPPED + 1))
    else
      echo "  ✗ 실패  $username = $name (rc=$rc)" >&2
      exit "$rc"
    fi
  fi
done

echo ""
echo "──────────────────────────────────────────"
echo "결과: 생성 $CREATED · 스킵 $SKIPPED · 총 ${#MEMBERS[@]}"
echo "──────────────────────────────────────────"
printf "%-16s %s\n" "아이디" "이름"
for entry in "${MEMBERS[@]}"; do
  printf "%-16s %s\n" "${entry%%:*}" "${entry#*:}"
done
echo ""
echo "전원 member 권한. 분대장 지정: bash scripts/set-role.sh wjdqhwndeoNN leader"
