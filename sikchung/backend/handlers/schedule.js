'use strict';

/**
 * POST /schedule          — 주간 일정 생성 (leader/admin)
 * GET  /schedule/latest   — 최신 일정 조회 (모든 인증 사용자)
 *
 * DynamoDB SK 형식: yyyy-ww (예: 2025-21)
 */

// TODO: import { authorize } from '../lib/auth.js'
// TODO: import { queryItems, putItem } from '../lib/db.js'

exports.handler = async (event) => {
  // TODO: route by event.requestContext.http.method
  // TODO: POST → authorize(event, 'leader')
  //              body에 scheduleData(JSON) 포함
  //              SK = 현재 주차 (yyyy-ww) 계산
  //              db.putItem({ PK: 'SCHEDULE', SK: weekId, scheduleData, generatedBy: sub, generatedAt })
  // TODO: GET  → authorize(event, 'member')
  //              db.queryItems({ PK: 'SCHEDULE' })에서 SK 내림차순 첫 번째 항목 반환
  throw new Error('Not implemented');
};
