#!/data/data/com.termux/files/usr/bin/bash
# Lambda 로그 tail
# 사용법: bash scripts/logs.sh [함수명_일부]

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"
require_cli

FILTER="${1:-}"

# sikchung 스택의 Lambda 로그 그룹 후보
list_groups() {
  aws logs describe-log-groups \
    --log-group-name-prefix "/aws/lambda/sikchung-" \
    --region "$AWS_REGION" \
    --query 'logGroups[*].logGroupName' \
    --output text | tr '\t' '\n' | sort
}

if [ -z "$FILTER" ]; then
  echo "Lambda 로그 그룹 목록:"
  echo ""
  GROUPS="$(list_groups)"
  if [ -z "$GROUPS" ]; then
    echo "  (없음 — 스택 배포 여부 확인)"
  else
    echo "$GROUPS" | sed 's/^/  /'
  fi
  echo ""
  echo "사용법: $0 [함수명_일부]"
  echo "예시:   $0 MeFunction"
  exit 0
fi

LG=$(list_groups | grep -i -- "$FILTER" | head -n 1 || true)
if [ -z "$LG" ]; then
  echo "매칭되는 로그 그룹 없음: $FILTER" >&2
  echo "전체 목록:" >&2
  list_groups | sed 's/^/  /' >&2
  exit 1
fi

echo "Tailing: $LG  (Ctrl+C 로 중단)"
echo ""
exec aws logs tail "$LG" --follow --format short --region "$AWS_REGION"
