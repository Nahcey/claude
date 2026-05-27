'use strict';
// POST   /user            — 사용자 생성 (admin)
// DELETE /user/{sub}      — 사용자 삭제 (admin)
// PUT    /user/{sub}/role — 역할 변경 leader↔member (admin, admin 역할 변경 불가)
//
// 삭제/역할변경: DynamoDB MEMBER 레코드에 저장된 email로 Cognito username 조회

const {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminDeleteUserCommand,
  AdminAddUserToGroupCommand,
  AdminRemoveUserFromGroupCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const { authorize }                                   = require('../lib/auth');
const { getMember, putMember, deleteMember }          = require('../lib/db');
const {
  ok, created, badRequest, unauthorized, forbidden, notFound, conflict, serverError,
} = require('../lib/response');

const USER_POOL_ID    = process.env.USER_POOL_ID;
const CHANGEABLE_ROLES = ['leader', 'member'];

const cognito = new CognitoIdentityProviderClient({
  region: process.env.AWS_REGION || 'ap-northeast-2',
});

exports.handler = async (event) => {
  try {
    const auth = authorize(event, 'admin');
    if (!auth.ok) {
      return auth.status === 403 ? forbidden(auth.message) : unauthorized(auth.message);
    }

    const method = event.requestContext.http.method;
    const { sub } = event.pathParameters ?? {};

    // ── POST /user ──────────────────────────────────────────────────────────
    if (method === 'POST') {
      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return badRequest('Invalid JSON body');
      }

      const { email, role, displayName, temporaryPassword } = body;
      if (!email)             return badRequest('email is required');
      if (!role)              return badRequest('role is required');
      if (!CHANGEABLE_ROLES.includes(role)) return badRequest('role must be leader or member');
      if (!temporaryPassword) return badRequest('temporaryPassword is required');

      let createdSub;
      try {
        const res = await cognito.send(new AdminCreateUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: email,          // UsernameAttributes=[email] 이므로 email=username
          UserAttributes: [
            { Name: 'email',          Value: email },
            { Name: 'email_verified', Value: 'true' },
            ...(displayName ? [{ Name: 'custom:displayName', Value: displayName }] : []),
          ],
          TemporaryPassword: temporaryPassword,
        }));
        createdSub = res.User.Attributes.find(a => a.Name === 'sub')?.Value;
      } catch (e) {
        if (e.name === 'UsernameExistsException') return conflict('User already exists');
        throw e;
      }

      await cognito.send(new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: email,
        GroupName: role,
      }));

      // PostConfirmation 전이라도 DELETE/role 변경에 email이 필요하므로 즉시 생성
      await putMember(createdSub, {
        email,
        name: displayName || email,
        restricted: Array(12).fill(false),
        double: false,
        rookie: false,
        priority: 0,
      });

      return created({ sub: createdSub, email, role });
    }

    // ── DELETE /user/{sub} ──────────────────────────────────────────────────
    if (method === 'DELETE') {
      if (!sub) return badRequest('sub path parameter is required');

      const member = await getMember(sub);
      if (!member) return notFound('User not found');

      // Cognito 삭제 먼저 시도. 실패하면 DynamoDB는 건드리지 않는다.
      try {
        await cognito.send(new AdminDeleteUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: member.email,
        }));
      } catch (e) {
        if (e.name !== 'UserNotFoundException') throw e;
        // Cognito에 이미 없는 경우 → DynamoDB 정리만 진행
      }

      await deleteMember(sub);
      return ok({ deleted: true, sub });
    }

    // ── PUT /user/{sub}/role ────────────────────────────────────────────────
    if (method === 'PUT') {
      if (!sub) return badRequest('sub path parameter is required');

      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch {
        return badRequest('Invalid JSON body');
      }

      const { role: newRole } = body;
      if (!newRole)                          return badRequest('role is required');
      if (newRole === 'admin')               return badRequest('admin role cannot be assigned via this API');
      if (!CHANGEABLE_ROLES.includes(newRole)) return badRequest('role must be leader or member');

      const member = await getMember(sub);
      if (!member) return notFound('User not found');

      // 기존 leader/member 그룹 제거 (없어도 무시)
      for (const group of CHANGEABLE_ROLES) {
        try {
          await cognito.send(new AdminRemoveUserFromGroupCommand({
            UserPoolId: USER_POOL_ID,
            Username: member.email,
            GroupName: group,
          }));
        } catch (_) { /* 해당 그룹에 없으면 무시 */ }
      }

      await cognito.send(new AdminAddUserToGroupCommand({
        UserPoolId: USER_POOL_ID,
        Username: member.email,
        GroupName: newRole,
      }));

      return ok({ sub, role: newRole });
    }

    return badRequest('Method not allowed');
  } catch (err) {
    console.error('[admin] unhandled error:', err);
    return serverError('Unexpected error');
  }
};
