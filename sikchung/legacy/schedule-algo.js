'use strict';
// [백업/참고용] 이 알고리즘은 향후 백엔드(Python Lambda)로 이전 예정.
// 이전 완료 후 프론트는 API 호출로 대체되며, 이 파일은 참고용으로만 유지/제거 결정.
//
// 순수 계산 모듈 — DOM·window·localStorage 의존 없음 (입출력이 순수 데이터).
// 슬롯 구조 상수(SLOTS_COUNT/SLOTS_PER_DAY/TOTAL_SLOTS)는 constants.js 에서 공유.
// IIFE → window.ScheduleAlgo 로 공개 (기존 auth.js/api.js 컨벤션과 동일).
// ※ 함수 본문은 분리 전 index3.html 과 동일 (원본 들여쓰기 보존, diff 최소화).
(function () {

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ============================================================
// 우선순위 기반 스킵 로직
// 인원 > TOTAL_SLOTS(24)면 우선순위 높은 순으로 제외, 동순위는 랜덤.
// 우선순위 0은 절대 제외하지 않음 (다른 선택지가 없는 경우 제외).
// ============================================================
function applySkipPriority(input) {
  let active = input.slice();
  const skipped = [];

  // 1) priority > 0 부터 제외
  while (active.length > TOTAL_SLOTS) {
    const candidates = active.filter(p => p.priority > 0);
    if (candidates.length === 0) break;
    // 가장 높은 priority 찾기
    const maxPr = Math.max(...candidates.map(p => p.priority));
    const tied = shuffle(candidates.filter(p => p.priority === maxPr));
    const pick = tied[0];
    active = active.filter(p => p.id !== pick.id);
    skipped.push({ person: pick, reason: 'priority' });
  }

  // 2) 그래도 > TOTAL_SLOTS(24)면 priority 0 중 무작위 제외 (불가피)
  while (active.length > TOTAL_SLOTS) {
    const tied = shuffle(active);
    const pick = tied[0];
    active = active.filter(p => p.id !== pick.id);
    skipped.push({ person: pick, reason: 'forced' });
  }

  return { active, skipped };
}

// ============================================================
// 일정 생성 — 백트래킹 + 그리디 폴백
// ============================================================
function emptySchedule() {
  return Array.from({ length: SLOTS_COUNT }, () => [null, null]);
}

// 쌍 (a,b)의 기본 선호도. 높을수록 우선.
//   1. 신병 + A/B 파트너          → 100  (최우선: 상위 기수와 묶기)
//   2. 신병 + C/D/E/미지정 파트너 →   1  (불가피한 fallback)
//   3. 그 외                        →   0
function pairPreference(a, b) {
  const aIsRookie = !!a.rookie, bIsRookie = !!b.rookie;
  if (aIsRookie || bIsRookie) {
    const partner = aIsRookie ? b : a;
    // 신병끼리 묶이는 경우: 둘 다 A/B면 최우선, 아니면 fallback
    if (aIsRookie && bIsRookie) {
      return ((a.group === 'A' || a.group === 'B') && (b.group === 'A' || b.group === 'B')) ? 100 : 1;
    }
    return (partner.group === 'A' || partner.group === 'B') ? 100 : 1;
  }
  return 0;
}

// 슬롯 컨텍스트를 고려한 선호도.
// 월~금의 저녁 슬롯이면 — 같은 요일 아침에 들어간 인원과 동일한 쌍에 큰 가산점.
// 모든 평일 슬롯에서 — 이미 주말에 들어간 인원이 페어에 있으면 큰 페널티 (overflow 최후 수단).
function pairPreferenceForSlot(a, b, slotIdx, schedule) {
  let base = pairPreference(a, b);
  // 평일 아침 (짝수 인덱스 < 10): 페어 멤버가 같은 요일 저녁도 가능하면 보너스
  // → 한 인원이 한 요일의 두 슬롯을 함께 잡도록 적극 유도
  if (slotIdx < 10 && (slotIdx % 2) === 0) {
    const eIdx = slotIdx + 1;
    if (!a.restricted[eIdx]) base += 300;
    if (!b.restricted[eIdx]) base += 300;
  }
  // 평일 저녁 (홀수 인덱스 < 10): 같은 요일 아침에 들어간 인원과 일치하면 큰 가산점
  if (slotIdx < 10 && (slotIdx % 2) === 1) {
    const morning = schedule[slotIdx - 1];
    if (morning) {
      const mIds = morning.filter(Boolean).map(p => p.id);
      const matchCount = (mIds.includes(a.id) ? 1 : 0) + (mIds.includes(b.id) ? 1 : 0);
      base += matchCount * 800; // 두 명 일치 → +1600, 한 명 → +800 (이전 500 보다 강화)
    }
  }
  // 주말 overflow 는 canTake 에서 하드 차단되므로 별도 평일 페널티 없음.
  // 주말 슬롯: 주 2회 ON 인원 우선
  if (slotIdx >= 10) {
    if (a.double) base += 50;
    if (b.double) base += 50;
  }
  return base;
}

// 분기탐색(branch-and-bound) 백트래킹.
// 첫 정답에서 멈추지 않고 시간 예산 안에서 가능한 모든 분기를 탐색하면서 best 갱신.
// 미배정 슬롯 최소가 최우선이므로 (남은 슬롯 × 2) 더해도 best를 못 넘기면 가지치기.
function solveBacktrack(active, timeBudgetMs = 600) {
  const isWeekend = idx => idx >= 10;
  const schedule = emptySchedule();
  const counts = new Map(active.map(p => [p.id, 0]));
  const wkndCounts = new Map(active.map(p => [p.id, 0]));
  const start = Date.now();
  let timedOut = false;

  function capOf(p) { return p.double ? 4 : 2; }
  function canTake(p, slotIdx) {
    // mutual exclusion 제거: cap(슬롯 수)만 확인. 같은 슬롯 중복은 호출부에서 방지.
    if (counts.get(p.id) >= capOf(p)) return false;
    // 주말 슬롯은 2 unit 비용 → 잔여 슬롯 2 이상 필요
    if (slotIdx >= 10 && capOf(p) - counts.get(p.id) < 2) return false;
    return true;
  }
  function take(p, slotIdx) {
    counts.set(p.id, counts.get(p.id) + 1);
    if (isWeekend(slotIdx)) wkndCounts.set(p.id, wkndCounts.get(p.id) + 1);
  }
  function untake(p, slotIdx) {
    counts.set(p.id, counts.get(p.id) - 1);
    if (isWeekend(slotIdx)) wkndCounts.set(p.id, wkndCounts.get(p.id) - 1);
  }
  function snapshot() { return schedule.map(s => s.slice()); }

  // 평일 day 를 unit 으로 묶어 morning → evening 순서 보장 + 가용 인원 적은 unit 먼저
  const units = [];
  for (let i = 0; i < 5; i++) {
    const c = active.filter(p => !p.restricted[i*2] && !p.restricted[i*2+1]).length;
    units.push({ slots: [i*2, i*2+1], c: c + Math.random() * 0.001 });
  }
  for (let i = 10; i < SLOTS_COUNT; i++) {
    units.push({ slots: [i], c: active.filter(p => !p.restricted[i]).length + Math.random() * 0.001 });
  }
  units.sort((a, b) => a.c - b.c);
  const dayOrder = units.flatMap(u => u.slots);

  let best = null;        // { schedule, score }
  let currentFilled = 0;

  function tryUpdateBest() {
    const sc = scoreSchedule(schedule, active);
    if (!best || compareSchedules(sc, best.score) < 0) {
      best = { schedule: snapshot(), score: sc };
    }
  }

  function recurse(idx) {
    if (timedOut) return;
    if (Date.now() - start > timeBudgetMs) { timedOut = true; return; }

    if (idx === dayOrder.length) {
      tryUpdateBest();
      return;
    }

    // 가지치기: 남은 슬롯을 전부 채워도 best 의 filled 를 못 넘기면 탐색 중단
    if (best) {
      const remainingSlots = dayOrder.length - idx;
      const maxReachable = currentFilled + remainingSlots * SLOTS_PER_DAY;
      if (maxReachable < best.score.filled) return;
    }

    const day = dayOrder[idx];
    const available = active.filter(p => !p.restricted[day] && canTake(p, day));

    // 2명 이상 → 모든 쌍을 선호도 순으로 시도
    if (available.length >= 2) {
      const pairs = [];
      for (let i = 0; i < available.length; i++) {
        for (let j = i + 1; j < available.length; j++) {
          pairs.push([available[i], available[j]]);
        }
      }
      pairs.sort((p1, p2) =>
        pairPreferenceForSlot(p2[0], p2[1], day, schedule) -
        pairPreferenceForSlot(p1[0], p1[1], day, schedule)
      );
      for (const [a, b] of pairs) {
        if (timedOut) return;
        schedule[day] = [a, b];
        take(a, day); take(b, day);
        currentFilled += 2;
        recurse(idx + 1);
        currentFilled -= 2;
        untake(a, day); untake(b, day);
        schedule[day] = [null, null];
      }
    }

    // 1명 only — best 갱신에 기여할 가능성 있을 때만 시도
    // (이미 best.filled 가 만점이면 1명/0명 분기는 무의미)
    if (best && best.score.filled >= dayOrder.length * SLOTS_PER_DAY) return;
    for (const a of available) {
      if (timedOut) return;
      schedule[day] = [a, null];
      take(a, day);
      currentFilled += 1;
      recurse(idx + 1);
      currentFilled -= 1;
      untake(a, day);
      schedule[day] = [null, null];
    }

    // 0명 (이 슬롯 전체 비움)
    if (timedOut) return;
    schedule[day] = [null, null];
    recurse(idx + 1);
  }

  recurse(0);
  return best ? { schedule: best.schedule } : null;
}

// 일정 점수 — "배정 횟수(occasion)" 와 "부담(load) unit" 구분:
//   배정 횟수(occasion): 평일 atomic day 1회 또는 주말 1슬롯 1회 = 각각 1회.
//     doubleAssigned/weekdayOnlyDouble 는 "2회 이상 배정자" 이므로 occasion 기준(wd+we).
//   부담(load) unit: 주말 1슬롯 = 평일 하루(2슬롯)와 동등하게 2 unit 으로 환산.
//     → 그리디 units Map, 결과 화면 assignUnitsOf(주말+평일=3 표시)에서 사용.
//   ※ load 가중치(주말×2)를 doubleAssigned 판정에 쓰면 주말 1회(=1 occasion) 인원이
//     '2회 배정자'로 오집계되어(예: n=20 에서 0→4) 의미가 깨지므로 occasion 으로 판정한다.
// 비교 우선순위 (compareSchedules 참고):
//   1) excessUnassigned  — 미배정 인원(이론 최소 max(0,n-14) 초과분) 최소
//   2) doubleAssigned    — 2회 이상 배정된 인원 수 최소 (occasion)
//   3) weekdayOnlyDouble — 2회 배정자 중 '평일+평일' 조합 수 최소 (= 평일+주말 선호)
//   4) weekdayLone(최소) → atomicDays(최대)  — 평일 짝 맞춤
//   5) filled / people / pref (보조)
function scoreSchedule(schedule, active) {
  const n = Array.isArray(active) ? active.length : 0;
  let filled = 0;
  const idSet = new Set();
  let pref = 0;
  const weekdayDays = new Map();  // id -> Set(평일 day 0..4)
  const weekendCnt  = new Map();  // id -> 주말 슬롯 수
  for (let s = 0; s < SLOTS_COUNT; s++) {
    for (const p of schedule[s]) {
      if (!p) continue;
      filled++;
      idSet.add(p.id);
      if (s >= 10) {
        weekendCnt.set(p.id, (weekendCnt.get(p.id) || 0) + 1);
      } else {
        const d = Math.floor(s / 2);
        if (!weekdayDays.has(p.id)) weekdayDays.set(p.id, new Set());
        weekdayDays.get(p.id).add(d);
      }
    }
    if (schedule[s][0] && schedule[s][1]) pref += pairPreference(schedule[s][0], schedule[s][1]);
  }
  // 2회 배정 인원 수 + 평일전용 2회 배정 수
  let doubleAssigned = 0, weekdayOnlyDouble = 0;
  const allIds = new Set([...weekdayDays.keys(), ...weekendCnt.keys()]);
  for (const id of allIds) {
    const wd = weekdayDays.has(id) ? weekdayDays.get(id).size : 0;
    const we = weekendCnt.get(id) || 0;
    if (wd + we >= 2) {
      doubleAssigned++;
      if (we === 0) weekdayOnlyDouble++;   // 평일만으로 2회 → 덜 선호
    }
  }
  // 평일 atomic / lone (주말 제외, 위치 무관·id 기준)
  let atomicDays = 0, weekdayLone = 0;
  for (let d = 0; d < 5; d++) {
    const m = new Set(schedule[2*d].filter(Boolean).map(p => p.id));
    const e = new Set(schedule[2*d+1].filter(Boolean).map(p => p.id));
    for (const id of m) { if (e.has(id)) atomicDays++; else weekdayLone++; }
    for (const id of e) { if (!m.has(id)) weekdayLone++; }
  }
  // 미배정 (모든 슬롯 제한 인원은 예외, excluded 는 active 에서 이미 제외)
  let unassignedEligible = 0;
  if (Array.isArray(active)) {
    for (const p of active) {
      if (!idSet.has(p.id) && !p.restricted.every(x => x)) unassignedEligible++;
    }
  }
  const excessUnassigned = Math.max(0, unassignedEligible - Math.max(0, n - 14));
  return {
    excessUnassigned, doubleAssigned, weekdayOnlyDouble,
    weekdayLone, atomicDays, filled, people: idSet.size, pref, unassignedEligible,
  };
}
function compareSchedules(a, b) {
  // 1순위: 미배정(이론 최소 초과분) 최소화
  if (a.excessUnassigned !== b.excessUnassigned) return a.excessUnassigned - b.excessUnassigned;
  // 2순위: 2회 배정 인원 수 최소화
  if (a.doubleAssigned !== b.doubleAssigned) return a.doubleAssigned - b.doubleAssigned;
  // 3순위: 2회 배정자는 평일+주말 구성 선호 (평일전용 2회 수 최소화)
  if (a.weekdayOnlyDouble !== b.weekdayOnlyDouble) return a.weekdayOnlyDouble - b.weekdayOnlyDouble;
  // 4순위: 평일 짝 안 맞음 최소 → atomic day 최대
  if (a.weekdayLone !== b.weekdayLone) return a.weekdayLone - b.weekdayLone;
  if (a.atomicDays !== b.atomicDays) return b.atomicDays - a.atomicDays;
  // 5순위: 보조 지표
  if (a.filled !== b.filled) return b.filled - a.filled;
  if (a.people !== b.people) return b.people - a.people;
  return b.pref - a.pref;
}


function solveGreedy(active) {
  // unit 기반 그리디 (mutual exclusion 없음 — 주말 배정자도 평일 가능):
  //   라운드 A: 0 unit 인원에게 1 unit 씩 (평일 atomic 우선 → 주말).
  //   라운드 B: 남는 빈 슬롯을 추가 unit 으로 채움. 2회 배정은 double 인원에게만,
  //             추가 unit 은 주말부터 채워 '평일+주말' 구성을 유도.
  //   Guarantee: 그래도 0슬롯인 가용 인원은 빈칸/양보로 최소 1슬롯 보장.
  const schedule = emptySchedule();
  const counts = new Map(active.map(p => [p.id, 0])); // 슬롯 수 (cap 기준)
  const units  = new Map(active.map(p => [p.id, 0])); // unit 수 (배정 횟수)
  const capOf = p => p.double ? 4 : 2;

  const inSlot  = (p, s) => schedule[s].some(x => x && x.id === p.id);
  const freePos = s => schedule[s].findIndex(x => x === null);
  function placeSlot(p, s, pos) { schedule[s][pos] = p; counts.set(p.id, counts.get(p.id) + 1); }
  function placeWeekdayAtomic(p, d) {
    const m = 2*d, e = 2*d+1, pm = freePos(m), pe = freePos(e);
    if (pm < 0 || pe < 0) return false;
    placeSlot(p, m, pm); placeSlot(p, e, pe);
    units.set(p.id, units.get(p.id) + 1);
    return true;
  }
  function placeWeekend(p, s) {
    const pos = freePos(s);
    if (pos < 0) return false;
    placeSlot(p, s, pos);
    units.set(p.id, units.get(p.id) + 2); // 주말 1슬롯 = 평일 하루와 동등한 2 unit
    return true;
  }
  const canAtomic = (p, d) =>
    !p.restricted[2*d] && !p.restricted[2*d+1] &&
    capOf(p) - counts.get(p.id) >= 2 &&
    !inSlot(p, 2*d) && !inSlot(p, 2*d+1) &&
    freePos(2*d) >= 0 && freePos(2*d+1) >= 0;
  const canWknd = (p, s) =>
    !p.restricted[s] && capOf(p) - counts.get(p.id) >= 2 &&
    !inSlot(p, s) && freePos(s) >= 0;

  // ---- 라운드 A: 0 unit 인원에게 1 unit 씩 ----
  const fresh = shuffle(active.slice());
  // 평일 atomic 우선 (가용 인원 적은 요일 먼저 — 제한 많은 요일을 먼저 처리)
  const weekdayOrder = [0,1,2,3,4].sort((a, b) => {
    const ca = active.filter(p => !p.restricted[a*2] && !p.restricted[a*2+1]).length;
    const cb = active.filter(p => !p.restricted[b*2] && !p.restricted[b*2+1]).length;
    return ca !== cb ? ca - cb : Math.random() - 0.5;
  });
  for (const d of weekdayOrder) {
    while (freePos(2*d) >= 0 && freePos(2*d+1) >= 0) {
      const cand = fresh.find(p => units.get(p.id) === 0 && canAtomic(p, d));
      if (!cand) break;
      placeWeekdayAtomic(cand, d);
    }
  }
  // 남은 0 unit 인원 → 주말
  for (const s of shuffle([10, 11])) {
    while (freePos(s) >= 0) {
      const cand = fresh.find(p => units.get(p.id) === 0 && canWknd(p, s));
      if (!cand) break;
      placeWeekend(cand, s);
    }
  }
  // 그래도 0 unit 인 인원(가용 요일이 다 참 등) → 남은 어떤 unit 이든 1개
  for (const p of fresh) {
    if (units.get(p.id) !== 0 || p.restricted.every(x => x)) continue;
    let done = false;
    for (const d of shuffle([0,1,2,3,4])) { if (canAtomic(p, d)) { placeWeekdayAtomic(p, d); done = true; break; } }
    if (done) continue;
    for (const s of shuffle([10, 11])) { if (canWknd(p, s)) { placeWeekend(p, s); break; } }
  }

  // ---- 라운드 B: 남는 빈 슬롯 채움 (추가 unit 은 double 인원에게만) ----
  // 추가 unit 은 가능한 한 주말부터 → '평일+주말' 구성 유도. 적은 unit/슬롯 순, double 우선.
  const hasWeekday = p => { for (let d = 0; d < 5; d++) if (inSlot(p, 2*d) || inSlot(p, 2*d+1)) return true; return false; };
  const hasWeekend = p => inSlot(p, 10) || inSlot(p, 11);
  function pickB(eligible, preferDouble, mixForWeekend) {
    const cands = active.filter(p => (units.get(p.id) === 0 || p.double) && eligible(p));
    if (!cands.length) return null;
    cands.sort((a, b) => {
      if (preferDouble) { const ad = a.double?0:1, bd = b.double?0:1; if (ad !== bd) return ad - bd; }
      // 주말 추가 unit: 평일 unit 있고 아직 주말 없는 인원 우선 → '평일+주말' 구성
      if (mixForWeekend) {
        const am = (units.get(a.id) > 0 && hasWeekday(a) && !hasWeekend(a)) ? 0 : 1;
        const bm = (units.get(b.id) > 0 && hasWeekday(b) && !hasWeekend(b)) ? 0 : 1;
        if (am !== bm) return am - bm;
      }
      const du = units.get(a.id) - units.get(b.id); if (du !== 0) return du;
      const dc = counts.get(a.id) - counts.get(b.id); if (dc !== 0) return dc;
      return Math.random() - 0.5;
    });
    return cands[0];
  }
  let progress = true;
  while (progress) {
    progress = false;
    // 주말 빈칸 먼저 (2회 배정자의 추가 unit 이 주말이 되도록 + 평일+주말 구성 유도)
    for (const s of [10, 11]) {
      while (freePos(s) >= 0) {
        const c = pickB(p => canWknd(p, s), true, true);
        if (!c) break;
        placeWeekend(c, s); progress = true;
      }
    }
    // 평일 atomic 빈 day
    for (let d = 0; d < 5; d++) {
      while (freePos(2*d) >= 0 && freePos(2*d+1) >= 0) {
        const c = pickB(p => canAtomic(p, d), false);
        if (!c) break;
        placeWeekdayAtomic(c, d); progress = true;
      }
    }
  }
  // 마지막 보완: 남은 평일 단일 슬롯(lone) — double 인원으로만 (불가피한 경우)
  for (let s = 0; s < 10; s++) {
    while (freePos(s) >= 0) {
      const other = (s % 2 === 0) ? s + 1 : s - 1;
      const c = pickB(p => !p.restricted[s] && capOf(p) - counts.get(p.id) >= 1 && !inSlot(p, s), false);
      if (!c) break;
      const wasPresentOther = inSlot(c, other);
      placeSlot(c, s, freePos(s));
      if (!wasPresentOther) units.set(c.id, units.get(c.id) + 1); // 새 day → 새 unit (아니면 atomic 완성)
    }
  }

  // ---- Guarantee pass: 0슬롯 가용 인원에게 최소 1슬롯 ----
  const slotOrder = [];
  for (let d = 10; d < SLOTS_COUNT; d++) slotOrder.push(d);
  for (let d = 0; d < 10; d++) slotOrder.push(d);
  for (const u of active) {
    if (counts.get(u.id) > 0 || u.restricted.every(x => x)) continue;
    let placed = false;
    // 빈칸 우선 (주말 슬롯은 2 unit)
    for (const d of slotOrder) {
      if (u.restricted[d] || freePos(d) < 0 || inSlot(u, d)) continue;
      placeSlot(u, d, freePos(d));
      units.set(u.id, units.get(u.id) + (d >= 10 ? 2 : 1));
      placed = true; break;
    }
    if (placed) continue;
    // 빈칸 없음 → 2 unit 이상인 인원에게서 1슬롯 양보받기
    for (const d of slotOrder) {
      if (u.restricted[d] || inSlot(u, d)) continue;
      let yielded = false;
      const w = d >= 10 ? 2 : 1; // 주말 슬롯 unit 가중치
      for (let pos = 0; pos < SLOTS_PER_DAY; pos++) {
        const inc = schedule[d][pos];
        if (inc && units.get(inc.id) >= 2) {
          schedule[d][pos] = u;
          counts.set(u.id, counts.get(u.id) + 1);
          counts.set(inc.id, counts.get(inc.id) - 1);
          // unit 재계산은 근사: 양보자는 그 day/슬롯에서 빠지므로 unit 감소
          units.set(inc.id, Math.max(1, units.get(inc.id) - w));
          units.set(u.id, units.get(u.id) + w);
          yielded = true; break;
        }
      }
      if (yielded) { placed = true; break; }
    }
  }

  const assignedIds = new Set();
  for (const day of schedule) for (const p of day) if (p) assignedIds.add(p.id);
  const failed = active
    .filter(p => !assignedIds.has(p.id))
    .map(p => ({
      person: p,
      reason: p.restricted.every(x => x) ? '모든 시간 슬롯 제한됨' : '슬롯 우선 채움으로 자리 없음'
    }));

  return { schedule, failed };
}

// 결과 표시용 부담(load) unit Map: 평일 day=1, 주말 슬롯=2 (주말+평일 = 3 으로 표시).
function assignUnitsOf(schedule) {
  const wdDays = new Map();  // id -> Set(평일 day)
  const weCnt  = new Map();  // id -> 주말 슬롯 수
  for (let s = 0; s < SLOTS_COUNT; s++) {
    for (const p of schedule[s]) {
      if (!p || p.id == null) continue;
      if (s >= 10) weCnt.set(p.id, (weCnt.get(p.id) || 0) + 1);
      else {
        const d = Math.floor(s / 2);
        if (!wdDays.has(p.id)) wdDays.set(p.id, new Set());
        wdDays.get(p.id).add(d);
      }
    }
  }
  const m = new Map();
  for (const id of new Set([...wdDays.keys(), ...weCnt.keys()])) {
    m.set(id, (wdDays.has(id) ? wdDays.get(id).size : 0) + (weCnt.get(id) || 0) * 2);
  }
  return m;
}

// 일정 생성 순수 오케스트레이션: 입력(eligible people 배열) → 결과 객체.
// (분리 전 generate() 의 계산부. renderResult 등 DOM 부수효과는 호출부 main.js 가 담당.)
function generateSchedule(eligible) {
  // 1단계: 우선순위 스킵
  const { active, skipped } = applySkipPriority(eligible);

  // 2단계: 그리디 다회 시도로 초기 best 후보 확보 (branch-and-bound pruning 용 lower bound)
  let res = null;
  let bestScore = null;
  const grAttempts = 30;
  for (let t = 0; t < grAttempts; t++) {
    const gr = solveGreedy(active);
    const sc = scoreSchedule(gr.schedule, active);
    if (!bestScore || compareSchedules(sc, bestScore) < 0) {
      bestScore = sc;
      res = { schedule: gr.schedule };
    }
  }

  // 3단계: branch-and-bound 백트래킹 — 시간 예산 안에서 best 갱신
  const btAttempts = 3;
  const btBudget = 1500;
  for (let t = 0; t < btAttempts; t++) {
    const r = solveBacktrack(active, btBudget);
    if (!r) continue;
    const sc = scoreSchedule(r.schedule, active);
    if (!bestScore || compareSchedules(sc, bestScore) < 0) {
      bestScore = sc;
      res = r;
    }
    if (sc.filled === TOTAL_SLOTS) break; // 완전 채움이면 더 시도 불필요
  }

  // 백트래킹/그리디 모두 결과가 없는 극단적인 케이스 안전망 (사실상 도달하지 않음)
  if (!res) {
    res = { schedule: emptySchedule() };
  }

  // active 중 한 번도 배정되지 못한 인원 = 실패 인원
  const assignedIds = new Set();
  for (const day of res.schedule) for (const p of day) if (p) assignedIds.add(p.id);
  const failed = active
    .filter(p => !assignedIds.has(p.id))
    .map(p => {
      const allRestricted = p.restricted.every(x => x);
      return {
        person: p,
        reason: allRestricted ? '모든 시간 슬롯 제한됨' : '슬롯 우선 채움으로 자리 없음'
      };
    });

  // 결과 통계
  let fullDays = 0, emptySlots = 0;
  for (const day of res.schedule) {
    const filled = day.filter(Boolean).length;
    if (filled === SLOTS_PER_DAY) fullDays++;
    emptySlots += SLOTS_PER_DAY - filled;
  }

  // 각 인원의 부담(load) unit (주말 슬롯 = 2). 화면 표시·crossover 판정용.
  const assignCount = assignUnitsOf(res.schedule);

  return { schedule: res.schedule, skipped, failed, fullDays, emptySlots, assignCount, active };
}

window.ScheduleAlgo = {
  applySkipPriority, emptySchedule, pairPreference, pairPreferenceForSlot,
  solveBacktrack, scoreSchedule, compareSchedules, solveGreedy,
  assignUnitsOf, generateSchedule,
};
})();
