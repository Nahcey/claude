'use strict';

/**
 * Cognito Post Confirmation 트리거
 * 사용자가 이메일 인증을 완료하면 DynamoDB에 기본 MEMBER 레코드를 생성한다.
 *
 * event.userName  = Cognito username (= sub)
 * event.request.userAttributes.sub = cognito sub
 * event.request.userAttributes.email = 이메일
 */

// TODO: import { putItem } from '../lib/db.js'

exports.handler = async (event) => {
  // TODO: const sub = event.request.userAttributes.sub
  // TODO: const email = event.request.userAttributes.email
  // TODO: db.putItem({
  //         PK: 'MEMBER',
  //         SK: sub,
  //         email,
  //         name: '',        // 추후 수정
  //         restricted: [],
  //         double: false,
  //         rookie: false,
  //         priority: 0,
  //         updatedAt: new Date().toISOString(),
  //       })
  // Cognito 트리거는 event를 그대로 반환해야 한다
  return event;
};
