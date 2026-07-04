#!/data/data/com.termux/files/usr/bin/bash
# 전역 일정 모드(normal|summer) 조회/변경 — admin CLI 전용
# 웹에는 변경 수단 없음 (GET /schedule/mode 로 읽기만 함).
# DynamoDB SETTINGS/SCHEDULE_MODE 레코드를 직접 put-item 하고,
# 변경 시 AUDIT 파티션에 감사 로그도 함께 적재한다.
#
# 사용법: bash scripts/set-schedule-mode.sh [normal|summer]
#   인자 없음 → 현재 모드 조회

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

MODE="${1:-}"

usage() {
  cat <<EOF
사용법: $0 [MODE]
  MODE : normal | summer  (생략 시 현재 모드 조회)
예시:
  $0           # 현재 모드 조회
  $0 summer    # 혹서기 모드로
  $0 normal    # 일반 모드로
EOF
  exit 1
}

if [ -n "$MODE" ]; then
  case "$MODE" in
    normal|summer) ;;
    *) echo "MODE 는 normal 또는 summer 여야 합니다 (입력: $MODE)" >&2; usage ;;
  esac
fi

load_outputs

# 현재 모드 조회 (레코드 없으면 normal 기본값)
current_mode() {
  local item
  item=$(aws dynamodb get-item \
    --table-name "$TABLE_NAME" \
    --region "$AWS_REGION" \
    --key '{"PK":{"S":"SETTINGS"},"SK":{"S":"SCHEDULE_MODE"}}' \
    --output json 2>/dev/null || echo '{}')
  echo "$item" | jq -r '.Item.mode.S // empty'
}

BEFORE="$(current_mode)"

if [ -z "$MODE" ]; then
  # 조회만
  if [ -n "$BEFORE" ]; then
    echo "현재 모드: $BEFORE"
  else
    echo "현재 모드: normal (기본값 — 설정 레코드 없음)"
  fi
  exit 0
fi

NOW="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"

# 1) 모드 설정 저장
aws dynamodb put-item \
  --table-name "$TABLE_NAME" \
  --region "$AWS_REGION" \
  --item "$(jq -n --arg mode "$MODE" --arg now "$NOW" \
    '{PK:{S:"SETTINGS"}, SK:{S:"SCHEDULE_MODE"}, mode:{S:$mode}, updatedAt:{S:$now}}')" \
  >/dev/null

# 2) 감사 로그 적재 — backend/lib/audit.js 아이템 형식과 동일
#    SK = '<ISO timestamp>#<3바이트 hex>' (Termux 호환 urandom 방식)
RAND_HEX="$(od -An -N3 -tx1 /dev/urandom | tr -d ' \n')"
AUDIT_SK="${NOW}#${RAND_HEX}"
aws dynamodb put-item \
  --table-name "$TABLE_NAME" \
  --region "$AWS_REGION" \
  --item "$(jq -n --arg sk "$AUDIT_SK" --arg now "$NOW" --arg mode "$MODE" \
    '{PK:{S:"AUDIT"}, SK:{S:$sk}, timestamp:{S:$now},
      action:{S:"SCHEDULE_MODE_SET"},
      actorSub:{NULL:true}, actorRole:{S:"admin"},
      detail:{M:{mode:{S:$mode}, via:{S:"cli"}}}}')" \
  >/dev/null

echo "✓ 모드 변경: ${BEFORE:-normal(기본값)} → $MODE"
echo ""
echo "열려 있는 웹 세션은 새로고침 시 반영됩니다."
echo "(일정 생성은 생성 시점에 모드를 자동 재조회하므로 낡은 모드로 생성되지 않음)"
