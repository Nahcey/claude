#!/data/data/com.termux/files/usr/bin/bash
# 배포 헬스체크 (CloudFront, API GW, Cognito, DynamoDB)
# 사용법: bash scripts/check-deployment.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=_lib.sh
source "$SCRIPT_DIR/_lib.sh"

load_outputs

FAILED=0
mark_fail() { FAILED=1; }

# ── 1. CloudFront ──────────────────────────────────────────────────────────
if [ -z "$CF_DOMAIN" ]; then
  echo "✗ CloudFront: 도메인 정보 없음 (스택 배포 미완료)"
  echo "  → GitHub Actions 가 성공적으로 완료됐는지 확인"
  mark_fail
else
  CODE=$(curl -sI -o /dev/null -w '%{http_code}' "https://$CF_DOMAIN/")
  if [ "$CODE" = "200" ]; then
    echo "✓ CloudFront: https://$CF_DOMAIN ($CODE)"
  else
    echo "✗ CloudFront: https://$CF_DOMAIN ($CODE)"
    echo "  → 최초 배포 후 10~20분간 전파 중일 수 있음"
    echo "  → aws s3 ls s3://$(get_output FrontendBucketName 2>/dev/null || echo BUCKET)/ 로 sync 확인"
    mark_fail
  fi
fi

# ── 2. API Gateway (/me 는 인증 없이 호출 시 401 이어야 정상) ─────────────
CODE=$(curl -s -o /dev/null -w '%{http_code}' "$API_ENDPOINT/me")
if [ "$CODE" = "401" ]; then
  echo "✓ API Gateway /me: 401 (정상 — JWT 미포함)"
else
  echo "✗ API Gateway /me: $CODE (기대값 401)"
  echo "  → endpoint=$API_ENDPOINT"
  echo "  → JWT Authorizer 설정 확인"
  mark_fail
fi

# ── 3. Cognito Hosted UI ───────────────────────────────────────────────────
CODE=$(curl -sI -o /dev/null -w '%{http_code}' \
  "$COGNITO_DOMAIN/login?response_type=code&client_id=$CLIENT_ID&redirect_uri=https://$CF_DOMAIN/&scope=openid")
case "$CODE" in
  200|302) echo "✓ Cognito Hosted UI: $CODE ($COGNITO_DOMAIN)" ;;
  *)
    echo "✗ Cognito Hosted UI: $CODE"
    echo "  → callback URLs 가 https://$CF_DOMAIN/ 와 일치하는지 확인"
    mark_fail
    ;;
esac

# ── 4. DynamoDB ────────────────────────────────────────────────────────────
STATUS=$(aws dynamodb describe-table \
           --table-name "$TABLE_NAME" \
           --region "$AWS_REGION" \
           --query 'Table.TableStatus' \
           --output text 2>/dev/null || echo NOT_FOUND)
if [ "$STATUS" = "ACTIVE" ]; then
  echo "✓ DynamoDB: $TABLE_NAME (ACTIVE)"
else
  echo "✗ DynamoDB: $TABLE_NAME ($STATUS)"
  mark_fail
fi

echo ""
if [ "$FAILED" -eq 0 ]; then
  echo "==> 모든 항목 정상."
  echo "    앱: https://$CF_DOMAIN"
else
  echo "==> 일부 항목 실패. 위 힌트 참고."
  exit 1
fi
