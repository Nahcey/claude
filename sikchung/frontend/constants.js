'use strict';
// [공용] 도메인 상수 + DOM 유틸. (전역 공유; classic script)
// 로드 순서상 가장 먼저 → schedule-algo.js / people-store.js / ui.js / main.js 가 참조.

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
const SLOTS_COUNT  = TIME_SLOTS.length;          // 12
const SLOTS_PER_DAY = 2;                          // 각 시간 슬롯당 인원
const TOTAL_SLOTS  = SLOTS_COUNT * SLOTS_PER_DAY; // 24
const DEFAULT_NAMES = [
  '이동민','김기환','정우진','윤민형','한우현',
  '권정훈','정한결','김최원','오승호','박예찬',
  '권기범','최정협','전유찬'
];
// 같은 그룹 인원을 가능한 한 같은 요일에 묶는 데 사용 (소프트 선호)
const DEFAULT_GROUPS = {
  '이동민':'A','김기환':'A','정우진':'A',
  '윤민형':'B','한우현':'B','권정훈':'B','정한결':'B','김최원':'B',
  '오승호':'C','박예찬':'C','권기범':'C','최정협':'C','전유찬':'C'
};
// 특정 인원의 디폴트 시간 슬롯 제한
// 인덱스 0~9: 월~금 아침/저녁 (각 요일 2칸씩), 10: 토, 11: 일
const DEFAULT_RESTRICTED = {
  // 윤민형: 월~금 아침·저녁 모두 제한 (인덱스 0~9), 토·일은 가능
  '윤민형': [true,true, true,true, true,true, true,true, true,true, false, false]
};
function defaultRestrictedFor(name) {
  return (DEFAULT_RESTRICTED[name] || new Array(SLOTS_COUNT).fill(false)).slice();
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
