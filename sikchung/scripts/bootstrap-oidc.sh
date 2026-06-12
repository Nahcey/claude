#!/usr/bin/env bash
# GitHub Actions OIDC 배포용 IAM 부트스트랩 (멱등, 사용자가 로컬에서 1회 실행)
#  1) token.actions.githubusercontent.com OIDC provider 생성 (없을 때만)
#  2) IAM role 'sikchung-gha-deploy' 생성/갱신
#     - trust: 이 repo의 main 브랜치 push 에서만 AssumeRoleWithWebIdentity 허용
#  3) sam deploy에 필요한 인라인 권한 정책 적용 (덮어쓰기 멱등)
#  4) role ARN 출력 → GitHub repo variable AWS_DEPLOY_ROLE_ARN 에 등록할 것
#
# 사용법: bash scripts/bootstrap-oidc.sh

set -euo pipefail

# ── 설정 (필요 시 수정) ───────────────────────────────────────────────────────
OWNER="Nahcey"
REPO="claude"
ROLE_NAME="sikchung-gha-deploy"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
ECR_REPO="sikchung"
STACK_NAME="sikchung"

OIDC_HOST="token.actions.githubusercontent.com"
OIDC_URL="https://${OIDC_HOST}"

command -v aws >/dev/null 2>&1 || { echo "aws CLI 필요" >&2; exit 1; }
command -v jq  >/dev/null 2>&1 || { echo "jq 필요" >&2; exit 1; }

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
echo "Account: $ACCOUNT_ID / Region: $AWS_REGION"

# ── 1. OIDC provider (멱등) ───────────────────────────────────────────────────
PROVIDER_ARN="arn:aws:iam::${ACCOUNT_ID}:oidc-provider/${OIDC_HOST}"
if aws iam get-open-id-connect-provider --open-id-connect-provider-arn "$PROVIDER_ARN" >/dev/null 2>&1; then
  echo "✓ OIDC provider 이미 존재: $PROVIDER_ARN"
else
  echo "OIDC provider 생성 중…"
  # thumbprint는 AWS가 GitHub OIDC에 대해 자체 신뢰 체인을 사용하므로 형식상 값
  aws iam create-open-id-connect-provider \
    --url "$OIDC_URL" \
    --client-id-list "sts.amazonaws.com" \
    --thumbprint-list "6938fd4d98bab03faadb97b34396831e3780aea1" "1c58a3a8518e8759bf075b76b750d4f2df264fcd" \
    >/dev/null
  echo "✓ OIDC provider 생성됨: $PROVIDER_ARN"
fi

# ── 2. Trust policy — main 브랜치로 sub claim 핀 ─────────────────────────────
TRUST_POLICY=$(jq -n \
  --arg provider "$PROVIDER_ARN" \
  --arg sub "repo:${OWNER}/${REPO}:ref:refs/heads/main" \
  '{
    Version: "2012-10-17",
    Statement: [{
      Effect: "Allow",
      Principal: { Federated: $provider },
      Action: "sts:AssumeRoleWithWebIdentity",
      Condition: {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": $sub
        }
      }
    }]
  }')

if aws iam get-role --role-name "$ROLE_NAME" >/dev/null 2>&1; then
  echo "✓ role 존재 — trust policy 갱신"
  aws iam update-assume-role-policy \
    --role-name "$ROLE_NAME" \
    --policy-document "$TRUST_POLICY"
else
  echo "role 생성 중…"
  aws iam create-role \
    --role-name "$ROLE_NAME" \
    --assume-role-policy-document "$TRUST_POLICY" \
    --description "GitHub Actions OIDC deploy role for sikchung (repo:${OWNER}/${REPO} main only)" \
    >/dev/null
  echo "✓ role 생성됨: $ROLE_NAME"
fi

# ── 3. 권한 정책 (인라인, put-role-policy 덮어쓰기 멱등) ─────────────────────
# sam deploy(sikchung 스택)에 필요한 범위. 리소스 prefix로 최소권한 지향.
PERMISSION_POLICY=$(jq -n \
  --arg account "$ACCOUNT_ID" \
  --arg region "$AWS_REGION" \
  --arg ecrRepo "$ECR_REPO" \
  --arg stack "$STACK_NAME" \
  '{
    Version: "2012-10-17",
    Statement: [
      {
        Sid: "CloudFormationStack",
        Effect: "Allow",
        Action: "cloudformation:*",
        Resource: [
          "arn:aws:cloudformation:\($region):\($account):stack/\($stack)/*",
          "arn:aws:cloudformation:\($region):\($account):stack/aws-sam-cli-managed-default/*"
        ]
      },
      {
        Sid: "CloudFormationTransform",
        Effect: "Allow",
        Action: "cloudformation:CreateChangeSet",
        Resource: "arn:aws:cloudformation:\($region):aws:transform/Serverless-2016-10-31"
      },
      {
        Sid: "SamArtifactAndFrontendBuckets",
        Effect: "Allow",
        Action: "s3:*",
        Resource: [
          "arn:aws:s3:::aws-sam-cli-managed-default*",
          "arn:aws:s3:::sikchung-frontend-\($account)",
          "arn:aws:s3:::sikchung-frontend-\($account)/*"
        ]
      },
      {
        Sid: "EcrAuth",
        Effect: "Allow",
        Action: "ecr:GetAuthorizationToken",
        Resource: "*"
      },
      {
        Sid: "EcrRepoScoped",
        Effect: "Allow",
        Action: [
          "ecr:CreateRepository",
          "ecr:DeleteRepository",
          "ecr:DescribeRepositories",
          "ecr:DescribeImages",
          "ecr:BatchGetImage",
          "ecr:BatchDeleteImage",
          "ecr:BatchCheckLayerAvailability",
          "ecr:GetDownloadUrlForLayer",
          "ecr:InitiateLayerUpload",
          "ecr:UploadLayerPart",
          "ecr:CompleteLayerUpload",
          "ecr:PutImage",
          "ecr:PutLifecyclePolicy",
          "ecr:GetLifecyclePolicy",
          "ecr:SetRepositoryPolicy",
          "ecr:GetRepositoryPolicy",
          "ecr:TagResource",
          "ecr:ListTagsForResource"
        ],
        Resource: "arn:aws:ecr:\($region):\($account):repository/\($ecrRepo)*"
      },
      {
        Sid: "LambdaScoped",
        Effect: "Allow",
        Action: "lambda:*",
        Resource: [
          "arn:aws:lambda:\($region):\($account):function:\($stack)-*",
          "arn:aws:lambda:\($region):\($account):event-source-mapping:*"
        ]
      },
      {
        Sid: "ApiGateway",
        Effect: "Allow",
        Action: "apigateway:*",
        Resource: "arn:aws:apigateway:\($region)::*"
      },
      {
        Sid: "Cognito",
        Effect: "Allow",
        Action: "cognito-idp:*",
        Resource: "arn:aws:cognito-idp:\($region):\($account):userpool/*"
      },
      {
        Sid: "CognitoUserPoolCreate",
        Effect: "Allow",
        Action: [
          "cognito-idp:CreateUserPool",
          "cognito-idp:CreateUserPoolDomain",
          "cognito-idp:DescribeUserPoolDomain",
          "cognito-idp:DeleteUserPoolDomain"
        ],
        Resource: "*"
      },
      {
        Sid: "DynamoDb",
        Effect: "Allow",
        Action: "dynamodb:*",
        Resource: [
          "arn:aws:dynamodb:\($region):\($account):table/SikchungData",
          "arn:aws:dynamodb:\($region):\($account):table/SikchungData/*"
        ]
      },
      {
        Sid: "CloudFront",
        Effect: "Allow",
        Action: "cloudfront:*",
        Resource: "*"
      },
      {
        Sid: "IamRolesScoped",
        Effect: "Allow",
        Action: [
          "iam:CreateRole",
          "iam:DeleteRole",
          "iam:GetRole",
          "iam:PassRole",
          "iam:AttachRolePolicy",
          "iam:DetachRolePolicy",
          "iam:PutRolePolicy",
          "iam:DeleteRolePolicy",
          "iam:GetRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:TagRole",
          "iam:UntagRole",
          "iam:UpdateRole"
        ],
        Resource: "arn:aws:iam::\($account):role/\($stack)-*"
      }
    ]
  }')

aws iam put-role-policy \
  --role-name "$ROLE_NAME" \
  --policy-name "sikchung-sam-deploy" \
  --policy-document "$PERMISSION_POLICY"
echo "✓ 권한 정책 적용됨 (inline: sikchung-sam-deploy)"

# ── 4. Role ARN 출력 ──────────────────────────────────────────────────────────
ROLE_ARN="$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)"
echo ""
echo "──────────────────────────────────────────────────────"
echo "완료. GitHub repo variable 에 등록하세요:"
echo "  Name : AWS_DEPLOY_ROLE_ARN"
echo "  Value: $ROLE_ARN"
echo "  (Settings → Secrets and variables → Actions → Variables)"
echo "──────────────────────────────────────────────────────"
