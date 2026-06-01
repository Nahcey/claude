'use strict';
// GET /audit — 감사 로그 조회 (admin 전용)
//   쿼리: limit(기본 50, 최대 100), cursor(페이지네이션용 SK, optional)
//   응답: { items: [{ timestamp, action, actorSub, actorRole, targetSub?, detail, ip? }], nextCursor }

const { authorize }                                            = require('../lib/auth');
const { listAuditLogs }                                        = require('../lib/db');
const { ok, unauthorized, forbidden, serverError }             = require('../lib/response');

exports.handler = async (event) => {
  try {
    const method = event.requestContext.http.method;
    if (method === 'OPTIONS') return ok({});

    const auth = authorize(event, 'admin');
    if (!auth.ok) {
      return auth.status === 403 ? forbidden(auth.message) : unauthorized(auth.message);
    }

    const qs = event.queryStringParameters || {};
    let limit = parseInt(qs.limit, 10);
    if (!Number.isFinite(limit) || limit <= 0) limit = 50;
    if (limit > 100) limit = 100;
    const before = qs.cursor || null;

    const { items, nextCursor } = await listAuditLogs({ limit, before });
    // PK/SK는 응답에서 제외
    const cleaned = items.map(({ PK, SK, ...rest }) => rest);
    return ok({ items: cleaned, nextCursor });
  } catch (err) {
    console.error('[auditLog] unhandled error:', err);
    return serverError('Unexpected error');
  }
};
