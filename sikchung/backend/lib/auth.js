'use strict';
// HTTP API v2 JWT 클레임 기반 역할 검증
// API Gateway가 이미 서명을 검증했으므로 여기선 역할만 확인한다.

const HIERARCHY = ['member', 'leader', 'admin']; // 낮음 → 높음

/**
 * JWT 클레임에서 역할을 추출하고 requiredRole 이상인지 확인한다.
 *
 * @param {object} event         - Lambda HTTP API v2 event
 * @param {'member'|'leader'|'admin'} requiredRole
 * @returns {{ ok: true,  userSub: string, role: string, email: string }}
 *        | {{ ok: false, status: 401|403, message: string }}
 */
function authorize(event, requiredRole) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims?.sub) {
    return { ok: false, status: 401, message: 'Missing authorization claims' };
  }

  const userSub = claims.sub;
  const email   = claims.email || '';

  // API Gateway HTTP API는 배열 클레임을 쉼표 구분 문자열로 변환하기도 하고
  // 누락시키기도 하므로 배열·문자열·undefined 세 경우를 모두 처리한다.
  const groupsRaw = claims['cognito:groups'];
  let groups = [];
  if (Array.isArray(groupsRaw)) {
    groups = groupsRaw;
  } else if (typeof groupsRaw === 'string' && groupsRaw) {
    groups = groupsRaw.split(',').map(g => g.trim());
  }

  // 계층에서 가장 높은 역할을 선택한다.
  const role = [...HIERARCHY].reverse().find(r => groups.includes(r)) || 'member';

  console.log('[auth] claims keys:', Object.keys(claims || {}));
  console.log('[auth] cognito:groups raw:', JSON.stringify(groupsRaw));
  console.log('[auth] resolved role:', role);

  if (HIERARCHY.indexOf(role) < HIERARCHY.indexOf(requiredRole)) {
    return { ok: false, status: 403, message: 'Forbidden' };
  }

  return { ok: true, userSub, role, email };
}

module.exports = { authorize };
