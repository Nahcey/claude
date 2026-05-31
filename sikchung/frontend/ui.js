'use strict';
// [UI] 렌더링·모달·결과/편집 화면. (전역 공유; classic script)
// 전역 상태: lastResult, editingId, editMode, selectedSlot.
// constants.js·schedule-algo.js·people-store.js 다음, main.js 이전에 로드.

let lastResult = null; // 마지막으로 생성된 결과 (재생성 시 비교용)

// ============================================================
// 렌더 — 인원 테이블
// ============================================================
const peopleGrid = $('peopleGrid');

function renderPeople() {
  peopleGrid.innerHTML = '';
  const nameOrder = Object.fromEntries(DEFAULT_NAMES.map((n, i) => [n, i]));
  const sorted = [...people].sort((a, b) => {
    const ai = nameOrder[a.name] ?? Infinity;
    const bi = nameOrder[b.name] ?? Infinity;
    return ai - bi;
  });
  for (const p of sorted) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'person-card' + (p.excluded ? ' excluded' : '');
    card.addEventListener('click', () => openEditor(p.id));

    const name = document.createElement('div');
    name.className = 'pc-name';
    name.textContent = p.name;
    card.appendChild(name);

    const meta = document.createElement('div');
    meta.className = 'pc-meta';
    if (p.rookie) {
      const b = document.createElement('span');
      b.className = 'pc-mini rkk';
      b.textContent = '신병';
      meta.appendChild(b);
    }
    if (p.double) {
      const b = document.createElement('span');
      b.className = 'pc-mini dbl';
      b.textContent = '2회';
      meta.appendChild(b);
    }
    // 우선순위 P 라벨은 카드에 노출하지 않음 (모달에서만 편집)
    const resCount = p.restricted.filter(Boolean).length;
    if (resCount > 0) {
      const b = document.createElement('span');
      b.className = 'pc-mini res';
      b.textContent = `제한 ${resCount}칸`;
      meta.appendChild(b);
    }
    if (p.excluded) {
      const b = document.createElement('span');
      b.className = 'pc-mini exc';
      b.textContent = '제외';
      meta.appendChild(b);
    }
    card.appendChild(meta);

    if (p.updatedAt) {
      const t = document.createElement('div');
      t.className = 'pc-updated';
      t.style.cssText = 'margin-top:3px;font-size:10px;color:var(--muted);';
      t.textContent = fmtKST(p.updatedAt);
      card.appendChild(t);
    }

    peopleGrid.appendChild(card);
  }

  ($('personCount') || {}).textContent = `(현재 인원: ${activeCount()}명 / 총 배정: ${TOTAL_SLOTS})`;
}

// ============================================================
// 인원 편집 모달
// ============================================================
const modalOverlay = $('modalOverlay');
const modalDays    = $('modalDays');
const modalDouble  = $('modalDouble');
const modalRookie  = $('modalRookie');
const modalPriority = $('modalPriority');
const modalNameEl  = $('modalName');
let editingId = null;

// 현재 편집 중인 인원 객체 반환 (없거나 삭제됐으면 null)
function editingPerson() {
  return editingId == null ? null : (people.find(x => x.id === editingId) || null);
}

// 변경사항은 곧바로 인원 객체에 반영 → localStorage 저장 + 카드/상태 갱신
function autoSave() {
  savePeople();
  renderPeople();
  updateStatus();
  if (_apiMode && editingId != null) {
    const p = editingPerson();
    if (p) _syncPersonToApi(p);
  }
}

function _syncPersonToApi(p) {
  const payload = {
    name: p.name, restricted: p.restricted,
    double: p.double, rookie: p.rookie, priority: p.priority,
    group: p.group ?? null, excluded: !!p.excluded,
  };
  if (_currentUser && _currentUser.isLeader && p.sub) {
    API.putMember(p.sub, payload).catch(e => console.error('[sync] putMember:', e));
  } else if (_currentUser) {
    API.putMe(payload).catch(e => console.error('[sync] putMe:', e));
  }
}

function openEditor(personId) {
  const p = people.find(x => x.id === personId);
  if (!p) return;
  editingId = personId;
  modalNameEl.textContent = p.name;
  renderModalBody();
  modalOverlay.classList.add('open');
}

// 시간 슬롯 토글 1개 생성 (월~금 아침/저녁 또는 토/일 전체)
function createSlotToggle(slotIdx, text, fullWeek) {
  const cur = editingPerson();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'day-toggle' + (cur && cur.restricted[slotIdx] ? ' active' : '') + (fullWeek ? ' full-week' : '');
  btn.textContent = text;
  btn.addEventListener('click', () => {
    const c = editingPerson();
    if (!c) return;
    c.restricted[slotIdx] = !c.restricted[slotIdx];
    btn.classList.toggle('active', c.restricted[slotIdx]);
    autoSave();
  });
  return btn;
}

// 월~금용 한 행 — 아침/저녁/전체 세 버튼이 서로 상태 동기화
function appendWeekdayRow(dayIdx) {
  const morningIdx = dayIdx * 2;
  const eveningIdx = dayIdx * 2 + 1;

  const label = document.createElement('div');
  label.className = 'day-label-cell';
  label.textContent = TIME_SLOTS[morningIdx].day;
  modalDays.appendChild(label);

  // 세 버튼 미리 생성 → 핸들러에서 서로 참조
  const mBtn = document.createElement('button');
  const eBtn = document.createElement('button');
  const allBtn = document.createElement('button');

  function syncAll() {
    const c = editingPerson();
    if (!c) return;
    allBtn.classList.toggle('active', c.restricted[morningIdx] && c.restricted[eveningIdx]);
  }

  function setupSlot(btn, idx, text) {
    btn.type = 'button';
    const c = editingPerson();
    btn.className = 'day-toggle' + (c && c.restricted[idx] ? ' active' : '');
    btn.textContent = text;
    btn.addEventListener('click', () => {
      const cur = editingPerson();
      if (!cur) return;
      cur.restricted[idx] = !cur.restricted[idx];
      btn.classList.toggle('active', cur.restricted[idx]);
      syncAll();
      autoSave();
    });
  }
  setupSlot(mBtn, morningIdx, '아침');
  setupSlot(eBtn, eveningIdx, '저녁');

  // 전체 버튼: 둘 다 켜져 있을 때만 active 표시. 누르면 두 슬롯을 동시에 토글.
  allBtn.type = 'button';
  const cur = editingPerson();
  const bothOn = cur && cur.restricted[morningIdx] && cur.restricted[eveningIdx];
  allBtn.className = 'day-toggle' + (bothOn ? ' active' : '');
  allBtn.textContent = '전체';
  allBtn.addEventListener('click', () => {
    const c = editingPerson();
    if (!c) return;
    const newVal = !(c.restricted[morningIdx] && c.restricted[eveningIdx]);
    c.restricted[morningIdx] = newVal;
    c.restricted[eveningIdx] = newVal;
    mBtn.classList.toggle('active', newVal);
    eBtn.classList.toggle('active', newVal);
    allBtn.classList.toggle('active', newVal);
    autoSave();
  });

  modalDays.appendChild(mBtn);
  modalDays.appendChild(eBtn);
  modalDays.appendChild(allBtn);
}

// 모달 내부 폼을 현재 인원의 실제 값으로 다시 그림 (초기화/열기에서 공통 사용)
function renderModalBody() {
  const p = editingPerson();
  if (!p) return;

  // 그리드: [요일 라벨 | 아침 | 저녁 | 전체]
  modalDays.innerHTML = '';
  // 헤더 행 — 라벨 자리 + 3개 헤더
  modalDays.appendChild(document.createElement('div'));
  for (const h of ['아침', '저녁', '전체']) {
    const cell = document.createElement('div');
    cell.className = 'grid-header';
    cell.textContent = h;
    modalDays.appendChild(cell);
  }
  // 월~금 (5행)
  for (let i = 0; i < 5; i++) appendWeekdayRow(i);
  // 토·일 (각 행에 단일 '저녁' 버튼이 전체 폭)
  for (let i = 10; i < SLOTS_COUNT; i++) {
    const label = document.createElement('div');
    label.className = 'day-label-cell';
    label.textContent = TIME_SLOTS[i].day;
    modalDays.appendChild(label);
    modalDays.appendChild(createSlotToggle(i, '저녁', true));
  }

  // 스위치 및 입력 동기화
  modalDouble.classList.toggle('on', !!p.double);
  modalRookie.classList.toggle('on', !!p.rookie);
  $('modalExcluded').classList.toggle('on', !!p.excluded);
  modalPriority.value = p.priority;
}

function closeEditor() {
  modalOverlay.classList.remove('open');
  editingId = null;
}

// ============================================================
// 상태 배너 (Red / Yellow / Green / Blue info)
// ============================================================
function maxCapacity() {
  // index2 정책: 인원당 총 cap = (p.double ? 4 : 2). 주말 슬롯은 한 사람당 1회 이내.
  // 단순 합산만으로도 상한이 잘 맞음 (주말 4 + 평일 20 = 24).
  const totalCap = people.filter(p => !p.excluded).reduce((s, p) => s + (p.double ? 4 : 2), 0);
  return Math.min(TOTAL_SLOTS, totalCap);
}
function activeCount() { return people.filter(p => !p.excluded).length; }

function updateStatus() {
  const cap = maxCapacity();
  const ban = $('infoBanner');
  const st = $('status');
  const stText = $('statusText');

  st.classList.remove('green','yellow','red');
  if (cap < TOTAL_SLOTS) {
    st.classList.add('red');
    stText.innerHTML = `최대 가능 배정 횟수가 ${cap}회입니다. ${TOTAL_SLOTS} 슬롯을 모두 채울 수 없습니다. (인원 추가 필요)`;
  } else if (cap === TOTAL_SLOTS) {
    st.classList.add('yellow');
    stText.innerHTML = `최대 가능 배정 횟수가 정확히 ${TOTAL_SLOTS}회입니다.`;
  } else {
    st.classList.add('green');
    stText.innerHTML = `충분한 인원이 확보되었습니다. 일정을 생성하세요.`;
  }

  // 인원 > 14: 우선순위 기반 제외 예고
  if (activeCount() > TOTAL_SLOTS) {
    const excess = activeCount() - TOTAL_SLOTS;
    ban.style.display = '';
    ban.textContent = `${excess}명이 슬롯 초과로 제외될 예정입니다 (우선순위 높은 순).`;
  } else {
    ban.style.display = 'none';
  }
}

// ============================================================
// 결과 렌더
// ============================================================
function isWeekendSlot(idx) { return idx >= 10; }

// ============================================================
// 결과 화면 편집 모드
// ============================================================
let editMode = false;
let selectedSlot = null; // { slotIdx, pos } 또는 null

function toggleEditMode() {
  editMode = !editMode;
  selectedSlot = null;
  const btn = $('editBtn');
  if (btn) btn.textContent = editMode ? '편집 종료' : '편집';
  if (lastResult) renderResult(lastResult);
}

// 선택된 슬롯과 (targetSlotIdx, targetPos) 사이 스왑이 제한사항을 만족하는지
function isCompatibleSwap(targetSlotIdx, targetPos) {
  if (!selectedSlot) return false;
  if (selectedSlot.slotIdx === targetSlotIdx && selectedSlot.pos === targetPos) return false;
  const aP = lastResult.schedule[selectedSlot.slotIdx][selectedSlot.pos];
  const bP = lastResult.schedule[targetSlotIdx][targetPos];
  // aP 가 target slot 에 들어갈 수 있어야 함 (요일 제한 + 같은 슬롯 중복 금지)
  if (aP) {
    if (aP.restricted[targetSlotIdx]) return false;
    if (lastResult.schedule[targetSlotIdx].some((x, i) => x && x.id === aP.id && i !== targetPos)) return false;
  }
  // bP 가 selected slot 에 들어갈 수 있어야 함
  if (bP) {
    if (bP.restricted[selectedSlot.slotIdx]) return false;
    if (lastResult.schedule[selectedSlot.slotIdx].some((x, i) => x && x.id === bP.id && i !== selectedSlot.pos)) return false;
  }
  return true;
}

function performSwap(targetSlotIdx, targetPos) {
  if (!selectedSlot) return;
  const a = lastResult.schedule[selectedSlot.slotIdx];
  const b = lastResult.schedule[targetSlotIdx];
  const tmp = a[selectedSlot.pos];
  a[selectedSlot.pos] = b[targetPos];
  b[targetPos] = tmp;
  selectedSlot = null;
  recomputeAndRender();
}

function recomputeStats() {
  if (!lastResult) return;
  let emptySlots = 0;
  for (const day of lastResult.schedule) {
    emptySlots += SLOTS_PER_DAY - day.filter(Boolean).length;
  }
  // 부담(load) unit 재계산 (주말 슬롯 = 2 → 주말+평일 = 3)
  lastResult.assignCount = assignUnitsOf(lastResult.schedule);
  lastResult.emptySlots = emptySlots;
}

function recomputeAndRender() {
  recomputeStats();
  renderResult(lastResult);
}

function handleSlotClick(slotIdx, pos) {
  if (!editMode) return;
  if (!selectedSlot) {
    selectedSlot = { slotIdx, pos };
    renderResult(lastResult);
    return;
  }
  if (selectedSlot.slotIdx === slotIdx && selectedSlot.pos === pos) {
    selectedSlot = null;
    renderResult(lastResult);
    return;
  }
  if (isCompatibleSwap(slotIdx, pos)) {
    performSwap(slotIdx, pos);
  }
  // 비호환(swap-bad) 슬롯은 클릭 무시
}

function renderEditPanel() {
  const panel = $('editPanel');
  if (!panel) return;
  if (!editMode || !selectedSlot) { panel.style.display = 'none'; panel.innerHTML = ''; return; }
  panel.style.display = '';
  panel.innerHTML = '';

  const ts = TIME_SLOTS[selectedSlot.slotIdx];
  const currentP = lastResult.schedule[selectedSlot.slotIdx][selectedSlot.pos];

  const header = document.createElement('div');
  header.className = 'edit-panel-header';
  header.textContent = `${ts.label} 슬롯 ${selectedSlot.pos + 1} 편집 — 현재: ${currentP ? currentP.name : '미배정'}`;
  panel.appendChild(header);

  const help = document.createElement('div');
  help.className = 'edit-panel-help';
  help.textContent = '· 아래 인원을 누르면 이 자리에 배정됩니다.   · 일정 표의 초록 테두리 슬롯을 누르면 스왑.';
  panel.appendChild(help);

  // 제거 버튼 (배정된 슬롯에만)
  if (currentP) {
    const remRow = document.createElement('div');
    remRow.style.marginBottom = '8px';
    const rem = document.createElement('button');
    rem.className = 'btn';
    rem.style.cssText = 'background:#FEE2E2;color:var(--red);padding:6px 12px;font-weight:500;font-size:13px;';
    rem.textContent = '✕ ' + currentP.name + ' 제거';
    rem.addEventListener('click', () => {
      lastResult.schedule[selectedSlot.slotIdx][selectedSlot.pos] = null;
      selectedSlot = null;
      recomputeAndRender();
    });
    remRow.appendChild(rem);
    panel.appendChild(remRow);
  }

  // 후보 목록 — 그 슬롯에 제한 없는 인원, 같은 슬롯 다른 칸 중복 제외, 현재 인물 제외
  const candLabel = document.createElement('div');
  candLabel.style.cssText = 'font-size:11px;color:var(--muted);margin-bottom:6px;';
  candLabel.textContent = '이 자리에 넣을 수 있는 인원 (요일 제한 없음)';
  panel.appendChild(candLabel);

  const list = document.createElement('div');
  list.className = 'edit-candidates';
  const cands = people.filter(p =>
    !p.restricted[selectedSlot.slotIdx] &&
    (!currentP || p.id !== currentP.id) &&
    !lastResult.schedule[selectedSlot.slotIdx].some((x, i) => x && x.id === p.id && i !== selectedSlot.pos)
  );
  if (cands.length === 0) {
    const none = document.createElement('div');
    none.style.cssText = 'color:var(--muted);font-size:12px;';
    none.textContent = '가능한 인원이 없습니다.';
    list.appendChild(none);
  } else {
    for (const p of cands) {
      const chip = document.createElement('button');
      chip.className = 'cand-chip';
      chip.textContent = p.name;
      chip.addEventListener('click', () => {
        lastResult.schedule[selectedSlot.slotIdx][selectedSlot.pos] = p;
        selectedSlot = null;
        recomputeAndRender();
      });
      list.appendChild(chip);
    }
  }
  panel.appendChild(list);

  // 선택 취소
  const actions = document.createElement('div');
  actions.className = 'edit-panel-actions';
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-secondary';
  cancel.textContent = '선택 취소';
  cancel.addEventListener('click', () => { selectedSlot = null; renderResult(lastResult); });
  actions.appendChild(cancel);
  panel.appendChild(actions);
}

// 한 (요일, 시간대) 셀 — 슬롯 인덱스가 -1 이면 "—" (해당 시간대 없음, 토/일 아침 칸)
function buildShiftCell(slotIdx, r, trueCrossover) {
  const td = document.createElement('td');
  if (slotIdx < 0) {
    td.className = 'cell-na';
    td.textContent = '—';
    return td;
  }
  const slot = r.schedule[slotIdx];
  const filled = slot.filter(Boolean).length;
  if (filled === 0)            td.className = 'cell-empty';
  else if (filled < SLOTS_PER_DAY) td.className = 'cell-partial';
  else                         td.className = 'cell-full';

  const wrap = document.createElement('div');
  wrap.className = 'cell-chips';

  if (editMode) {
    // 편집 모드: 슬롯 position 별로 클릭 가능한 .slot-pos 요소 렌더
    for (let pos = 0; pos < SLOTS_PER_DAY; pos++) {
      wrap.appendChild(buildSlotPos(slotIdx, pos, r));
    }
  } else {
    // 보기 모드: 기존 통합 렌더 (chip + 미배정 블록 + 가능 인원 목록)
    const filledList = [];
    for (let s = 0; s < SLOTS_PER_DAY; s++) {
      const p = slot[s];
      if (!p) continue;
      filledList.push(p);
      const chip = document.createElement('span');
      const cnt = r.assignCount.get(p.id) || 0;
      const heavy = !!p.double && cnt >= 3;
      chip.className = 'person-chip' + (heavy ? ' crossover' : '');
      chip.textContent = p.name;
      wrap.appendChild(chip);
    }
    const emptyCount = SLOTS_PER_DAY - filledList.length;
    if (emptyCount > 0) {
      const block = document.createElement('span');
      block.className = 'unassigned-wrap';
      const label = document.createElement('span');
      label.className = 'unassigned';
      label.textContent = emptyCount > 1 ? `미배정 (${emptyCount})` : '미배정';
      block.appendChild(label);
      const cands = people.filter(p2 =>
        !p2.restricted[slotIdx] && !filledList.some(x => x.id === p2.id)
      );
      if (cands.length > 0) {
        const list = document.createElement('span');
        list.className = 'unassigned-cands';
        list.textContent = '가능: ' + cands.map(c => c.name).join(', ');
        block.appendChild(list);
      }
      wrap.appendChild(block);
    }
  }
  td.appendChild(wrap);
  return td;
}

// 편집 모드용 — 슬롯 position 1칸 (클릭 가능 + 선택/스왑 가능 테두리 표시)
function buildSlotPos(slotIdx, pos, r) {
  const p = lastResult.schedule[slotIdx][pos];
  const el = document.createElement('span');
  el.className = 'slot-pos';
  if (p) {
    el.classList.add('chip-wrap');
    const cnt = r.assignCount.get(p.id) || 0;
    if (!!p.double && cnt >= 3) el.classList.add('crossover');
    el.appendChild(document.createTextNode(p.name));
  } else {
    el.classList.add('empty-pos');
    el.appendChild(document.createTextNode('미배정'));
  }
  // 선택 / 스왑 가능 / 스왑 불가 테두리
  if (selectedSlot) {
    if (selectedSlot.slotIdx === slotIdx && selectedSlot.pos === pos) {
      el.classList.add('selected');
    } else if (isCompatibleSwap(slotIdx, pos)) {
      el.classList.add('swap-ok');
    } else {
      el.classList.add('swap-bad');
    }
  }
  el.addEventListener('click', () => handleSlotClick(slotIdx, pos));
  return el;
}

function renderResult(r) {
  $('result').style.display = '';
  const body = $('scheduleBody');
  body.innerHTML = '';

  // 평일 아침/저녁 칼럼 정렬:
  // 한 명이라도 겹치면, 그 사람이 같은 column 에 오도록 evening 두 슬롯을 swap.
  // 일반적으로 "현재 정렬 vs swap 정렬" 중 같은-column 일치 수가 더 많은 쪽 채택.
  function alignScore(m, e) {
    let s = 0;
    if (m[0] && e[0] && m[0].id === e[0].id) s++;
    if (m[1] && e[1] && m[1].id === e[1].id) s++;
    return s;
  }
  for (let i = 0; i < 10; i += 2) {
    const m = r.schedule[i];
    const e = r.schedule[i+1];
    if (!e[0] && !e[1]) continue;
    const cur = alignScore(m, e);
    const swp = alignScore(m, [e[1], e[0]]);
    if (swp > cur) [e[0], e[1]] = [e[1], e[0]];
  }

  // 주말 + 평일 둘 다 들어간 인원 (현재 정책에서는 mutual exclusion 으로 발생하지 않지만
  //  yellow chip 강조 로직이 이 set 을 사용하므로 계산은 유지)
  const weekdayIds = new Set();
  const weekendIds = new Set();
  for (let i = 0; i < SLOTS_COUNT; i++) {
    for (const p of r.schedule[i]) if (p) {
      if (i >= 10) weekendIds.add(p.id); else weekdayIds.add(p.id);
    }
  }
  const trueCrossover = new Set();
  for (const id of weekendIds) if (weekdayIds.has(id)) trueCrossover.add(id);

  // 한 행에 [요일 | 아침 | 저녁] — 월~금 5행 + 토 + 일 = 7행
  const WEEK_DAY_LABELS = ['월','화','수','목','금','토','일'];
  for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
    const tr = document.createElement('tr');
    const dayName = WEEK_DAY_LABELS[dayIdx];

    const dayTd = document.createElement('td');
    dayTd.className = 'day-label';
    dayTd.textContent = dayName;
    tr.appendChild(dayTd);

    // 평일: 아침 = 2*i, 저녁 = 2*i+1
    // 토 = 10, 일 = 11. 토/일은 아침 슬롯 없음 ("—" 표시).
    let morningIdx = -1, eveningIdx = -1;
    if (dayIdx < 5) {
      morningIdx = dayIdx * 2;
      eveningIdx = dayIdx * 2 + 1;
    } else {
      eveningIdx = 10 + (dayIdx - 5);
    }

    tr.appendChild(buildShiftCell(morningIdx, r, trueCrossover));
    tr.appendChild(buildShiftCell(eveningIdx, r, trueCrossover));
    body.appendChild(tr);
  }

  // 통계 카드
  const summary = $('summary');
  summary.innerHTML = '';
  function stat(label, value, cls) {
    const div = document.createElement('div');
    div.className = 'stat' + (cls ? ' ' + cls : '');
    div.innerHTML = `<div class="label">${label}</div><div class="value">${value}</div>`;
    summary.appendChild(div);
  }
  stat('미배정 슬롯', `${r.emptySlots}개`, r.emptySlots === 0 ? 'ok' : 'warn');
  stat('배정된 인원', `${r.assignCount.size}명`);

  // 우선순위로 제외된 인원
  const exDiv = $('exclusionList');
  exDiv.innerHTML = '';
  if (r.skipped.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'exclusion-list';
    const h = document.createElement('h4');
    h.textContent = '이번 주 미배정 인원 (우선순위 기반)';
    wrap.appendChild(h);
    const ul = document.createElement('ul');
    for (const s of r.skipped) {
      const li = document.createElement('li');
      const reason = s.reason === 'priority'
        ? `우선순위 ${s.person.priority} - 슬롯 초과로 제외`
        : `슬롯 초과로 부득이 제외 (우선순위 0)`;
      li.innerHTML = `<strong>${s.person.name}</strong> <span class="badge-skip">제외</span> <span style="color:var(--muted);font-size:12px;">${reason}</span>`;
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
    exDiv.appendChild(wrap);
  }

  // 제한 때문에 배정 실패
  const failDiv = $('failList');
  failDiv.innerHTML = '';
  if (r.failed.length > 0) {
    const wrap = document.createElement('div');
    wrap.className = 'fail-list';
    const h = document.createElement('h4');
    h.textContent = '배정 실패 인원 (요일 제한/충돌)';
    wrap.appendChild(h);
    const ul = document.createElement('ul');
    for (const f of r.failed) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>${f.person.name}</strong>: <span style="color:var(--muted);font-size:12px;">${f.reason}</span>`;
      ul.appendChild(li);
    }
    wrap.appendChild(ul);
    failDiv.appendChild(wrap);
  }

  // 편집 모드 패널
  renderEditPanel();

  // 결과 영역으로 스크롤 (편집 중에는 스크롤 점프 안 함)
  if (!editMode) $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderReadOnlySchedule(scheduleData) {
  const tbody    = $('latestScheduleBody');
  const emptyMsg = $('latestScheduleEmpty');
  tbody.innerHTML = '';
  if (!Array.isArray(scheduleData) || scheduleData.length === 0) {
    if (emptyMsg) emptyMsg.style.display = '';
    return;
  }
  if (emptyMsg) emptyMsg.style.display = 'none';
  // 월~금: 슬롯 쌍 (아침/저녁)
  for (let i = 0; i < 10; i += 2) {
    const morning = (scheduleData[i]   || []).filter(Boolean).map(p => p.name || p).join(', ') || '—';
    const evening = (scheduleData[i+1] || []).filter(Boolean).map(p => p.name || p).join(', ') || '—';
    const tr = document.createElement('tr');
    [TIME_SLOTS[i].day, morning, evening].forEach((t, ci) => {
      const td = document.createElement('td');
      td.textContent = t;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  }
  // 토·일: 단일 슬롯 (colspan=2)
  for (const idx of [10, 11]) {
    if (idx >= scheduleData.length) continue;
    const names = (scheduleData[idx] || []).filter(Boolean).map(p => p.name || p).join(', ') || '—';
    const tr = document.createElement('tr');
    const tdD = document.createElement('td'); tdD.textContent = TIME_SLOTS[idx].day;
    const tdN = document.createElement('td'); tdN.colSpan = 2; tdN.textContent = names;
    tr.appendChild(tdD); tr.appendChild(tdN);
    tbody.appendChild(tr);
  }
}
