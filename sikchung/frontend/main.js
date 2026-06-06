'use strict';
// [엔트리/와이어링] 세션 상태 + 이벤트 바인딩 + API 연동 + 부팅.
// 마지막에 로드. 전역 상태: _currentUser, _apiMode.

let _currentUser = null; // Permissions.getCurrentUser() 결과 (로그인 시)
let _apiMode = false;    // true: 서버 연동 모드

// ============================================================
// 일정 생성 — API 서버 연동 (POST /schedule/generate)
// ============================================================
async function generate() {
  const eligible = people.filter(p => !p.excluded);
  const raw = await API.generateSchedule(eligible);

  // 서버 응답은 id 기반 → 로컬 people 배열로 person 객체 복원
  const byId = new Map(people.map(p => [p.id, p]));

  const schedule = raw.schedule.map(slot =>
    slot.map(id => (id !== null && id !== undefined) ? (byId.get(id) || null) : null)
  );
  const skipped = (raw.skipped || [])
    .map(s => ({ person: byId.get(s.id), reason: s.reason }))
    .filter(s => s.person);
  const failed = (raw.failed || [])
    .map(f => ({ person: byId.get(f.id), reason: f.reason }))
    .filter(f => f.person);
  // assignCount: {"str_id": units} → Map(num_id → units)
  const assignCount = new Map(
    Object.entries(raw.assignCount || {}).map(([k, v]) => [parseInt(k, 10), v])
  );

  lastResult = {
    schedule,
    skipped,
    failed,
    fullDays:    raw.fullDays   || 0,
    emptySlots:  raw.emptySlots || 0,
    assignCount,
    active:      eligible,
    optimal:     raw.optimal,
  };
  renderResult(lastResult);

  const optSpan = $('optimalStatus');
  if (optSpan) {
    if (typeof raw.optimal === 'boolean') {
      optSpan.textContent  = raw.optimal ? '최적해' : '준최적해';
      optSpan.style.color  = raw.optimal ? 'var(--green)' : 'var(--muted)';
    } else {
      optSpan.textContent = '';
    }
  }
}

// 생성 중 상태 표시 — 버튼 텍스트/disabled + setTimeout 으로 UI 먼저 그리고 무거운 작업 실행
function runGenerate() {
  const gBtn = $('generateBtn');
  const rBtn = $('regenBtn');
  const gOriginal = gBtn.textContent;
  const rOriginal = rBtn.textContent;
  gBtn.disabled = true; gBtn.textContent = '생성 중…';
  rBtn.disabled = true; rBtn.textContent = '생성 중…';
  // 두 단계 rAF 후 setTimeout 으로 paint 보장
  requestAnimationFrame(() => requestAnimationFrame(() => {
    setTimeout(async () => {
      try { await generate(); }
      catch (e) { alert('일정 생성 실패: ' + e.message); }
      finally {
        gBtn.disabled = false; gBtn.textContent = gOriginal;
        rBtn.disabled = false; rBtn.textContent = rOriginal;
        if (_apiMode && _currentUser && _currentUser.isLeader && lastResult) {
          $('saveScheduleRow').style.display = '';
          $('saveScheduleStatus').textContent = '';
        }
      }
    }, 0);
  }));
}

$('generateBtn').addEventListener('click', () => {
  if (people.length === 0) { alert('인원이 없습니다. 먼저 인원을 추가하세요.'); return; }
  if (maxCapacity() < TOTAL_SLOTS) {
    if (!confirm(`최대 ${maxCapacity()}회 배정 가능합니다. 일부 슬롯이 미배정될 수 있는데, 그래도 생성하시겠습니까?`)) return;
  }
  runGenerate();
});
$('regenBtn').addEventListener('click', () => {
  // 재생성 시 편집 모드 자동 해제
  editMode = false; selectedSlot = null;
  $('editBtn').textContent = '편집';
  runGenerate();
});
$('editBtn').addEventListener('click', toggleEditMode);
$('backBtn').addEventListener('click', () => {
  editMode = false; selectedSlot = null;
  $('editBtn').textContent = '편집';
  $('result').style.display = 'none';
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

// 주 2회 토글 — 즉시 반영
$('modalDoubleRow').addEventListener('click', () => {
  const p = editingPerson();
  if (!p) return;
  p.double = !p.double;
  modalDouble.classList.toggle('on', p.double);
  autoSave();
});

// 신병 토글 — 즉시 반영
$('modalRookieRow').addEventListener('click', () => {
  const p = editingPerson();
  if (!p) return;
  p.rookie = !p.rookie;
  modalRookie.classList.toggle('on', p.rookie);
  autoSave();
});

// 우선순위 입력 — 즉시 반영
modalPriority.addEventListener('input', () => {
  const p = editingPerson();
  if (!p) return;
  let v = parseInt(modalPriority.value, 10);
  if (isNaN(v) || v < 0) v = 0;
  if (v > 99) v = 99;
  p.priority = v;
  autoSave();
});

// 일정 제외 토글
$('modalExcluded').addEventListener('click', () => {
  const p = editingPerson();
  if (!p) return;
  p.excluded = !p.excluded;
  $('modalExcluded').classList.toggle('on', p.excluded);
  autoSave();
});

// 해당 인원 설정만 초기화 (모달은 열린 상태 유지)
// 우선순위는 디폴트 명단의 위치 기반 값으로 복원, 커스텀 추가 인원은 0
$('modalReset').addEventListener('click', () => {
  const p = editingPerson();
  if (!p) return;
  if (!confirm('이 인원의 설정(제한 시간 슬롯 · 주 2회 · 신병)을 모두 초기화합니다. 계속하시겠습니까?')) return;
  const defaultIdx = DEFAULT_NAMES.indexOf(p.name);
  const defaultPriority = defaultIdx >= 0 ? (DEFAULT_NAMES.length - defaultIdx) : 0;
  p.restricted = defaultRestrictedFor(p.name); // 12칸 배열
  p.double = false; // index2 디폴트: 주 2회 OFF
  p.priority = defaultPriority;
  p.rookie = false;
  renderModalBody();
  autoSave();
});

// 닫기 (X / 푸터 / 배경 / ESC) — 자동 저장이므로 단순히 모달만 닫음
$('modalClose').addEventListener('click', closeEditor);
$('modalDone').addEventListener('click', closeEditor);
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) closeEditor();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOverlay.classList.contains('open')) closeEditor();
});

// ============================================================
// 인원 추가 / 초기화
// ============================================================
$('addBtn').addEventListener('click', () => {
  if (_apiMode) {
    alert('API 모드에서는 인원 추가를 지원하지 않습니다. 관리자 도구에서 추가하세요.');
    return;
  }
  const input = $('newName');
  const name = input.value.trim();
  if (!name) { input.focus(); return; }
  if (people.some(p => p.name === name)) {
    alert('이미 같은 이름이 존재합니다.');
    return;
  }
  people.push({
    id: uid(),
    name,
    restricted: defaultRestrictedFor(name), // 12칸 배열
    double: false, // index2 디폴트: 주 2회 OFF
    priority: 0,
    group: DEFAULT_GROUPS[name] || null,
    rookie: false,
    excluded: false,
  });
  input.value = '';
  savePeople();
  renderPeople();
  updateStatus();
});
$('newName').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('addBtn').click();
});

$('resetBtn').addEventListener('click', () => {
  if (_apiMode) {
    if (!confirm('인원 설정을 서버에서 다시 불러옵니다. 계속하시겠습니까?')) return;
    (async () => {
      try {
        if (_currentUser && _currentUser.isLeader) {
          const members = await API.getMembers();
          people = _mapMembersTopeople(members);
          nextId = people.length + 1;
        } else if (_currentUser) {
          const me = await API.getMe();
          people = [_mapMeToPersonEntry(me)];
          nextId = 2;
        }
        renderPeople();
        updateStatus();
      } catch (e) { alert('서버에서 불러오기 실패: ' + e.message); }
    })();
    $('result').style.display = 'none';
    return;
  }
  if (!confirm('인원과 설정을 모두 초기화합니다. 계속하시겠습니까?')) return;
  initPeople();
  savePeople();
  renderPeople();
  updateStatus();
  $('result').style.display = 'none';
});

// ============================================================
// 헤더 우상단 "updated: YYYY-MM-DD" — 파일이 변경될 때마다 아래 상수를
// 그 시점 한국 표준시(KST) 날짜로 직접 수정해서 유지한다.
// ============================================================
const UPDATED_AT = '2026-06-06'; // KST, HTML 파일 변경 시 함께 갱신
(function showUpdated() {
  $('updatedLabel').textContent = `updated: ${UPDATED_AT}`;
})();

// ============================================================
// API 연동 헬퍼
// ============================================================
function _mapMembersTopeople(members) {
  return (members || []).map((m, i) => {
    const p = normalizePerson({ ...m, id: i + 1 });
    p.sub = m.sub;
    p.updatedAt = m.updatedAt;
    return p;
  });
}

function _mapMeToPersonEntry(me) {
  const p = normalizePerson({ ...me, id: 1 });
  p.sub = _currentUser.sub;
  p.updatedAt = me.updatedAt;
  // displayName(한글 이름)을 본인 카드 이름으로 사용 (생성 시점에 박혀있음)
  if (!p.name) p.name = _currentUser.displayName || _currentUser.username || '';
  return p;
}

function showAuthBar(user) {
  const roleName  = user.isAdmin ? '관리자' : user.isLeader ? '분대장' : '분대원';
  const roleColor = user.isAdmin ? '#7C3AED' : user.isLeader ? 'var(--primary)' : 'var(--green)';
  $('userDisplayName').textContent = user.displayName || user.username;
  $('userRoleBadge').textContent   = roleName;
  $('userRoleBadge').style.background = roleColor;
  $('authBar').style.display = 'flex';
  $('loginBtn').style.display = 'none';
}

function getISOWeekId(d) {
  d = d || new Date();
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  utc.setUTCDate(utc.getUTCDate() + 4 - (utc.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((utc - yearStart) / 86400000 + 1) / 7);
  return utc.getUTCFullYear() + '-' + String(weekNo).padStart(2, '0');
}

async function refreshLatestSchedule() {
  const latest = await API.getLatestSchedule();
  if (latest && latest.weekId) {
    $('latestWeekId').textContent = '(' + latest.weekId + ')'
      + (latest.generatedAt ? ' · 생성 ' + fmtKST(latest.generatedAt) : '');
    renderReadOnlySchedule(latest.scheduleData);
  }
}

// ============================================================
// 확정 저장 버튼
// ============================================================
$('saveScheduleBtn').addEventListener('click', async () => {
  if (!_apiMode || !_currentUser || !_currentUser.isLeader || !lastResult) return;
  const weekId = getISOWeekId();
  const scheduleData = lastResult.schedule.map(slot =>
    slot.map(p => p ? { sub: p.sub || null, name: p.name } : null)
  );
  const btn = $('saveScheduleBtn');
  const statusEl = $('saveScheduleStatus');
  btn.disabled = true; btn.textContent = '저장 중…';
  statusEl.textContent = '';
  try {
    await API.postSchedule(weekId, scheduleData);
    statusEl.textContent = `저장됨 (${weekId})`;
    statusEl.style.color = 'var(--green)';
    // 저장 후 최신 일정 카드 갱신
    try { await refreshLatestSchedule(); } catch (_) {}
  } catch (e) {
    statusEl.textContent = '저장 실패: ' + e.message;
    statusEl.style.color = 'var(--red)';
  } finally {
    btn.disabled = false; btn.textContent = '확정 저장';
  }
});

// ============================================================
// 최신 일정 수정 버튼 (분대장/관리자 전용)
// ============================================================
$('editLatestBtn').addEventListener('click', async () => {
  if (!_apiMode || !_currentUser || !_currentUser.isLeader) return;
  const btn = $('editLatestBtn');
  btn.disabled = true; btn.textContent = '불러오는 중…';
  try {
    const latest = await API.getLatestSchedule();
    if (!latest || !latest.scheduleData || latest.scheduleData.length === 0) {
      alert('저장된 일정이 없습니다.');
      return;
    }
    // scheduleData → lastResult.schedule 복원 (people 기준 매칭)
    const byName = new Map(people.map(p => [p.name, p]));
    const bySub  = new Map(people.filter(p => p.sub).map(p => [p.sub, p]));
    let orphanId = -1;
    const schedule = latest.scheduleData.map(slot =>
      (slot || []).map(entry => {
        if (!entry) return null;
        const matched = (entry.sub && bySub.get(entry.sub)) || byName.get(entry.name);
        if (matched) return matched;
        // 명단에 없는 인원: 이름만 유지, 수정 시 제거/교체 가능
        return { id: orphanId--, name: entry.name, restricted: Array(SLOTS_COUNT).fill(false), double: false, priority: 0, excluded: false };
      })
    );
    while (schedule.length < SLOTS_COUNT) schedule.push([null, null]);

    const assignCount = assignUnitsOf(schedule);
    lastResult = { schedule, skipped: [], failed: [], fullDays: 0, emptySlots: 0, assignCount, active: people };

    editMode = false; selectedSlot = null;
    $('editBtn').textContent = '편집';
    $('saveScheduleRow').style.display = '';
    $('saveScheduleStatus').textContent = '';
    const optSpanEdit = $('optimalStatus');
    if (optSpanEdit) optSpanEdit.textContent = '';
    renderResult(lastResult);
    $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    alert('일정 불러오기 실패: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '수정';
  }
});

// ============================================================
// 최신 일정 삭제 버튼 (분대장/관리자 전용)
// ============================================================
$('deleteLatestBtn').addEventListener('click', async () => {
  if (!_apiMode || !_currentUser || !_currentUser.isLeader) return;
  if (!confirm('최신 청소 일정을 삭제합니다. 되돌릴 수 없습니다. 계속하시겠습니까?')) return;
  const btn = $('deleteLatestBtn');
  btn.disabled = true; btn.textContent = '삭제 중…';
  try {
    await API.deleteSchedule();
    // 최신 일정 영역 초기화
    $('latestWeekId').textContent = '';
    $('latestScheduleBody').innerHTML = '';
    const emptyMsg = $('latestScheduleEmpty');
    if (emptyMsg) emptyMsg.style.display = '';
  } catch (e) {
    alert('삭제 실패: ' + e.message);
  } finally {
    btn.disabled = false; btn.textContent = '삭제';
  }
});

// ============================================================
// 부팅 — 인증 확인 후 역할에 따라 API 또는 localStorage 사용
// ============================================================
async function boot() {
  // OAuth 콜백 처리 (?code= 파라미터)
  // wasCallback: 콜백 처리 여부 (true면 이미 토큰 교환 시도, 자동 리다이렉트 금지)
  let wasCallback = false;
  if (window.Auth) {
    try { wasCallback = !!(await Auth.handleCallback()); }
    catch (e) { console.error('[boot] callback error:', e); wasCallback = true; }
  }

  // 비로그인 상태 처리
  // 우선순위: ①콜백 중 → ②로그아웃 플래그 있음 → ③첫 방문(자동 리다이렉트)
  if (!window.Auth || !Auth.isLoggedIn()) {
    const loggedOutFlag = localStorage.getItem('sikchung_logged_out');
    console.log('[boot] not logged in | loggedOutFlag:', loggedOutFlag, '| wasCallback:', wasCallback);
    $('loginBtn').style.display = '';
    $('loginBtn').addEventListener('click', () => Auth && Auth.login());
    // 비로그인: 인원 설정·일정 영역 숨김
    $('peopleSection').style.display = 'none';
    $('generateSection').style.display = 'none';
    $('latestScheduleSection').style.display = 'none';
    $('result').style.display = 'none';
    if (!loggedOutFlag && window.Auth) {
      Auth.login();
    } else if (!loggedOutFlag) {
      // 로그아웃 후 or 콜백 실패: 로그인 버튼만 표시 (자동 리다이렉트 없음)
      // 플래그는 storeTokens()(로그인 성공 시)에서 제거됨
      console.log('[boot] post-logout or failed callback → show login button only');
    }
    return;
  }

  // 로그인 상태
  _apiMode = true;
  _currentUser = Permissions.getCurrentUser();
  showAuthBar(_currentUser);
  $('logoutBtn').addEventListener('click', () => {
    Auth.logout();
  });
  $('loginBtn').addEventListener('click', () => Auth.login());
  $('addRow').style.display = 'none'; // 인원 추가는 관리자 도구에서

  if (_currentUser.isLeader) {
    // 리더/관리자: 전체 인원 목록 로드
    try {
      const members = await API.getMembers();
      people = _mapMembersTopeople(members);
      nextId = people.length + 1;
    } catch (e) {
      console.error('[boot] getMembers:', e);
      alert('인원 목록 불러오기 실패: ' + e.message);
    }
    renderPeople();
    updateStatus();
    // 새로운 일정 버튼 노출 (leader+) — API 호출 전 즉시 표시
    $('flexScheduleBtn').style.display = '';

    // 최신 일정 표시 + 수정/삭제 버튼 노출
    $('latestScheduleSection').style.display = '';
    $('editLatestBtn').style.display = '';
    $('deleteLatestBtn').style.display = '';
    try { await refreshLatestSchedule(); } catch (e) { console.error('[boot] getLatestSchedule:', e); }

    // 로그 섹션은 admin 에게만 노출
    if (_currentUser.isAdmin) {
      $('auditSection').style.display = '';
    }
  } else {
    // 일반 멤버: 자기 카드 + 최신 일정
    $('generateSection').style.display = 'none';
    $('latestScheduleSection').style.display = '';
    // 카드 헤딩을 멤버용으로 변경
    const cardH2 = document.querySelector('.card h2');
    if (cardH2) { cardH2.innerHTML = '내 설정'; }
    $('personCount') && ($('personCount').style.display = 'none');
    try {
      const me = await API.getMe();
      people = [_mapMeToPersonEntry(me)];
      nextId = 2;
    } catch (e) { console.error('[boot] getMe:', e); }
    try { await refreshLatestSchedule(); } catch (e) { console.error('[boot] getLatestSchedule:', e); }
    renderPeople();
    updateStatus();
  }
}

// ============================================================
// 로그 (admin 전용)
// ============================================================
const AUDIT_ACTION_LABELS = {
  FLEX_SCHEDULE_GENERATE: '유연 일정 생성',
  SCHEDULE_GENERATE: '일정 생성',
  SCHEDULE_SAVE:     '일정 저장',
  SCHEDULE_DELETE:   '일정 삭제',
  MEMBER_UPDATE:     '멤버 수정',
  ME_UPDATE:         '본인 수정',
  USER_CREATE:       '사용자 생성',
  USER_DELETE:       '사용자 삭제',
  USER_ROLE_CHANGE:  '역할 변경',
};

let _auditCursor = null;

// sub 뒤 8자리 단축 표시 (sub→name 매핑은 현재 없음)
function shortSub(sub) {
  if (!sub) return '—';
  return sub.length > 8 ? '…' + sub.slice(-8) : sub;
}

// detail 객체를 한 줄 요약 문자열로 (대용량 필드는 개수로 축약)
function summarizeAuditDetail(detail) {
  if (!detail || typeof detail !== 'object') return '';
  const parts = [];
  if (detail.weekId)       parts.push('주차 ' + detail.weekId);
  if (detail.username)     parts.push(detail.username);
  if (detail.role)         parts.push('역할 ' + detail.role);
  if (detail.newRole)      parts.push('→ ' + detail.newRole);
  if (detail.optimal !== undefined) parts.push(detail.optimal ? '최적' : '비최적');
  if (detail.skippedCount !== undefined) parts.push('미배정 ' + detail.skippedCount);
  if (Array.isArray(detail.changedFields)) parts.push('변경: ' + detail.changedFields.join(', '));
  return parts.join(' · ');
}

function appendAuditRows(items) {
  const tbody = $('auditBody');
  for (const it of items) {
    const tr = document.createElement('tr');
    const cells = [
      fmtKST(it.timestamp),
      AUDIT_ACTION_LABELS[it.action] || it.action,
      shortSub(it.actorSub) + (it.actorRole ? ' (' + it.actorRole + ')' : ''),
      it.targetSub ? shortSub(it.targetSub) : '—',
      summarizeAuditDetail(it.detail),
    ];
    for (const text of cells) {
      const td = document.createElement('td');
      td.textContent = text;
      td.style.fontSize = '12px';
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }
}

async function loadAuditLogs(reset) {
  const btnLoad = $('auditLoadBtn');
  const btnMore = $('auditMoreBtn');
  const statusEl = $('auditStatus');
  if (reset) {
    $('auditBody').innerHTML = '';
    _auditCursor = null;
  }
  btnLoad.disabled = true; btnMore.disabled = true;
  statusEl.textContent = '불러오는 중…';
  try {
    const { items, nextCursor } = await API.getAuditLogs(50, _auditCursor);
    appendAuditRows(items || []);
    _auditCursor = nextCursor;
    $('auditMoreBtn').style.display = nextCursor ? '' : 'none';
    const empty = ($('auditBody').children.length === 0);
    $('auditEmpty').style.display = empty ? '' : 'none';
    statusEl.textContent = '';
  } catch (e) {
    statusEl.textContent = '불러오기 실패: ' + e.message;
    statusEl.style.color = 'var(--red)';
  } finally {
    btnLoad.disabled = false; btnMore.disabled = false;
  }
}

$('auditLoadBtn').addEventListener('click', () => loadAuditLogs(true));
$('auditMoreBtn').addEventListener('click', () => loadAuditLogs(false));

// ============================================================
// 새로운 일정 (Flex Schedule) — 21슬롯, 가변 demand
// ============================================================
const _FLEX_DAYS   = ['월', '화', '수', '목', '금', '토', '일'];
const _FLEX_SHIFTS = ['아침', '점심', '저녁'];
const _FLEX_TOTAL  = 21;

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

function _isFlexCompatibleSwap(targetSlotIdx, targetPos) {
  if (!_flexSelectedSlot) return false;
  const { slotIdx, pos } = _flexSelectedSlot;
  if (slotIdx === targetSlotIdx && pos === targetPos) return false;
  const aP = _flexState.schedule[slotIdx][pos];
  const bP = _flexState.schedule[targetSlotIdx][targetPos];
  if (aP && _flexState.schedule[targetSlotIdx].some((x, i) => x && x.id === aP.id && i !== targetPos)) return false;
  if (bP && _flexState.schedule[slotIdx].some((x, i) => x && x.id === bP.id && i !== pos)) return false;
  return true;
}

function _performFlexSwap(targetSlotIdx, targetPos) {
  if (!_flexSelectedSlot) return;
  const { slotIdx, pos } = _flexSelectedSlot;
  const a = _flexState.schedule[slotIdx];
  const b = _flexState.schedule[targetSlotIdx];
  [a[pos], b[targetPos]] = [b[targetPos], a[pos]];
  _flexSelectedSlot = null;
  _recomputeFlexShortage();
  _renderFlexTable();
}

function _handleFlexSlotClick(slotIdx, pos) {
  if (!_flexEditMode) return;
  if (!_flexSelectedSlot) {
    _flexSelectedSlot = { slotIdx, pos };
    _renderFlexTable();
    return;
  }
  if (_flexSelectedSlot.slotIdx === slotIdx && _flexSelectedSlot.pos === pos) {
    _flexSelectedSlot = null;
    _renderFlexTable();
    return;
  }
  if (_isFlexCompatibleSwap(slotIdx, pos)) _performFlexSwap(slotIdx, pos);
}

function _buildFlexSlotPos(slotIdx, pos) {
  const p = _flexState.schedule[slotIdx][pos];
  const el = document.createElement('span');
  el.className = 'slot-pos';
  if (p) { el.classList.add('chip-wrap'); el.textContent = p.name; }
  else   { el.classList.add('empty-pos'); el.textContent = '미배정'; }
  if (_flexSelectedSlot) {
    if (_flexSelectedSlot.slotIdx === slotIdx && _flexSelectedSlot.pos === pos)
      el.classList.add('selected');
    else if (_isFlexCompatibleSwap(slotIdx, pos))
      el.classList.add('swap-ok');
    else
      el.classList.add('swap-bad');
  }
  el.addEventListener('click', () => _handleFlexSlotClick(slotIdx, pos));
  return el;
}

function _renderFlexEditPanel() {
  const panel = $('flexEditPanel');
  if (!panel) return;
  if (!_flexEditMode || !_flexSelectedSlot) {
    panel.style.display = 'none'; panel.innerHTML = ''; return;
  }
  panel.style.display = ''; panel.innerHTML = '';

  const { slotIdx, pos } = _flexSelectedSlot;
  const currentP = _flexState.schedule[slotIdx][pos];
  const label = _FLEX_DAYS[Math.floor(slotIdx / 3)] + ' ' + _FLEX_SHIFTS[slotIdx % 3];

  const header = document.createElement('div');
  header.className = 'edit-panel-header';
  header.textContent = `${label} 슬롯 ${pos + 1} 편집 — 현재: ${currentP ? currentP.name : '미배정'}`;
  panel.appendChild(header);

  const help = document.createElement('div');
  help.className = 'edit-panel-help';
  help.textContent = '· 아래 인원을 누르면 이 자리에 배정됩니다.   · 일정 표의 초록 테두리 슬롯을 누르면 스왑.';
  panel.appendChild(help);

  if (currentP) {
    const remRow = document.createElement('div');
    remRow.style.marginBottom = '8px';
    const rem = document.createElement('button');
    rem.className = 'btn';
    rem.style.cssText = 'background:#FEE2E2;color:var(--red);padding:6px 12px;font-weight:500;font-size:13px;';
    rem.textContent = '✕ ' + currentP.name + ' 제거';
    rem.addEventListener('click', () => {
      _flexState.schedule[slotIdx][pos] = null;
      _flexSelectedSlot = null;
      _recomputeFlexShortage();
      _renderFlexTable();
    });
    remRow.appendChild(rem);
    panel.appendChild(remRow);
  }

  const candLabel = document.createElement('div');
  candLabel.style.cssText = 'font-size:11px;color:var(--muted);margin-bottom:6px;';
  candLabel.textContent = '이 자리에 넣을 수 있는 인원';
  panel.appendChild(candLabel);

  const list = document.createElement('div');
  list.className = 'edit-candidates';
  const cands = people.filter(p =>
    (!currentP || p.id !== currentP.id) &&
    !_flexState.schedule[slotIdx].some((x, i) => x && x.id === p.id && i !== pos)
  );
  if (!cands.length) {
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
        _flexState.schedule[slotIdx][pos] = p;
        _flexSelectedSlot = null;
        _recomputeFlexShortage();
        _renderFlexTable();
      });
      list.appendChild(chip);
    }
  }
  panel.appendChild(list);

  const actions = document.createElement('div');
  actions.className = 'edit-panel-actions';
  const cancel = document.createElement('button');
  cancel.className = 'btn btn-secondary';
  cancel.textContent = '선택 취소';
  cancel.addEventListener('click', () => { _flexSelectedSlot = null; _renderFlexTable(); });
  actions.appendChild(cancel);
  panel.appendChild(actions);
}

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
          for (let pos = 0; pos < d_s; pos++) wrap.appendChild(_buildFlexSlotPos(s, pos));
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

  _renderFlexEditPanel();
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

window.addEventListener("load", boot);
