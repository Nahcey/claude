'use strict';
// GET /members       — 전체 인원 조회 (leader, admin)
// PUT /member/{sub}  — 특정 인원 정보 수정 (leader, admin)
//
// leader/admin이므로 priority 수정도 허용

const { authorize }                                  = require('../lib/auth');
const { getMember, putMember, listMembers }          = require('../lib/db');
const { ok, badRequest, notFound, unauthorized, forbidden, serverError } = require('../lib/response');

exports.handler = async (event) => {
  try {
    const method = event.requestContext.http.method;
    if (method === 'OPTIONS') return ok({});

    const auth = authorize(event, 'leader');
    if (!auth.ok) {
      return auth.status === 403 ? forbidden(auth.message) : unauthorized(auth.message);
    }

    // ── GET /members ─────────────────────────────────────────────────────────
    if (method === 'GET') {
      const items = await listMembers();
      return ok(items.map(({ PK, SK, ...data }) => ({ sub: SK, ...data })));
    }

    // ── PUT /member/{sub} ────────────────────────────────────────────────────
    if (method === 'PUT') {
      const { sub } = event.pathParameters ?? {};
      if (!sub) return badRequest('sub path parameter is required');

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
        if (!Array.isArray(body.restricted))  return badRequest('restricted must be an array');
        if (body.restricted.length > 12)      return badRequest('restricted max length is 12');
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
        if (typeof body.priority !== 'number') return badRequest('priority must be a number');
        update.priority = body.priority;      // leader/admin이므로 무조건 허용
      }

      const existing = await getMember(sub);
      if (!existing) return notFound('Member not found');

      const saved = await putMember(sub, { ...existing, ...update });
      const { PK, SK, ...result } = saved;
      return ok({ sub, ...result });
    }

    return badRequest('Method not allowed');
  } catch (err) {
    console.error('[members] unhandled error:', err);
    return serverError('Unexpected error');
  }
};
