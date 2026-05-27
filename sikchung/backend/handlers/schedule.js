'use strict';
// POST /schedule         — 일정 저장 (leader, admin)
// GET  /schedule/latest  — 최신 일정 조회 (모든 인증 사용자)
//
// SK 형식: yyyy-ww (예: 2025-21)

const { authorize }                             = require('../lib/auth');
const { putSchedule, getLatestSchedule }        = require('../lib/db');
const { ok, badRequest, unauthorized, forbidden, serverError } = require('../lib/response');

const WEEK_ID_RE = /^\d{4}-\d{2}$/;

exports.handler = async (event) => {
  try {
    const method = event.requestContext.http.method;

    // ── POST /schedule ────────────────────────────────────────────────────────
    if (method === 'POST') {
      const auth = authorize(event, 'leader');
      if (!auth.ok) {
        return auth.status === 403 ? forbidden(auth.message) : unauthorized(auth.message);
      }
      const { userSub, email } = auth;

      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return badRequest('Invalid JSON body');
      }

      const { weekId, scheduleData } = body;
      if (!weekId)                  return badRequest('weekId is required');
      if (!WEEK_ID_RE.test(weekId)) return badRequest('weekId must match yyyy-ww (e.g. 2025-21)');
      if (scheduleData === undefined) return badRequest('scheduleData is required');

      const saved = await putSchedule(weekId, {
        scheduleData,
        generatedBy:      userSub,
        generatedByEmail: email,
      });
      const { PK, SK, ...result } = saved;
      return ok({ weekId: SK, ...result });
    }

    // ── GET /schedule/latest ──────────────────────────────────────────────────
    if (method === 'GET') {
      const auth = authorize(event, 'member');
      if (!auth.ok) {
        return auth.status === 403 ? forbidden(auth.message) : unauthorized(auth.message);
      }

      const item = await getLatestSchedule();
      if (!item) return ok(null);

      const { PK, SK, ...data } = item;
      return ok({ weekId: SK, ...data });
    }

    return badRequest('Method not allowed');
  } catch (err) {
    console.error('[schedule] unhandled error:', err);
    return serverError('Unexpected error');
  }
};
