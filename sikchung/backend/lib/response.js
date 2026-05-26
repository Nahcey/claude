'use strict';

// TODO(5단계): AllowOrigin을 CloudFront 배포 도메인으로 제한
//              예: 'https://d1234abcd.cloudfront.net'
const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
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
const serverError  = (msg = 'Internal server error') => res(500, { error: msg });

module.exports = { ok, created, badRequest, unauthorized, forbidden, notFound, serverError };
