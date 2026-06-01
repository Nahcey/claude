'use strict';
// 감사 로그 기록기 — fire-and-forget. 감사 실패가 본 응답을 막아서는 안 된다.
//
//   writeAudit(event, auth, action, detail)   // await 없이 호출할 것
//
// "누가 언제 무엇을 했는가"를 공유 테이블의 AUDIT 파티션에 적재한다.

const crypto = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand } = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.TABLE_NAME;

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' }),
);

/**
 * 감사 로그를 기록한다. **fire-and-forget — await 하지 말 것.**
 * 실패해도 본 요청 응답을 막지 않으며 에러는 console.error 로만 남긴다.
 *
 * @param {object}  event    Lambda 이벤트 (sourceIp 추출용)
 * @param {object}  auth     authorize() 결과 ({ userSub, role })
 * @param {string}  action   액션 코드 (예: 'SCHEDULE_SAVE')
 * @param {object} [detail]  액션별 추가 정보 (대용량 데이터 금지)
 * @returns {Promise<void>}
 *
 * @example
 *   // 핸들러 성공 응답 직전:
 *   writeAudit(event, auth, 'MEMBER_UPDATE', { targetSub: sub, changedFields: Object.keys(update) });
 *   return ok(result);
 */
async function writeAudit(event, auth, action, detail) {
  try {
    const timestamp = new Date().toISOString();
    const sk        = timestamp + '#' + crypto.randomBytes(3).toString('hex');

    const item = {
      PK:        'AUDIT',
      SK:        sk,
      timestamp,
      action,
      actorSub:  auth?.userSub ?? null,
      actorRole: auth?.role ?? null,
      detail:    detail ?? {},
    };
    // targetSub: 스키마상 최상위 필드로도 노출 (detail 안에도 함께 존재)
    if (detail && detail.targetSub) item.targetSub = detail.targetSub;

    const ip = event?.requestContext?.http?.sourceIp;
    if (ip) item.ip = ip;

    await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  } catch (err) {
    console.error('[audit] write failed:', err);
  }
}

module.exports = { writeAudit };
