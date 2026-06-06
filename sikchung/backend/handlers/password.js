'use strict';
// PUT /me/password — 본인 비밀번호 변경 (member 이상)
// API Gateway JWT 인증이 이미 완료된 상태에서 새 비밀번호를 영구 설정한다.

const {
  CognitoIdentityProviderClient,
  AdminSetUserPasswordCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const { authorize }   = require('../lib/auth');
const { ok, badRequest, unauthorized, forbidden, serverError } = require('../lib/response');

const USER_POOL_ID = process.env.USER_POOL_ID;

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'ap-northeast-2',
});

function validatePassword(pw) {
  if (!pw || pw.length < 8)      return '8자 이상이어야 합니다.';
  if (!/[A-Z]/.test(pw))         return '대문자를 포함해야 합니다.';
  if (!/[a-z]/.test(pw))         return '소문자를 포함해야 합니다.';
  if (!/[0-9]/.test(pw))         return '숫자를 포함해야 합니다.';
  if (!/[^A-Za-z0-9]/.test(pw))  return '특수문자를 포함해야 합니다.';
  return null;
}

exports.handler = async (event) => {
  try {
    const method = event.requestContext.http.method;
    if (method === 'OPTIONS') return ok({});

    const auth = authorize(event, 'member');
    if (!auth.ok) {
      return auth.status === 403 ? forbidden(auth.message) : unauthorized(auth.message);
    }

    if (method !== 'PUT') return badRequest('Method not allowed');

    let body;
    try { body = JSON.parse(event.body || '{}'); } catch { return badRequest('Invalid JSON'); }

    const { proposedPassword } = body;
    if (!proposedPassword) return badRequest('proposedPassword가 필요합니다.');

    const pwErr = validatePassword(proposedPassword);
    if (pwErr) return badRequest(pwErr);

    const claims   = event.requestContext.authorizer.jwt.claims;
    const username = claims['cognito:username'] || claims.sub;

    await cognito.send(new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username:   username,
      Password:   proposedPassword,
      Permanent:  true,
    }));

    return ok({ message: '비밀번호가 변경되었습니다.' });
  } catch (err) {
    console.error('[password] unhandled error:', err);
    return serverError('Unexpected error');
  }
};
