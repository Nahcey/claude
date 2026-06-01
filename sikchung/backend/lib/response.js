'use strict';

const HEADERS = {
  'Content-Type': 'application/json',
};

const res = (statusCode, body) => ({
  statusCode,
  headers: HEADERS,
  body: JSON.stringify(body),
});

const ok           = (body)              => res(200, body);
const created      = (body)              => res(201, body);
const badRequest   = (msg)               => res(400, { error: msg });
const unauthorized = (msg = 'Unauthorized') => res(401, { error: msg });
const forbidden    = (msg = 'Forbidden') => res(403, { error: msg });
const notFound     = (msg = 'Not found') => res(404, { error: msg });
const conflict     = (msg = 'Conflict')  => res(409, { error: msg });
const serverError  = (msg = 'Internal server error') => res(500, { error: msg });

module.exports = { ok, created, badRequest, unauthorized, forbidden, notFound, conflict, serverError };
