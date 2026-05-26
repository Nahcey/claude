'use strict';

/**
 * GET /me  — 본인 정보 조회
 * PUT /me  — 본인 정보 수정 (name, restricted[], double, rookie)
 *
 * JWT claims: event.requestContext.authorizer.jwt.claims
 *   sub  → DynamoDB SK
 *   cognito:groups → 역할 확인
 */

// TODO: import { authorize } from '../lib/auth.js'
// TODO: import { getItem, putItem } from '../lib/db.js'

exports.handler = async (event) => {
  // TODO: const { sub } = authorize(event, 'member')
  // TODO: route by event.requestContext.http.method
  // TODO: GET → db.getItem({ PK: 'MEMBER', SK: sub })
  // TODO: PUT → validate body, db.putItem with updatedAt
  throw new Error('Not implemented');
};
