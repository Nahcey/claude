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

  // API Gateway는 JWT 배열 클레임을 쉼표 구분 문자열로 변환한다.
  // 예: ["admin","member"] → "admin,member"
  const groupsRaw = claims['cognito:groups'] || '';
  const groups    = groupsRaw ? groupsRaw.split(',').map(g => g.trim()) : [];

  // 계층에서 가장 높은 역할을 선택한다.
  const role = [...HIERARCHY].reverse().find(r => groups.includes(r)) || 'member';

  if (HIERARCHY.indexOf(role) < HIERARCHY.indexOf(requiredRole)) {
    return { ok: false, status: 403, message: 'Forbidden' };
  }

  return { ok: true, userSub, role, email };
}

module.exports = { authorize };
