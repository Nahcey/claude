"""
구 휴리스틱, 미사용, 참고용.
Python port of sikchung/frontend/schedule-algo.js.
Pure computation — no AWS SDK / no I/O.
Algorithm logic is intentionally unchanged from the JS original;
only syntax is translated (Map→dict, Set→set, Date.now→time.time*1000).
"""
import random
import time

SLOTS_COUNT  = 12
SLOTS_PER_DAY = 2
TOTAL_SLOTS  = SLOTS_COUNT * SLOTS_PER_DAY   # 24


# ── Helpers ────────────────────────────────────────────────────────────────────

def shuffle(arr):
    a = arr[:]
    for i in range(len(a) - 1, 0, -1):
        j = random.randint(0, i)
        a[i], a[j] = a[j], a[i]
    return a


# ── Skip priority ──────────────────────────────────────────────────────────────

def apply_skip_priority(input_people):
    active = input_people[:]
    skipped = []

    # 1) priority > 0 먼저 제외 (가장 높은 priority 부터)
    while len(active) > TOTAL_SLOTS:
        candidates = [p for p in active if p['priority'] > 0]
        if not candidates:
            break
        max_pr = max(p['priority'] for p in candidates)
        tied = shuffle([p for p in candidates if p['priority'] == max_pr])
        pick = tied[0]
        active = [p for p in active if p['id'] != pick['id']]
        skipped.append({'person': pick, 'reason': 'priority'})

    # 2) 그래도 초과 → 무작위 제외
    while len(active) > TOTAL_SLOTS:
        tied = shuffle(active)
        pick = tied[0]
        active = [p for p in active if p['id'] != pick['id']]
        skipped.append({'person': pick, 'reason': 'forced'})

    return {'active': active, 'skipped': skipped}


# ── Schedule skeleton ──────────────────────────────────────────────────────────

def empty_schedule():
    return [[None, None] for _ in range(SLOTS_COUNT)]


# ── Pair preference ────────────────────────────────────────────────────────────

def pair_preference(a, b):
    a_rookie = bool(a.get('rookie'))
    b_rookie = bool(b.get('rookie'))
    if a_rookie or b_rookie:
        if a_rookie and b_rookie:
            return 100 if (a.get('group') in ('A', 'B') and b.get('group') in ('A', 'B')) else 1
        partner = b if a_rookie else a
        return 100 if partner.get('group') in ('A', 'B') else 1
    return 0


def pair_preference_for_slot(a, b, slot_idx, schedule):
    base = pair_preference(a, b)
    # 평일 아침(짝수, <10): 같은 날 저녁도 가능하면 보너스
    if slot_idx < 10 and slot_idx % 2 == 0:
        e_idx = slot_idx + 1
        if not a['restricted'][e_idx]:
            base += 300
        if not b['restricted'][e_idx]:
            base += 300
    # 평일 저녁(홀수, <10): 같은 날 아침 멤버와 일치하면 가산점
    if slot_idx < 10 and slot_idx % 2 == 1:
        morning = schedule[slot_idx - 1]
        if morning:
            m_ids = {p['id'] for p in morning if p}
            match = (1 if a['id'] in m_ids else 0) + (1 if b['id'] in m_ids else 0)
            base += match * 800
    # 주말: double 인원 우선
    if slot_idx >= 10:
        if a.get('double'):
            base += 50
        if b.get('double'):
            base += 50
    return base


# ── Backtracking ───────────────────────────────────────────────────────────────

def solve_backtrack(active, time_budget_ms=600):
    schedule = empty_schedule()
    counts     = {p['id']: 0 for p in active}
    wknd_counts = {p['id']: 0 for p in active}
    start = time.time() * 1000
    timed_out = [False]

    def cap_of(p):
        return 4 if p.get('double') else 2

    def can_take(p, slot_idx):
        if counts[p['id']] >= cap_of(p):
            return False
        # 주말 슬롯은 2 unit 비용 → 잔여 2 이상 필요
        if slot_idx >= 10 and cap_of(p) - counts[p['id']] < 2:
            return False
        return True

    def take(p, slot_idx):
        counts[p['id']] += 1
        if slot_idx >= 10:
            wknd_counts[p['id']] += 1

    def untake(p, slot_idx):
        counts[p['id']] -= 1
        if slot_idx >= 10:
            wknd_counts[p['id']] -= 1

    def snapshot():
        return [s[:] for s in schedule]

    # 가용 인원 적은 슬롯 먼저 (제한 많은 곳 우선 처리)
    units_list = []
    for i in range(5):
        c = sum(1 for p in active if not p['restricted'][i*2] and not p['restricted'][i*2+1])
        units_list.append({'slots': [i*2, i*2+1], 'c': c + random.random() * 0.001})
    for i in range(10, SLOTS_COUNT):
        c = sum(1 for p in active if not p['restricted'][i])
        units_list.append({'slots': [i], 'c': c + random.random() * 0.001})
    units_list.sort(key=lambda u: u['c'])
    day_order = [s for u in units_list for s in u['slots']]

    best = [None]          # {'schedule': ..., 'score': ...}
    current_filled = [0]

    def try_update_best():
        sc = score_schedule(schedule, active)
        if best[0] is None or compare_schedules(sc, best[0]['score']) < 0:
            best[0] = {'schedule': snapshot(), 'score': sc}

    def recurse(idx):
        if timed_out[0]:
            return
        if time.time() * 1000 - start > time_budget_ms:
            timed_out[0] = True
            return

        if idx == len(day_order):
            try_update_best()
            return

        # 가지치기: 남은 슬롯 전부 채워도 best.filled 못 넘기면 중단
        if best[0] is not None:
            remaining = len(day_order) - idx
            if current_filled[0] + remaining * SLOTS_PER_DAY < best[0]['score']['filled']:
                return

        day = day_order[idx]
        available = [p for p in active if not p['restricted'][day] and can_take(p, day)]

        # 2명 이상: 모든 쌍을 선호도 내림차순으로 시도
        if len(available) >= 2:
            pairs = [
                (available[i], available[j])
                for i in range(len(available))
                for j in range(i + 1, len(available))
            ]
            pairs.sort(
                key=lambda pr: pair_preference_for_slot(pr[0], pr[1], day, schedule),
                reverse=True,
            )
            for (a, b) in pairs:
                if timed_out[0]:
                    return
                schedule[day] = [a, b]
                take(a, day); take(b, day)
                current_filled[0] += 2
                recurse(idx + 1)
                current_filled[0] -= 2
                untake(a, day); untake(b, day)
                schedule[day] = [None, None]

        # 만점이면 1명/0명 분기 불필요
        if best[0] is not None and best[0]['score']['filled'] >= len(day_order) * SLOTS_PER_DAY:
            return

        # 1명
        for a in available:
            if timed_out[0]:
                return
            schedule[day] = [a, None]
            take(a, day)
            current_filled[0] += 1
            recurse(idx + 1)
            current_filled[0] -= 1
            untake(a, day)
            schedule[day] = [None, None]

        # 0명
        if timed_out[0]:
            return
        schedule[day] = [None, None]
        recurse(idx + 1)

    recurse(0)
    return {'schedule': best[0]['schedule']} if best[0] else None


# ── Score / compare ────────────────────────────────────────────────────────────

def score_schedule(schedule, active):
    n = len(active) if isinstance(active, list) else 0
    filled  = 0
    id_set  = set()
    pref    = 0
    weekday_days = {}   # id -> set of day indices (0..4)
    weekend_cnt  = {}   # id -> int

    for s in range(SLOTS_COUNT):
        for p in schedule[s]:
            if not p:
                continue
            filled += 1
            id_set.add(p['id'])
            if s >= 10:
                weekend_cnt[p['id']] = weekend_cnt.get(p['id'], 0) + 1
            else:
                d = s // 2
                weekday_days.setdefault(p['id'], set()).add(d)
        if schedule[s][0] and schedule[s][1]:
            pref += pair_preference(schedule[s][0], schedule[s][1])

    double_assigned    = 0
    weekday_only_double = 0
    all_ids = set(weekday_days) | set(weekend_cnt)
    for pid in all_ids:
        wd = len(weekday_days.get(pid, set()))
        we = weekend_cnt.get(pid, 0)
        if wd + we >= 2:
            double_assigned += 1
            if we == 0:
                weekday_only_double += 1

    atomic_days  = 0
    weekday_lone = 0
    for d in range(5):
        m = {p['id'] for p in schedule[2*d]   if p}
        e = {p['id'] for p in schedule[2*d+1] if p}
        atomic_days  += sum(1 for pid in m if pid in e)
        weekday_lone += sum(1 for pid in m if pid not in e)
        weekday_lone += sum(1 for pid in e if pid not in m)

    unassigned_eligible = sum(
        1 for p in active
        if p['id'] not in id_set and not all(p['restricted'])
    ) if isinstance(active, list) else 0

    excess_unassigned = max(0, unassigned_eligible - max(0, n - 14))

    return {
        'excess_unassigned':   excess_unassigned,
        'double_assigned':     double_assigned,
        'weekday_only_double': weekday_only_double,
        'weekday_lone':        weekday_lone,
        'atomic_days':         atomic_days,
        'filled':              filled,
        'people':              len(id_set),
        'pref':                pref,
        'unassigned_eligible': unassigned_eligible,
    }


def compare_schedules(a, b):
    for key, sign in [
        ('excess_unassigned',   1),
        ('double_assigned',     1),
        ('weekday_only_double', 1),
        ('weekday_lone',        1),
        ('atomic_days',        -1),
        ('filled',             -1),
        ('people',             -1),
        ('pref',               -1),
    ]:
        diff = a[key] - b[key]
        if diff:
            return sign * diff
    return 0


# ── Greedy ─────────────────────────────────────────────────────────────────────

def solve_greedy(active):
    schedule = empty_schedule()
    counts = {p['id']: 0 for p in active}   # 슬롯 수 (cap 기준)
    units  = {p['id']: 0 for p in active}   # unit 수

    def cap_of(p):
        return 4 if p.get('double') else 2

    def in_slot(p, s):
        return any(x and x['id'] == p['id'] for x in schedule[s])

    def free_pos(s):
        try:
            return schedule[s].index(None)
        except ValueError:
            return -1

    def place_slot(p, s, pos):
        schedule[s][pos] = p
        counts[p['id']] += 1

    def place_weekday_atomic(p, d):
        m, e = 2*d, 2*d+1
        pm, pe = free_pos(m), free_pos(e)
        if pm < 0 or pe < 0:
            return False
        place_slot(p, m, pm)
        place_slot(p, e, pe)
        units[p['id']] += 1
        return True

    def place_weekend(p, s):
        pos = free_pos(s)
        if pos < 0:
            return False
        place_slot(p, s, pos)
        units[p['id']] += 2   # 주말 1슬롯 = 2 unit
        return True

    def can_atomic(p, d):
        return (
            not p['restricted'][2*d] and not p['restricted'][2*d+1]
            and cap_of(p) - counts[p['id']] >= 2
            and not in_slot(p, 2*d) and not in_slot(p, 2*d+1)
            and free_pos(2*d) >= 0 and free_pos(2*d+1) >= 0
        )

    def can_wknd(p, s):
        return (
            not p['restricted'][s]
            and cap_of(p) - counts[p['id']] >= 2
            and not in_slot(p, s)
            and free_pos(s) >= 0
        )

    # ---- 라운드 A: 0 unit 인원에게 1 unit 씩 ----
    fresh = shuffle(active[:])

    weekday_order = sorted(
        range(5),
        key=lambda d: (
            sum(1 for p in active if not p['restricted'][d*2] and not p['restricted'][d*2+1]),
            random.random(),
        ),
    )

    for d in weekday_order:
        while free_pos(2*d) >= 0 and free_pos(2*d+1) >= 0:
            cand = next((p for p in fresh if units[p['id']] == 0 and can_atomic(p, d)), None)
            if not cand:
                break
            place_weekday_atomic(cand, d)

    for s in shuffle([10, 11]):
        while free_pos(s) >= 0:
            cand = next((p for p in fresh if units[p['id']] == 0 and can_wknd(p, s)), None)
            if not cand:
                break
            place_weekend(cand, s)

    # 그래도 0 unit 인 인원 → 남은 어떤 unit 이든 1개
    for p in fresh:
        if units[p['id']] != 0 or all(p['restricted']):
            continue
        done = False
        for d in shuffle(list(range(5))):
            if can_atomic(p, d):
                place_weekday_atomic(p, d)
                done = True
                break
        if done:
            continue
        for s in shuffle([10, 11]):
            if can_wknd(p, s):
                place_weekend(p, s)
                break

    # ---- 라운드 B: 남는 빈 슬롯 채움 ----
    def has_weekday(p):
        return any(in_slot(p, 2*d) or in_slot(p, 2*d+1) for d in range(5))

    def has_weekend(p):
        return in_slot(p, 10) or in_slot(p, 11)

    def pick_b(eligible_fn, prefer_double, mix_for_weekend=False):
        cands = [p for p in active if (units[p['id']] == 0 or p.get('double')) and eligible_fn(p)]
        if not cands:
            return None
        def key(p):
            k0 = (0 if p.get('double') else 1) if prefer_double else 0
            k1 = (0 if (units[p['id']] > 0 and has_weekday(p) and not has_weekend(p)) else 1) if mix_for_weekend else 0
            return (k0, k1, units[p['id']], counts[p['id']], random.random())
        cands.sort(key=key)
        return cands[0]

    progress = True
    while progress:
        progress = False
        # 주말 빈칸 먼저 → '평일+주말' 구성 유도
        for s in [10, 11]:
            while free_pos(s) >= 0:
                c = pick_b(lambda p, s=s: can_wknd(p, s), True, True)
                if not c:
                    break
                place_weekend(c, s)
                progress = True
        # 평일 atomic 빈 day
        for d in range(5):
            while free_pos(2*d) >= 0 and free_pos(2*d+1) >= 0:
                c = pick_b(lambda p, d=d: can_atomic(p, d), False)
                if not c:
                    break
                place_weekday_atomic(c, d)
                progress = True

    # 마지막 보완: 남은 평일 단일 슬롯 (불가피한 경우)
    for s in range(10):
        while free_pos(s) >= 0:
            other = s + 1 if s % 2 == 0 else s - 1
            c = pick_b(
                lambda p, s=s: (
                    not p['restricted'][s]
                    and cap_of(p) - counts[p['id']] >= 1
                    and not in_slot(p, s)
                ),
                False,
            )
            if not c:
                break
            was_present_other = in_slot(c, other)
            place_slot(c, s, free_pos(s))
            if not was_present_other:
                units[c['id']] += 1

    # ---- Guarantee pass: 0슬롯 가용 인원 최소 1슬롯 보장 ----
    slot_order = list(range(10, SLOTS_COUNT)) + list(range(10))
    for u in active:
        if counts[u['id']] > 0 or all(u['restricted']):
            continue
        placed = False
        for d in slot_order:
            if u['restricted'][d] or free_pos(d) < 0 or in_slot(u, d):
                continue
            place_slot(u, d, free_pos(d))
            units[u['id']] += 2 if d >= 10 else 1
            placed = True
            break
        if placed:
            continue
        # 빈칸 없음 → 2 unit 이상 인원에게서 양보받기
        for d in slot_order:
            if u['restricted'][d] or in_slot(u, d):
                continue
            w = 2 if d >= 10 else 1
            yielded = False
            for pos in range(SLOTS_PER_DAY):
                inc = schedule[d][pos]
                if inc and units[inc['id']] >= 2:
                    schedule[d][pos] = u
                    counts[u['id']]   += 1
                    counts[inc['id']] -= 1
                    units[inc['id']]   = max(1, units[inc['id']] - w)
                    units[u['id']]    += w
                    yielded = True
                    break
            if yielded:
                break

    assigned_ids = {p['id'] for day in schedule for p in day if p}
    failed = [
        {
            'person': p,
            'reason': '모든 시간 슬롯 제한됨' if all(p['restricted']) else '슬롯 우선 채움으로 자리 없음',
        }
        for p in active if p['id'] not in assigned_ids
    ]
    return {'schedule': schedule, 'failed': failed}


# ── Unit accounting ────────────────────────────────────────────────────────────

def assign_units_of(schedule):
    """평일 day=1 unit, 주말 슬롯=2 unit. {id: total_units}"""
    wd_days = {}   # id -> set of weekday day indices
    we_cnt  = {}   # id -> weekend slot count
    for s in range(SLOTS_COUNT):
        for p in schedule[s]:
            if not p or p.get('id') is None:
                continue
            if s >= 10:
                we_cnt[p['id']] = we_cnt.get(p['id'], 0) + 1
            else:
                wd_days.setdefault(p['id'], set()).add(s // 2)
    result = {}
    for pid in set(wd_days) | set(we_cnt):
        result[pid] = len(wd_days.get(pid, set())) + we_cnt.get(pid, 0) * 2
    return result


# ── Top-level orchestration ────────────────────────────────────────────────────

def generate_schedule(eligible):
    # 1단계: 우선순위 스킵
    skip_result = apply_skip_priority(eligible)
    active  = skip_result['active']
    skipped = skip_result['skipped']

    # 2단계: 그리디 30회 시도
    res        = None
    best_score = None
    for _ in range(30):
        gr = solve_greedy(active)
        sc = score_schedule(gr['schedule'], active)
        if best_score is None or compare_schedules(sc, best_score) < 0:
            best_score = sc
            res = {'schedule': gr['schedule']}

    # 3단계: 백트래킹 3회 시도 (time budget 1500 ms)
    for _ in range(3):
        r = solve_backtrack(active, 1500)
        if not r:
            continue
        sc = score_schedule(r['schedule'], active)
        if best_score is None or compare_schedules(sc, best_score) < 0:
            best_score = sc
            res = r
        if sc['filled'] == TOTAL_SLOTS:
            break

    if not res:
        res = {'schedule': empty_schedule()}

    # 미배정 인원
    assigned_ids = {p['id'] for day in res['schedule'] for p in day if p}
    failed = [
        {
            'person': p,
            'reason': '모든 시간 슬롯 제한됨' if all(p['restricted']) else '슬롯 우선 채움으로 자리 없음',
        }
        for p in active if p['id'] not in assigned_ids
    ]

    # 통계
    full_days   = 0
    empty_slots = 0
    for day in res['schedule']:
        cnt = sum(1 for p in day if p)
        if cnt == SLOTS_PER_DAY:
            full_days += 1
        empty_slots += SLOTS_PER_DAY - cnt

    return {
        'schedule':    res['schedule'],
        'skipped':     skipped,
        'failed':      failed,
        'full_days':   full_days,
        'empty_slots': empty_slots,
        'assign_count': assign_units_of(res['schedule']),
        'active':      active,
    }
