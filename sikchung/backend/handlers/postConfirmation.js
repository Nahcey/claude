'use strict';
// Cognito PostConfirmation 트리거
// 이메일 인증 완료 시 DynamoDB에 기본 MEMBER 레코드를 생성한다.
//
// event.request.userAttributes.sub   → cognito sub (= DynamoDB SK)
// event.request.userAttributes.email → 이메일
// 반환값: event 그대로 (Cognito 트리거 규약)

// TODO: const { putItem } = require('../lib/db');

exports.handler = async (event) => {
  // TODO: const { sub, email } = event.request.userAttributes;
  // TODO: await putItem({
  //         PK: 'MEMBER',
  //         SK: sub,
  //         email,
  //         name: '',
  //         restricted: [],
  //         double: false,
  //         rookie: false,
  //         priority: 0,
  //         updatedAt: new Date().toISOString(),
  //       });
  return event; // Cognito에 event를 그대로 돌려줘야 함
};
