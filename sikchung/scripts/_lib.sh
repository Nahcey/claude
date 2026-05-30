# sikchung 운영 스크립트 공통 라이브러리 (source 전용, 직접 실행 X)
# 모든 스크립트 첫 줄: source "$(dirname "$0")/_lib.sh"

AWS_REGION="${AWS_REGION:-ap-northeast-2}"
STACK_NAME="${STACK_NAME:-sikchung}"

require_cli() {
  local missing=0
  for cmd in aws jq curl; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      echo "필수 명령어 누락: $cmd" >&2
      missing=1
    fi
  done
  [ "$missing" -eq 0 ] || exit 1
}

# CloudFormation Output 값 한 개 조회
get_output() {
  local key="$1"
  local val
  val=$(aws cloudformation describe-stacks \
          --stack-name "$STACK_NAME" \
          --region "$AWS_REGION" \
          --query "Stacks[0].Outputs[?OutputKey=='$key'].OutputValue" \
          --output text 2>/dev/null || true)
  if [ -z "$val" ] || [ "$val" = "None" ]; then
    echo "스택 출력값을 찾을 수 없음: $key (스택 배포 여부 확인)" >&2
    exit 1
  fi
  printf '%s' "$val"
}

# 자주 쓰는 출력값을 환경변수로 한 번에 로드
load_outputs() {
  require_cli
  USER_POOL_ID="$(get_output UserPoolId)"
  CLIENT_ID="$(get_output ClientId)"
  TABLE_NAME="$(get_output TableName)"
  COGNITO_DOMAIN="$(get_output CognitoDomain)"
  API_ENDPOINT="$(get_output ApiEndpoint)"
  CF_DOMAIN="$(get_output CloudFrontDomain 2>/dev/null || true)"
  export USER_POOL_ID CLIENT_ID TABLE_NAME COGNITO_DOMAIN API_ENDPOINT CF_DOMAIN
}

# 비밀번호 정책 검증: 8자+, 대소문자+숫자+특수문자
validate_password() {
  local pw="$1"
  [ "${#pw}" -ge 8 ] || { echo "비밀번호 8자 이상" >&2; return 1; }
  [[ "$pw" =~ [A-Z] ]]      || { echo "대문자 포함 필요"   >&2; return 1; }
  [[ "$pw" =~ [a-z] ]]      || { echo "소문자 포함 필요"   >&2; return 1; }
  [[ "$pw" =~ [0-9] ]]      || { echo "숫자 포함 필요"     >&2; return 1; }
  [[ "$pw" =~ [^A-Za-z0-9] ]] || { echo "특수문자 포함 필요" >&2; return 1; }
  return 0
}

# Cognito 사용자의 sub 조회 (인자: username)
get_user_sub() {
  local username="$1"
  aws cognito-idp admin-get-user \
    --user-pool-id "$USER_POOL_ID" \
    --region "$AWS_REGION" \
    --username "$username" \
    --query "UserAttributes[?Name=='sub'].Value" \
    --output text 2>/dev/null || true
}

# 사용자 존재 여부 (0=존재, 1=없음)
user_exists() {
  local username="$1"
  aws cognito-idp admin-get-user \
    --user-pool-id "$USER_POOL_ID" \
    --region "$AWS_REGION" \
    --username "$username" \
    >/dev/null 2>&1
}

# MEMBER DynamoDB 레코드 생성 (default 값). 인자: sub username name [group]
# group: A~E 중 하나 또는 빈 문자열(미지정)
put_member_default() {
  local sub="$1"
  local username="$2"
  local name="$3"
  local group="${4:-}"
  local ts
  ts="$(date -u +%FT%TZ)"
  local item
  item=$(jq -n \
    --arg sub      "$sub"      \
    --arg username "$username" \
    --arg name     "$name"     \
    --arg ts       "$ts"       \
    --arg group    "$group"    \
    '{ PK: {S: "MEMBER"}, SK: {S: $sub},
       username:   {S: $username},
       name:       {S: $name},
       restricted: {L: [{BOOL:false},{BOOL:false},{BOOL:false},{BOOL:false},{BOOL:false},{BOOL:false},{BOOL:false},{BOOL:false},{BOOL:false},{BOOL:false},{BOOL:false},{BOOL:false}]},
       double:     {BOOL: false},
       rookie:     {BOOL: false},
       excluded:   {BOOL: false},
       priority:   {N: "0"},
       updatedAt:  {S: $ts}
     }
     | if $group != "" then . + {group: {S: $group}} else . end')
  aws dynamodb put-item \
    --table-name "$TABLE_NAME" \
    --region "$AWS_REGION" \
    --item "$item" >/dev/null
}

# Cognito 사용자 1명 생성 + 그룹 추가 + MEMBER 레코드. 인자: username name role tempPw [group]
# group: A~E 중 하나 또는 빈 문자열(미지정). 반환: 0=생성, 2=이미 존재(스킵)
create_cognito_user() {
  local username="$1" name="$2" role="$3" temp_pw="$4" group="${5:-}"
  if user_exists "$username"; then
    return 2
  fi
  local resp sub
  resp=$(aws cognito-idp admin-create-user \
    --user-pool-id "$USER_POOL_ID" \
    --region "$AWS_REGION" \
    --username "$username" \
    --user-attributes Name=custom:displayName,Value="$name" \
    --temporary-password "$temp_pw" \
    --message-action SUPPRESS \
    --output json)
  sub=$(echo "$resp" | jq -r '.User.Attributes[] | select(.Name=="sub") | .Value')
  [ -n "$sub" ] && [ "$sub" != "null" ] || { echo "sub 조회 실패: $username" >&2; return 1; }

  aws cognito-idp admin-add-user-to-group \
    --user-pool-id "$USER_POOL_ID" \
    --region "$AWS_REGION" \
    --username "$username" \
    --group-name "$role" >/dev/null

  put_member_default "$sub" "$username" "$name" "$group"
  return 0
}
