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

# 고정 매핑 (username:이름:그룹). 순서 = 인원 카드 표시 순서.
# 그룹: A=최고참, B, C, D, E=신참 (빈 문자열=미지정)
MEMBERS=(
  "wjdqhwndeo01:이동민:A"
  "wjdqhwndeo02:김기환:A"
  "wjdqhwndeo03:정우진:A"
  "wjdqhwndeo04:윤민형:B"
  "wjdqhwndeo05:한우현:B"
  "wjdqhwndeo06:권정훈:B"
  "wjdqhwndeo07:정한결:B"
  "wjdqhwndeo08:김최원:B"
  "wjdqhwndeo09:오승호:C"
  "wjdqhwndeo11:권기범:C"
  "wjdqhwndeo12:최정협:C"
  "wjdqhwndeo13:전유찬:C"
)

load_outputs

CREATED=0
SKIPPED=0
echo "→ 분대원 ${#MEMBERS[@]}명 생성 시작 (임시비번: $TEMP_PW)"
echo ""

for entry in "${MEMBERS[@]}"; do
  username="${entry%%:*}"
  rest="${entry#*:}"
  name="${rest%%:*}"
  group="${rest#*:}"
  [ "$group" = "$name" ] && group=""   # 콜론이 하나뿐이면 group 없음
  if create_cognito_user "$username" "$name" member "$TEMP_PW" "$group"; then
    echo "  ✓ 생성  $username = $name${group:+ [그룹 $group]}"
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
printf "%-16s %-12s %s\n" "아이디" "이름" "그룹"
for entry in "${MEMBERS[@]}"; do
  username="${entry%%:*}"; rest="${entry#*:}"; name="${rest%%:*}"; grp="${rest#*:}"
  [ "$grp" = "$name" ] && grp="-"
  printf "%-16s %-12s %s\n" "$username" "$name" "$grp"
done
echo ""
echo "전원 member 권한. 분대장 지정: bash scripts/set-role.sh wjdqhwndeoNN leader"
