'use strict';

/**
 * GET /members         — 전체 인원 조회 (leader/admin)
 * PUT /member/{sub}    — 특정 인원 수정 (leader/admin)
 */

// TODO: import { authorize } from '../lib/auth.js'
// TODO: import { queryItems, putItem } from '../lib/db.js'

exports.handler = async (event) => {
  // TODO: authorize(event, 'leader')
  // TODO: route by event.requestContext.http.method
  // TODO: GET → db.queryItems({ PK: 'MEMBER' }) — 전체 스캔 또는 Query
  // TODO: PUT → validate body, db.putItem({ PK: 'MEMBER', SK: sub, ...body })
  throw new Error('Not implemented');
};
