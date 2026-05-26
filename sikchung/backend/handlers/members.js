'use strict';
// GET /members         — 전체 인원 목록 (leader 이상)
// PUT /member/{sub}    — 특정 인원 정보 수정 (leader 이상)

// TODO: const { authorize } = require('../lib/auth');
// TODO: const { queryByPK, putItem } = require('../lib/db');
// TODO: const { ok, badRequest, notFound } = require('../lib/response');

exports.handler = async (event) => {
  // TODO: authorize(event, 'leader');
  // TODO: const method = event.requestContext.http.method;
  // TODO: if (method === 'GET') {
  //         const items = await queryByPK('MEMBER');
  //         return ok(items);
  //       }
  // TODO: if (method === 'PUT') {
  //         const { sub } = event.pathParameters;
  //         const body = JSON.parse(event.body || '{}');
  //         await putItem({ PK: 'MEMBER', SK: sub, ...body, updatedAt: new Date().toISOString() });
  //         return ok({ updated: true });
  //       }
  throw new Error('Not implemented');
};
