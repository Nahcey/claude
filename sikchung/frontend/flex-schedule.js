'use strict';
// 새로운 일정 (Flex Schedule) — 21슬롯, 가변 demand
// 의존: constants.js($, FLEX_SLOTS_COUNT), api.js(API)
//       main.js(people, _apiMode, _currentUser, getISOWeekId, refreshLatestSchedule)
// 로드 순서: main.js 다음에 로드돼야 한다.

const _FLEX_DAYS   = ['월', '화', '수', '목', '금', '토', '일'];
const _FLEX_SHIFTS = ['아침', '점심', '저녁'];
const _FLEX_TOTAL  = FLEX_SLOTS_COUNT;

let _flexDemand       = Array(_FLEX_TOTAL).fill(1);
let _flexState        = null;    // {schedule, demand, shortage, optimal}
let _flexEditMode     = false;
let _flexSelectedSlot = null;    // {slotIdx, pos}

function _buildFlexDemandGrid() {
  const container = $('flexDemandGrid');
  container.innerHTML = '';
  const table = document.createElement('table');
  table.style.cssText = 'border-collapse:collapse; width:100%; margin-top:4px;';

  const thead = table.createTHead();
  const hr = thead.insertRow();
  ['요일', '아침', '점심', '저녁'].forEach((h, i) => {
    const th = document.createElement('th');
    th.textContent = h;
    th.style.cssText = 'padding:4px 8px; text-align:center; font-size:12px; font-weight:600; border-bottom:1px solid var(--border); color:var(--muted);';
    if (i === 0) th.style.textAlign = 'left';
    hr.appendChild(th);
  });

  const tbody = table.createTBody();
  for (let d = 0; d < 7; d++) {
    const tr = tbody.insertRow();
    const tdLabel = tr.insertCell();
    tdLabel.textContent = _FLEX_DAYS[d];
    tdLabel.style.cssText = 'padding:5px 8px; font-size:13px; font-weight:600;';
    for (let sh = 0; sh < 3; sh++) {
      const s = d * 3 + sh;
      const td = tr.insertCell();
      td.style.cssText = 'padding:3px 4px; text-align:center;';
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.min = 0; inp.max = 20;
      inp.value = _flexDemand[s];
      inp.dataset.slot = s;
      inp.style.cssText = 'width:52px; text-align:center; padding:3px 4px; font-size:13px;';
      inp.addEventListener('input', () => {
        const v = parseInt(inp.value, 10);
        _flexDemand[s] = (isNaN(v) || v < 0) ? 0 : v;
      });
      td.appendChild(inp);
    }
  }
  container.appendChild(table);
}

function _openFlexModal() {
  _buildFlexDemandGrid();
  $('flexModalOverlay').style.display = 'flex';
}

function _closeFlexModal() {
  $('flexModalOverlay').style.display = 'none';
}

// ── Flex 편집 헬퍼 ────────────────────────────────────────────────────────────

function _buildFlexState(raw, demand) {
  const byId = new Map(people.map(p => [p.id, p]));
  const schedule = Array.from({length: _FLEX_TOTAL}, (_, s) => {
    const rawIds = raw.schedule[s] !== undefined ? raw.schedule[s]
                 : (raw.schedule[String(s)] || []);
    const arr = Array(Math.max(demand[s], 0)).fill(null);
    let pos = 0;
    for (const id of rawIds) {
      if (pos >= arr.length) break;
      arr[pos++] = byId.get(id) || null;
    }
    return arr;
  });
  const shortage = {};
  for (const [k, v] of Object.entries(raw.shortage || {})) shortage[parseInt(k, 10)] = v;
  return { schedule, demand: demand.slice(), shortage, optimal: raw.optimal };
}

function _recomputeFlexShortage() {
  if (!_flexState) return;
  const shortage = {};
  for (let s = 0; s < _FLEX_TOTAL; s++) {
    const d = _flexState.demand[s];
    if (!d) continue;
    const filled = _flexState.schedule[s].filter(Boolean).length;
    if (filled < d) shortage[s] = d - filled;
  }
  _flexState.shortage = shortage;
}

const _flexEngine = createSwapEngine({
  getSchedule:   () => _flexState.schedule,
  getSelection:  () => _flexSelectedSlot,
  setSelection:  (s) => { _flexSelectedSlot = s; },
  isEditMode:    () => _flexEditMode,
  capacityOf:    (s) => _flexState.demand[s],
  canPlace:      () => true,
  slotLabel:     (s) => _FLEX_DAYS[Math.floor(s / 3)] + ' ' + _FLEX_SHIFTS[s % 3],
  panelId:       'flexEditPanel',
  afterMutation: () => { _recomputeFlexShortage(); _renderFlexTable(); },
  rerender:      () => _renderFlexTable(),
});

function _renderFlexTable() {
  if (!_flexState) return;
  const tbody = $('flexScheduleBody');
  tbody.innerHTML = '';

  const assignCount = {};
  for (let s = 0; s < _FLEX_TOTAL; s++)
    for (const p of _flexState.schedule[s])
      if (p) assignCount[p.id] = (assignCount[p.id] || 0) + 1;

  for (let d = 0; d < 7; d++) {
    const tr = document.createElement('tr');
    const tdDay = document.createElement('td');
    tdDay.textContent = _FLEX_DAYS[d];
    tdDay.style.fontWeight = '600';
    tr.appendChild(tdDay);
    for (let sh = 0; sh < 3; sh++) {
      const s = d * 3 + sh;
      const d_s = _flexState.demand[s];
      const td = document.createElement('td');
      if (!d_s) {
        td.textContent = '—'; td.style.color = 'var(--muted)';
      } else {
        const slot = _flexState.schedule[s];
        const filled = slot.filter(Boolean).length;
        td.className = filled === 0 ? 'cell-empty' : filled < d_s ? 'cell-partial' : 'cell-full';
        const wrap = document.createElement('div');
        wrap.className = 'cell-chips';
        if (_flexEditMode) {
          for (let pos = 0; pos < d_s; pos++) wrap.appendChild(_flexEngine.buildSlotPos(s, pos));
        } else {
          const names = slot.filter(Boolean).map(p => p.name);
          if (names.length) {
            const c = document.createElement('span');
            c.className = 'person-chip';
            c.textContent = names.join(', ');
            wrap.appendChild(c);
          } else {
            const u = document.createElement('span');
            u.className = 'unassigned';
            u.textContent = '미배정';
            wrap.appendChild(u);
          }
          const sh_n = _flexState.shortage[s] || 0;
          if (sh_n > 0) {
            const badge = document.createElement('span');
            badge.textContent = ' 부족 ' + sh_n;
            badge.style.cssText = 'font-size:11px;color:#DC2626;';
            wrap.appendChild(badge);
          }
        }
        td.appendChild(wrap);
      }
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  const totalSh = Object.values(_flexState.shortage).reduce((a, b) => a + b, 0);
  const summaryEl = $('flexSummary');
  summaryEl.innerHTML = '';
  const sp = document.createElement('p');
  sp.style.cssText = 'font-size:13px;color:var(--muted);margin:0 0 4px;';
  sp.textContent = '총 부족: ' + totalSh + '슬롯';
  summaryEl.appendChild(sp);
  const byName = new Map(people.map(p => [p.id, p.name]));
  const assigned = Object.entries(assignCount);
  if (assigned.length) {
    const sp2 = document.createElement('p');
    sp2.style.cssText = 'font-size:12px;color:var(--muted);margin:0;';
    sp2.textContent = '배정: ' + assigned.map(([id, cnt]) => (byName.get(parseInt(id, 10)) || id) + '=' + cnt).join(', ');
    summaryEl.appendChild(sp2);
  }

  _flexEngine.renderEditPanel();
}

function _toggleFlexEditMode() {
  _flexEditMode = !_flexEditMode;
  _flexSelectedSlot = null;
  const btn = $('flexEditBtn');
  if (btn) btn.textContent = _flexEditMode ? '편집 종료' : '편집';
  if (_flexState) _renderFlexTable();
}

async function _runFlexGenerate() {
  const btn = $('flexGenerateBtn');
  btn.disabled = true; btn.textContent = '생성 중…';
  try {
    const eligible = people
      .filter(p => !p.excluded)
      .map(p => ({
        id:         p.id,
        name:       p.name,
        restricted: Array(_FLEX_TOTAL).fill(false),
        double:     !!p.double,
        priority:   p.priority || 0,
        group:      p.group || null,
        rookie:     !!p.rookie,
      }));
    if (eligible.length === 0) { alert('배정 가능한 인원이 없습니다.'); return; }

    const raw = await API.generateFlexSchedule(eligible, _flexDemand.slice());
    _closeFlexModal();
    _renderFlexResult(raw);
  } catch (e) {
    alert('생성 실패: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '생성';
  }
}

function _renderFlexResult(raw) {
  _flexState = _buildFlexState(raw, _flexDemand.slice());
  _flexEditMode = false;
  _flexSelectedSlot = null;
  const editBtn = $('flexEditBtn');
  if (editBtn) editBtn.textContent = '편집';

  const optSpan = $('flexOptimalStatus');
  optSpan.textContent = raw.optimal ? '최적해' : '준최적해';
  optSpan.style.color = raw.optimal ? 'var(--green)' : 'var(--muted)';

  if (_apiMode && _currentUser && _currentUser.isLeader) {
    $('flexSaveScheduleRow').style.display = '';
    $('flexSaveScheduleStatus').textContent = '';
  }

  $('flexResult').style.display = '';
  _renderFlexTable();
  $('flexResult').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

$('flexScheduleBtn').addEventListener('click', () => {
  if (people.length === 0) { alert('인원이 없습니다.'); return; }
  _openFlexModal();
});
$('flexModalClose').addEventListener('click', _closeFlexModal);
$('flexModalOverlay').addEventListener('click', (e) => {
  if (e.target === $('flexModalOverlay')) _closeFlexModal();
});
$('flexBulkApplyBtn').addEventListener('click', () => {
  const v = parseInt($('flexBulkInput').value, 10);
  if (isNaN(v) || v < 0) return;
  _flexDemand = Array(_FLEX_TOTAL).fill(v);
  _buildFlexDemandGrid();
});
$('flexGenerateBtn').addEventListener('click', _runFlexGenerate);
$('flexEditBtn').addEventListener('click', _toggleFlexEditMode);
$('flexRegenBtn').addEventListener('click', () => {
  _flexEditMode = false; _flexSelectedSlot = null;
  $('flexResult').style.display = 'none';
  _openFlexModal();
});
$('flexBackBtn').addEventListener('click', () => {
  _flexEditMode = false; _flexSelectedSlot = null;
  $('flexResult').style.display = 'none';
});
$('flexSaveScheduleBtn').addEventListener('click', async () => {
  if (!_apiMode || !_currentUser || !_currentUser.isLeader || !_flexState) return;
  const weekId = getISOWeekId();
  const scheduleData = _flexState.schedule.map(slot =>
    slot.filter(Boolean).map(p => ({ sub: p.sub || null, name: p.name }))
  );
  const btn = $('flexSaveScheduleBtn');
  const statusEl = $('flexSaveScheduleStatus');
  btn.disabled = true; btn.textContent = '저장 중…';
  statusEl.textContent = '';
  try {
    await API.postSchedule(weekId, scheduleData);
    statusEl.textContent = `저장됨 (${weekId})`;
    statusEl.style.color = 'var(--green)';
    try { await refreshLatestSchedule(); } catch (_) {}
  } catch (e) {
    statusEl.textContent = '저장 실패: ' + e.message;
    statusEl.style.color = 'var(--red)';
  } finally {
    btn.disabled = false; btn.textContent = '확정 저장';
  }
});
