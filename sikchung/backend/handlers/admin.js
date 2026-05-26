'use strict';
// POST   /user            — 사용자 초대 생성 (admin)
// DELETE /user/{sub}      — 사용자 삭제 (admin)
// PUT    /user/{sub}/role — 역할 변경: admin→leader→member (admin)
//
// env: USER_POOL_ID, TABLE_NAME

// TODO: const { authorize } = require('../lib/auth');
// TODO: const { deleteItem } = require('../lib/db');
// TODO: const { ok, badRequest, notFound } = require('../lib/response');
// TODO: const { CognitoIdentityProviderClient,
//               AdminCreateUserCommand,
//               AdminDeleteUserCommand,
//               AdminAddUserToGroupCommand,
//               AdminRemoveUserFromGroupCommand,
//               AdminListGroupsForUserCommand } = require('@aws-sdk/client-cognito-identity-provider');

const USER_POOL_ID = process.env.USER_POOL_ID;
// TODO: const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION });

exports.handler = async (event) => {
  // TODO: authorize(event, 'admin');
  // TODO: const method = event.requestContext.http.method;
  // TODO: const { sub } = event.pathParameters || {};
  //
  // TODO: POST   /user            → AdminCreateUser, body: { email, role }
  // TODO: DELETE /user/{sub}      → AdminDeleteUser + deleteItem('MEMBER', sub)
  // TODO: PUT    /user/{sub}/role → AdminListGroupsForUser → AdminRemoveUserFromGroup
  //                                 → AdminAddUserToGroup(body.role)
  throw new Error('Not implemented');
};
