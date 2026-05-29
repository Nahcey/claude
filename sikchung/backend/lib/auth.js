'use strict';
const HIERARCHY = ['member', 'leader', 'admin'];

function authorize(event, requiredRole) {
  const claims = event?.requestContext?.authorizer?.jwt?.claims;
  if (!claims?.sub) {
    return { ok: false, status: 401, message: 'Missing authorization claims' };
  }
  const userSub = claims.sub;
  const email = claims.email || '';
  const groupsRaw = claims['cognito:groups'];
  let groups = [];
  if (Array.isArray(groupsRaw)) {
    groups = groupsRaw;
  } else if (typeof groupsRaw === 'string' && groupsRaw) {
    const trimmed = groupsRaw.trim();
    if (trimmed.startsWith('[')) {
      // "[admin]" 또는 "[admin,leader]" 형태 파싱
      groups = trimmed.slice(1, -1).split(',').map(g => g.trim().replace(/^"|"$/g, ''));
    } else {
      groups = trimmed.split(',').map(g => g.trim());
    }
  }
  const role = [...HIERARCHY].reverse().find(r => groups.includes(r)) || 'member';
  if (HIERARCHY.indexOf(role) < HIERARCHY.indexOf(requiredRole)) {
    return { ok: false, status: 403, message: 'Forbidden' };
  }
  return { ok: true, userSub, role, email };
}

module.exports = { authorize };
