'use strict';

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');

const TABLE_NAME = process.env.TABLE_NAME;

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' }),
);

// ── MEMBER ────────────────────────────────────────────────────────────────────

/** @returns {object|null} */
async function getMember(sub) {
  const { Item } = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: 'MEMBER', SK: sub },
  }));
  return Item ?? null;
}

/**
 * 항목 전체를 교체한다. updatedAt은 자동 세팅.
 * @returns {object} 저장된 항목
 */
async function putMember(sub, data) {
  const item = {
    ...data,
    PK: 'MEMBER',
    SK: sub,
    updatedAt: new Date().toISOString(),
  };
  await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return item;
}

/**
 * 지정된 필드만 원자적으로 업데이트한다. updatedAt은 자동 세팅.
 * PK/SK는 절대 업데이트 대상에 포함하지 않는다.
 * fields가 비어 있으면 쓰기 없이 현재 항목을 그대로 반환한다.
 * @example updateMember('user-123', { name: '홍길동', double: true })
 * @returns {object} 갱신된 전체 item (PK/SK 포함)
 */
async function updateMember(sub, fields) {
  const safe = Object.fromEntries(
    Object.entries(fields).filter(([k]) => k !== 'PK' && k !== 'SK'),
  );

  if (Object.keys(safe).length === 0) {
    return getMember(sub);
  }

  const entries = Object.entries(safe);
  const names   = { '#ua': 'updatedAt' };
  const values  = { ':ua': new Date().toISOString() };
  const sets    = ['#ua = :ua'];

  for (let i = 0; i < entries.length; i++) {
    names[`#f${i}`]  = entries[i][0];
    values[`:v${i}`] = entries[i][1];
    sets.push(`#f${i} = :v${i}`);
  }

  const { Attributes } = await client.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: 'MEMBER', SK: sub },
    UpdateExpression: `SET ${sets.join(', ')}`,
    ExpressionAttributeNames:  names,
    ExpressionAttributeValues: values,
    ReturnValues: 'ALL_NEW',
  }));
  return Attributes;
}

/** @returns {object[]} */
async function listMembers() {
  const { Items } = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': 'MEMBER' },
  }));
  return Items ?? [];
}

async function deleteMember(sub) {
  await client.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: 'MEMBER', SK: sub },
  }));
}

// ── AUDIT ──────────────────────────────────────────────────────────────────────

/**
 * 감사 로그를 최신순으로 조회한다.
 * SK가 'timestamp#random' 구조라 그 자체가 정렬키이자 커서로 동작한다 →
 * before(직전 페이지 마지막 SK)보다 작은 SK만 가져오면 자연스러운 페이지네이션.
 * (LastEvaluatedKey 복합객체 대신 단일 문자열 커서를 쓰는 이유)
 * @param {object}  [opts]
 * @param {number}  [opts.limit=50]   한 페이지 크기
 * @param {?string} [opts.before]     이 SK보다 과거(작은) 항목만. 없으면 첫 페이지.
 * @returns {{ items: object[], nextCursor: (string|null) }}
 */
async function listAuditLogs({ limit = 50, before = null } = {}) {
  const { Items } = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: before ? 'PK = :pk AND SK < :before' : 'PK = :pk',
    ExpressionAttributeValues: before
      ? { ':pk': 'AUDIT', ':before': before }
      : { ':pk': 'AUDIT' },
    ScanIndexForward: false,   // 최신 먼저
    Limit: limit,
  }));
  const items = Items ?? [];
  // 가득 찬 페이지면 다음 커서 제공, 아니면 끝
  const nextCursor = items.length === limit ? items[items.length - 1].SK : null;
  return { items, nextCursor };
}

// ── SETTINGS ──────────────────────────────────────────────────────────────────

/** 전역 일정 모드. 레코드 미존재 시 'normal'. @returns {'normal'|'summer'} */
async function getScheduleMode() {
  const { Item } = await client.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: 'SETTINGS', SK: 'SCHEDULE_MODE' },
  }));
  return Item?.mode ?? 'normal';
}

// 모드 변경(쓰기)은 admin CLI 전용 — scripts/set-schedule-mode.sh 가 직접 put-item.

// ── SCHEDULE ──────────────────────────────────────────────────────────────────

/**
 * @param {string} weekId  - yyyy-ww 형식 (예: 2025-21)
 * @param {object} data    - { scheduleData, generatedBy }
 */
async function putSchedule(weekId, data) {
  const item = {
    ...data,
    PK: 'SCHEDULE',
    SK: weekId,
    generatedAt: new Date().toISOString(),
  };
  await client.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  return item;
}

/** SK 내림차순 첫 번째 항목. @returns {object|null} */
async function getLatestSchedule() {
  const { Items } = await client.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': 'SCHEDULE' },
    ScanIndexForward: false,
    Limit: 1,
  }));
  return Items?.[0] ?? null;
}

/** 최신 일정 1건 삭제. @returns {string|null} 삭제된 weekId (SK), 없으면 null */
async function deleteLatestSchedule() {
  const latest = await getLatestSchedule();
  if (!latest) return null;
  await client.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: latest.PK, SK: latest.SK },
  }));
  return latest.SK;
}

module.exports = {
  getMember,
  putMember,
  updateMember,
  listMembers,
  deleteMember,
  listAuditLogs,
  getScheduleMode,
  putSchedule,
  getLatestSchedule,
  deleteLatestSchedule,
};
