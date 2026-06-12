'use strict';
// [공용] 도메인 상수 + DOM 유틸. (전역 공유; classic script)
// 로드 순서상 가장 먼저 → people-store.js / ui.js / main.js 가 참조.

// 시간 슬롯 — 월~금은 아침/저녁 분리, 토·일은 단일 슬롯 (총 12개)
const TIME_SLOTS = [
  { day:'월', shift:'아침', label:'월 아침' },  // 0
  { day:'월', shift:'저녁', label:'월 저녁' },  // 1
  { day:'화', shift:'아침', label:'화 아침' },  // 2
  { day:'화', shift:'저녁', label:'화 저녁' },  // 3
  { day:'수', shift:'아침', label:'수 아침' },  // 4
  { day:'수', shift:'저녁', label:'수 저녁' },  // 5
  { day:'목', shift:'아침', label:'목 아침' },  // 6
  { day:'목', shift:'저녁', label:'목 저녁' },  // 7
  { day:'금', shift:'아침', label:'금 아침' },  // 8
  { day:'금', shift:'저녁', label:'금 저녁' },  // 9
  { day:'토', shift:'저녁', label:'토 저녁' },  // 10
  { day:'일', shift:'저녁', label:'일 저녁' }   // 11
];
const SLOTS_COUNT       = TIME_SLOTS.length;          // 12
const SLOTS_PER_DAY     = 2;                          // 각 시간 슬롯당 인원
const TOTAL_SLOTS       = SLOTS_COUNT * SLOTS_PER_DAY; // 24
const WEEKEND_SLOT_START = 10;  // 슬롯 인덱스 10부터 주말(토·일)
const FLEX_SLOTS_COUNT   = 21;  // flex 21슬롯 (7일 × 아침/점심/저녁)
// 인원 명단·그룹·제한은 서버(DynamoDB MEMBER 레코드)에서만 로드 — 정적 JS에 PII 미포함
function defaultRestrictedFor(name) {
  return new Array(SLOTS_COUNT).fill(false);
}

// 결과 표시용 부담(load) unit Map: 평일 슬롯=1, 주말 슬롯=2.
// ui.js recomputeStats 및 main.js editLatestBtn 핸들러에서 사용.
function assignUnitsOf(schedule) {
  const wdCnt = new Map();  // id -> 평일 슬롯 수 (raw)
  const weCnt = new Map();  // id -> 주말 슬롯 수
  for (let s = 0; s < SLOTS_COUNT; s++) {
    for (const p of schedule[s]) {
      if (!p || p.id == null) continue;
      if (s >= WEEKEND_SLOT_START) weCnt.set(p.id, (weCnt.get(p.id) || 0) + 1);
      else         wdCnt.set(p.id, (wdCnt.get(p.id) || 0) + 1);
    }
  }
  const m = new Map();
  for (const id of new Set([...wdCnt.keys(), ...weCnt.keys()])) {
    m.set(id, (wdCnt.get(id) || 0) + (weCnt.get(id) || 0) * 2);
  }
  return m;
}

// DOM 헬퍼
const $ = (id) => document.getElementById(id);

// ISO 8601 -> "MM월 DD일 HH:mm" (Asia/Seoul)
function fmtKST(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d)) return '';
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(d).reduce((a, x) => (a[x.type] = x.value, a), {});
  return `${parts.month}월 ${parts.day}일 ${parts.hour}:${parts.minute}`;
}
