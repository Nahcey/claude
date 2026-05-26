'use strict';

/**
 * POST   /user              — 사용자 생성 (admin)
 * DELETE /user/{sub}        — 사용자 삭제 (admin)
 * PUT    /user/{sub}/role   — 역할 변경 (admin) → Cognito Group 이동
 *
 * env: USER_POOL_ID, TABLE_NAME
 */

// TODO: import { authorize } from '../lib/auth.js'
// TODO: import { CognitoIdentityProviderClient, ... } from '@aws-sdk/client-cognito-identity-provider'
// TODO: import { deleteItem } from '../lib/db.js'

exports.handler = async (event) => {
  // TODO: authorize(event, 'admin')
  // TODO: route by event.requestContext.http.method + event.pathParameters
  // TODO: POST   → AdminCreateUser → Cognito, 그룹 지정
  // TODO: DELETE → AdminDeleteUser → Cognito + DynamoDB 항목 삭제
  // TODO: PUT    → AdminRemoveUserFromGroup(현재 그룹) + AdminAddUserToGroup(새 그룹)
  throw new Error('Not implemented');
};
