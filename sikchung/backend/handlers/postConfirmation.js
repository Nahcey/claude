'use strict';
// Cognito PostConfirmation 트리거
// 이메일 인증 완료 시 DynamoDB에 MEMBER 기본값 레코드를 생성한다.
// POST /user로 생성된 사용자도 비밀번호 변경 완료 시 이 트리거가 실행된다.
// 에러가 나도 가입 흐름을 막지 않도록 try-catch로 감싼다.

const { putMember } = require('../lib/db');

exports.handler = async (event) => {
  try {
    const attrs = event.request.userAttributes;
    const sub   = attrs.sub;
    const email = attrs.email;
    // custom:displayName이 있으면 사용, 없으면 email을 이름으로 사용
    const name  = attrs['custom:displayName'] || email;

    await putMember(sub, {
      email,
      name,
      restricted: Array(12).fill(false),
      double:     false,
      rookie:     false,
      priority:   0,
    });
  } catch (err) {
    console.error('[postConfirmation] DynamoDB write failed:', err);
    // 에러를 throw하지 않아야 가입 흐름이 차단되지 않는다
  }

  return event; // Cognito 트리거 규약: event 그대로 반환
};
