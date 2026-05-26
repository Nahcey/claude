'use strict';

/**
 * HTTP API JWT Authorizer를 통과한 이후의 세컨더리 권한 확인.
 * Cognito Group 기반으로 역할을 검증한다.
 *
 * 역할 계층: admin > leader > member
 */

const ROLE_HIERARCHY = ['member', 'leader', 'admin'];

/**
 * @param {object} event - Lambda HTTP API event
 * @param {string} requiredRole - 최소 요구 역할 ('member' | 'leader' | 'admin')
 * @returns {{ sub: string, role: string }} 검증된 사용자 정보
 * @throws 403 Forbidden if insufficient role
 */
// TODO: function authorize(event, requiredRole) {
//   const claims = event.requestContext.authorizer.jwt.claims
//   const sub = claims.sub
//   const groups = (claims['cognito:groups'] || '').split(',')
//   const role = ROLE_HIERARCHY.filter(r => groups.includes(r)).pop() || 'member'
//   if (ROLE_HIERARCHY.indexOf(role) < ROLE_HIERARCHY.indexOf(requiredRole)) {
//     throw { statusCode: 403, message: 'Forbidden' }
//   }
//   return { sub, role }
// }

// TODO: module.exports = { authorize }
