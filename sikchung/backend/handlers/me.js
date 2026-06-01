'use strict';
// GET /me  — 본인 정보 조회 (member 이상)
// PUT /me  — 본인 정보 수정
//   허용 필드: name, restricted[], double, rookie
//   priority: leader/admin만 수정 가능, member는 조용히 무시

const { authorize }                                  = require('../lib/auth');
const { getMember, putMember, updateMember }          = require('../lib/db');
const { ok, badRequest, unauthorized, forbidden, serverError } = require('../lib/response');
const { validateRestricted }                         = require('../lib/validate');

exports.handler = async (event) => {
  try {
    const method = event.requestContext.http.method;
    if (method === 'OPTIONS') return ok({});

    const auth = authorize(event, 'member');
    if (!auth.ok) {
      return auth.status === 403 ? forbidden(auth.message) : unauthorized(auth.message);
    }
    const { userSub, role } = auth;

    // ── GET /me ─────────────────────────────────────────────────────────────
    if (method === 'GET') {
      const claims      = event.requestContext.authorizer.jwt.claims;
      const displayName = claims['custom:displayName'] || claims['cognito:username'] || claims.sub;

      const item = await getMember(userSub);
      if (!item) {
        return ok({ name: '', restricted: [], double: false, rookie: false, priority: 0, role, displayName });
      }
      const { PK, SK, ...data } = item;
      return ok({ ...data, role, displayName });
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
        const err = validateRestricted(body.restricted);
        if (err) return badRequest(err);
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

      const existing = await getMember(userSub);
      const saved = existing
        ? await updateMember(userSub, update)
        : await putMember(userSub, update);
      const { PK, SK, ...result } = saved;
      return ok(result);
    }

    return badRequest('Method not allowed');
  } catch (err) {
    console.error('[me] unhandled error:', err);
    return serverError('Unexpected error');
  }
};
