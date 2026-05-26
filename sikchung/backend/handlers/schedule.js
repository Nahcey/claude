'use strict';
// POST /schedule         — 주간 일정 생성 (leader 이상)
// GET  /schedule/latest  — 최신 일정 조회 (member 이상)
//
// SK 형식: yyyy-ww (ISO 주차, 예: 2025-21)

// TODO: const { authorize } = require('../lib/auth');
// TODO: const { queryByPK, putItem } = require('../lib/db');
// TODO: const { ok, badRequest } = require('../lib/response');

// TODO: function currentWeekId() — date-fns 없이 순수 JS로 ISO 주차 계산

exports.handler = async (event) => {
  // TODO: const method = event.requestContext.http.method;
  // TODO: if (method === 'POST') {
  //         const { sub } = authorize(event, 'leader');
  //         const body = JSON.parse(event.body || '{}');
  //         const weekId = currentWeekId();
  //         await putItem({
  //           PK: 'SCHEDULE', SK: weekId,
  //           scheduleData: body.scheduleData,
  //           generatedBy: sub,
  //           generatedAt: new Date().toISOString(),
  //         });
  //         return ok({ weekId });
  //       }
  // TODO: if (method === 'GET') {
  //         authorize(event, 'member');
  //         const items = await queryByPK('SCHEDULE');  // SK 내림차순
  //         return ok(items[0] ?? null);
  //       }
  throw new Error('Not implemented');
};
