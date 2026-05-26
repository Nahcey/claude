'use strict';
// HTTP API JWT Authorizer 통과 후 세컨더리 역할 검증
// Cognito Group: admin > leader > member

const HIERARCHY = ['member', 'leader', 'admin'];

/**
 * @param {object} event  - Lambda HTTP API event
 * @param {'member'|'leader'|'admin'} requiredRole
 * @returns {{ sub: string, role: string }}
 */
// TODO: function authorize(event, requiredRole) {
//   const claims = event.requestContext.authorizer.jwt.claims;
//   const sub    = claims.sub;
//   const groups = String(claims['cognito:groups'] || '').split(',');
//   const role   = HIERARCHY.filter(r => groups.includes(r)).pop() || 'member';
//   if (HIERARCHY.indexOf(role) < HIERARCHY.indexOf(requiredRole)) {
//     const err = new Error('Forbidden');
//     err.statusCode = 403;
//     throw err;
//   }
//   return { sub, role };
// }

// TODO: module.exports = { authorize };
module.exports = {};
