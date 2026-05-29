'use strict';
// Cognito PostConfirmation 트리거 (username 기반 풀)
// 가입 확정 시 DynamoDB에 MEMBER 기본값 레코드를 생성한다.
// 대부분의 계정은 스크립트(create_cognito_user)가 레코드를 미리 만들지만,
// 트리거가 발화하는 경우를 대비한 안전장치. 에러가 나도 흐름을 막지 않는다.

const { getMember, putMember } = require('../lib/db');

exports.handler = async (event) => {
  try {
    const attrs    = event.request.userAttributes || {};
    const sub      = attrs.sub;
    const username = event.userName || attrs['cognito:username'] || sub;
    const name     = attrs['custom:displayName'] || username;

    // 스크립트가 이미 레코드를 만든 경우 덮어쓰지 않는다
    const existing = await getMember(sub);
    if (!existing) {
      await putMember(sub, {
        username,
        name,
        restricted: Array(12).fill(false),
        double:     false,
        rookie:     false,
        priority:   0,
      });
    }
  } catch (err) {
    console.error('[postConfirmation] DynamoDB write failed:', err);
    // 에러를 throw하지 않아야 가입 흐름이 차단되지 않는다
  }

  return event; // Cognito 트리거 규약: event 그대로 반환
};
