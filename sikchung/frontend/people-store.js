'use strict';
// [모델/상태] 인원 데이터 + localStorage 영속화. (전역 공유; classic script)
// 전역: people, nextId. constants.js 다음, ui.js/main.js 이전에 로드.

let people = []; // {id, name, restricted: bool[7], double: bool, priority: number, group, rookie}
let nextId = 1;

// ------------------------------------------------------------
// localStorage 영속화 — 페이지를 닫아도 인원 설정이 유지됨
// ------------------------------------------------------------
const STORAGE_KEY        = 'sikchung-people-v2';
const STORAGE_KEY_LEGACY = 'sikchung-people-v1';   // index.html 의 v1 스키마(요일 7칸)

function savePeople() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(people)); }
  catch (e) { /* private mode 등에서 실패하면 조용히 무시 */ }
}

// 요일 7칸 → 시간 슬롯 12칸 마이그레이션 (월~금은 아침/저녁 모두 같은 값으로 복제)
function migrateRestricted(r) {
  if (Array.isArray(r) && r.length === SLOTS_COUNT) return r.map(Boolean);
  if (Array.isArray(r) && r.length === 7) {
    return [
      !!r[0], !!r[0],  // 월
      !!r[1], !!r[1],  // 화
      !!r[2], !!r[2],  // 수
      !!r[3], !!r[3],  // 목
      !!r[4], !!r[4],  // 금
      !!r[5],          // 토
      !!r[6]           // 일
    ];
  }
  return new Array(SLOTS_COUNT).fill(false);
}

function normalizePerson(p) {
  return {
    id: Number(p.id) || uid(),
    name: String(p.name || ''),
    restricted: migrateRestricted(p.restricted),
    double: !!p.double,
    priority: Number.isFinite(p.priority) ? Math.max(0, Math.min(99, p.priority)) : 0,
    group: (['A','B','C','D','E'].includes(p.group)) ? p.group : null,
    rookie: !!p.rookie,
    excluded: !!p.excluded,
  };
}

function loadPeople() {
  try {
    // 1) v2 우선
    let raw = localStorage.getItem(STORAGE_KEY);
    let parsed = raw ? JSON.parse(raw) : null;
    // 2) v2 없으면 v1 에서 1회성 마이그레이션 (index.html 사용 흔적)
    if (!Array.isArray(parsed) || parsed.length === 0) {
      raw = localStorage.getItem(STORAGE_KEY_LEGACY);
      parsed = raw ? JSON.parse(raw) : null;
    }
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed.map(normalizePerson);
  } catch (e) { return null; }
}

function uid() { return nextId++; }

// ============================================================
// 초기 인원 세팅
// ============================================================
function initPeople() {
  // 인원은 서버에서만 로드 (로그인 필수) — 로컬 초기 명단 없음
  people = [];
}
