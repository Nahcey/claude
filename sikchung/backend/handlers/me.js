'use strict';
// GET /me  — 본인 정보 조회 (member 이상)
// PUT /me  — 본인 정보 수정: name, restricted[], double, rookie

// TODO: const { authorize } = require('../lib/auth');
// TODO: const { getItem, putItem } = require('../lib/db');
// TODO: const { ok, badRequest } = require('../lib/response');

exports.handler = async (event) => {
  // TODO: const { sub } = authorize(event, 'member');
  // TODO: const method = event.requestContext.http.method;
  // TODO: if (method === 'GET') {
  //         const item = await getItem('MEMBER', sub);
  //         return ok(item);
  //       }
  // TODO: if (method === 'PUT') {
  //         const body = JSON.parse(event.body || '{}');
  //         // validate: name(string), restricted(array), double(bool), rookie(bool)
  //         await putItem({ PK: 'MEMBER', SK: sub, ...body, updatedAt: new Date().toISOString() });
  //         return ok({ updated: true });
  //       }
  throw new Error('Not implemented');
};
