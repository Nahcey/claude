'use strict';
// GET /me  — 본인 정보 조회 (member 이상)
// PUT /me  — 본인 정보 수정
//   허용 필드: name, restricted[], double, rookie
//   priority: leader/admin만 수정 가능, member는 조용히 무시

const { authorize }                                  = require('../lib/auth');
const { getMember, putMember }                       = require('../lib/db');
const { ok, badRequest, unauthorized, forbidden, serverError } = require('../lib/response');

exports.handler = async (event) => {
  try {
    const auth = authorize(event, 'member');
    if (!auth.ok) {
      return auth.status === 403 ? forbidden(auth.message) : unauthorized(auth.message);
    }
    const { userSub, role } = auth;

    const method = event.requestContext.http.method;

    // ── GET /me ─────────────────────────────────────────────────────────────
    if (method === 'GET') {
      const item = await getMember(userSub);
      if (!item) {
        // PostConfirmation 트리거 이전에 호출된 경우 기본값 반환
        return ok({ name: '', restricted: [], double: false, rookie: false, priority: 0 });
      }
      const { PK, SK, ...data } = item;
      return ok(data);
    }

    // ── PUT /me ─────────────────────────────────────────────────────────────
    if (method === 'PUT') {
      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return badRequest('Invalid JSON body');
      }

      const update = {};

      if ('name' in body) {
        if (typeof body.name !== 'string') return badRequest('name must be a string');
        update.name = body.name.trim();
      }

      if ('restricted' in body) {
        if (!Array.isArray(body.restricted)) return badRequest('restricted must be an array');
        if (body.restricted.length > 12)     return badRequest('restricted max length is 12');
        update.restricted = body.restricted;
      }

      if ('double' in body) {
        if (typeof body.double !== 'boolean') return badRequest('double must be boolean');
        update.double = body.double;
      }

      if ('rookie' in body) {
        if (typeof body.rookie !== 'boolean') return badRequest('rookie must be boolean');
        update.rookie = body.rookie;
      }

      if ('priority' in body) {
        if (role !== 'member') {
          if (typeof body.priority !== 'number') return badRequest('priority must be a number');
          update.priority = body.priority;
        }
        // member는 priority 필드를 조용히 무시한다
      }

      const existing = (await getMember(userSub)) ?? {};
      const saved    = await putMember(userSub, { ...existing, ...update });
      const { PK, SK, ...result } = saved;
      return ok(result);
    }

    return badRequest('Method not allowed');
  } catch (err) {
    console.error('[me] unhandled error:', err);
    return serverError('Unexpected error');
  }
};
