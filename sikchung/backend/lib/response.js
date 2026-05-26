'use strict';
// Lambda HTTP API 응답 헬퍼
// Content-Type은 항상 application/json

const HEADERS = { 'Content-Type': 'application/json' };

// TODO: const ok         = (body)    => ({ statusCode: 200, headers: HEADERS, body: JSON.stringify(body) });
// TODO: const created    = (body)    => ({ statusCode: 201, headers: HEADERS, body: JSON.stringify(body) });
// TODO: const badRequest = (msg)     => ({ statusCode: 400, headers: HEADERS, body: JSON.stringify({ error: msg }) });
// TODO: const forbidden  = ()        => ({ statusCode: 403, headers: HEADERS, body: JSON.stringify({ error: 'Forbidden' }) });
// TODO: const notFound   = ()        => ({ statusCode: 404, headers: HEADERS, body: JSON.stringify({ error: 'Not found' }) });
// TODO: const serverError = (msg)    => ({ statusCode: 500, headers: HEADERS, body: JSON.stringify({ error: msg }) });

// TODO: module.exports = { ok, created, badRequest, forbidden, notFound, serverError };
module.exports = {};
