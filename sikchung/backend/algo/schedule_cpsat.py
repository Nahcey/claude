"""
CP-SAT 기반 청소 일정 생성기.
7단계 축차 최적화 (총 시간 예산 22초).
"""
import json
import os
import random
import sys

_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _root not in sys.path:
    sys.path.insert(0, _root)

from algo.schedule import apply_skip_priority, assign_units_of
from ortools.sat.python.cp_model import CpModel, CpSolver, OPTIMAL, FEASIBLE

SLOTS_COUNT   = 12
SLOTS_PER_DAY = 2
TOTAL_SLOTS   = SLOTS_COUNT * SLOTS_PER_DAY
WEEKDAY_DAYS  = 5
WEEKEND_SLOTS = [10, 11]

# 모드별 슬롯 정원. 총합은 두 모드 모두 24로 동일 →
# 인당 cap(2/double 4), 부담 unit(평일 1/주말 2), threshold 로직은 공유.
MODE_CAPACITY = {
    'normal': [SLOTS_PER_DAY] * SLOTS_COUNT,
    'summer': [4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 2, 2],  # 평일 아침 4, 저녁 0, 토·일 2
}

# CP-SAT 상태 코드 → 이름 (진단 출력용)
_CP_STATUS = {OPTIMAL: 'OPTIMAL', FEASIBLE: 'FEASIBLE'}


def _pair_preference(a, b):
    a_r = bool(a.get('rookie'))
    b_r = bool(b.get('rookie'))
    if a_r or b_r:
        if a_r and b_r:
            return 100 if (a.get('group') in ('A', 'B') and b.get('group') in ('A', 'B')) else 1
        senior = b if a_r else a
        return 100 if senior.get('group') in ('A', 'B') else 1
    return 0


def generate_schedule(eligible, mode='normal'):
    # ── [진단] 입력 크기만 기록 (실명 PII는 CloudWatch에 남기지 않음) ─────────
    print(f'[input] {len(eligible)} people mode={mode}', file=sys.stderr)

    cap = MODE_CAPACITY[mode]
    total_cap = sum(cap)

    skip_result = apply_skip_priority(eligible)
    active  = skip_result['active']
    skipped = skip_result['skipped']
    random.shuffle(active)  # 변수 인덱스 편향 제거
    m = len(active)

    def _empty_result(optimal=False):
        sch = [[None] * cap[s] for s in range(SLOTS_COUNT)]
        return {
            'schedule':     sch,
            'skipped':      skipped,
            'failed':       [
                {
                    'person': p,
                    'reason': '모든 시간 슬롯 제한됨' if all(p['restricted'])
                               else '슬롯 우선 채움으로 자리 없음',
                }
                for p in active
            ],
            'full_days':    0,
            'empty_slots':  total_cap,
            'assign_count': {},
            'active':       active,
            'optimal':      optimal,
        }

    if m == 0:
        return _empty_result(optimal=True)

    model  = CpModel()
    solver = CpSolver()
    solver.parameters.num_workers = 4
    solver.parameters.random_seed = random.randint(0, 2_147_483_647)

    # ── Decision variables ────────────────────────────────────────────────────

    x = [[model.NewBoolVar(f'x{i}_{s}') for s in range(SLOTS_COUNT)] for i in range(m)]

    for i, person in enumerate(active):
        for s in range(SLOTS_COUNT):
            # restricted 또는 정원 0 슬롯(혹서기 평일 저녁)은 배정 불가 (변수 가지치기)
            if person['restricted'][s] or cap[s] == 0:
                model.Add(x[i][s] == 0)

    # ── Hard constraint: slot capacity ────────────────────────────────────────

    for s in range(SLOTS_COUNT):
        model.Add(sum(x[i][s] for i in range(m)) <= cap[s])

    # ── Hard constraint: per-person cap ──────────────────────────────────────
    # 평일 슬롯 각 1비용, 주말 슬롯 각 2비용 → 총 비용 ≤ cap.
    # sum(all_slots) + sum(weekend_slots) = raw_wd + 2×wknd ≤ cap.
    # non-double cap=2, double cap=4.
    for i, person in enumerate(active):
        person_cap = 4 if person.get('double') else 2
        model.Add(
            sum(x[i][s] for s in range(SLOTS_COUNT)) +
            sum(x[i][s] for s in WEEKEND_SLOTS) <= person_cap
        )

    # ── Derived variables ─────────────────────────────────────────────────────

    # assigned[i] = OR over all slots
    assigned = [model.NewBoolVar(f'asgn{i}') for i in range(m)]
    for i in range(m):
        model.AddMaxEquality(assigned[i], [x[i][s] for s in range(SLOTS_COUNT)])

    # atomic[i][d] = AND(morning, evening) = min
    # summer 모드는 저녁 정원이 0이라 무의미 → 변수 생성·Stage 4 스킵
    atomic = None
    if mode != 'summer':
        atomic = [[model.NewBoolVar(f'atom{i}_{d}') for d in range(WEEKDAY_DAYS)] for i in range(m)]
        for i in range(m):
            for d in range(WEEKDAY_DAYS):
                model.AddMinEquality(atomic[i][d], [x[i][2*d], x[i][2*d+1]])

    # has_wk[i] = OR over weekend slots
    has_wk = [model.NewBoolVar(f'haswk{i}') for i in range(m)]
    for i in range(m):
        model.AddMaxEquality(has_wk[i], [x[i][s] for s in WEEKEND_SLOTS])

    # has_wd[i] = OR over weekday slots
    has_wd = [model.NewBoolVar(f'haswd{i}') for i in range(m)]
    for i in range(m):
        model.AddMaxEquality(has_wd[i], [x[i][s] for s in range(SLOTS_COUNT)
                                         if s not in WEEKEND_SLOTS])

    # mix[i]    = 평일+주말 조합 (has_wd AND has_wk)
    mix = [model.NewBoolVar(f'mix{i}') for i in range(m)]
    for i in range(m):
        model.AddBoolAnd([has_wd[i], has_wk[i]]).OnlyEnforceIf(mix[i])
        model.AddBoolOr([has_wd[i].Not(), has_wk[i].Not()]).OnlyEnforceIf(mix[i].Not())

    # wd_only[i] = 평일만 조합 (has_wd AND NOT has_wk)
    wd_only = [model.NewBoolVar(f'wdonly{i}') for i in range(m)]
    for i in range(m):
        model.AddBoolAnd([has_wd[i], has_wk[i].Not()]).OnlyEnforceIf(wd_only[i])
        model.AddBoolOr([has_wd[i].Not(), has_wk[i]]).OnlyEnforceIf(wd_only[i].Not())

    # ── Stage objectives ──────────────────────────────────────────────────────

    eligible_idx = [i for i in range(m) if not all(active[i]['restricted'])]
    threshold    = max(0, m - 14)

    excess_v = model.NewIntVar(0, m, 'excess_v')
    if eligible_idx:
        unasgn_sum = sum(assigned[i].Not() for i in eligible_idx)
        surplus_v  = model.NewIntVar(-m, m, 'surplus_v')
        model.Add(surplus_v == unasgn_sum - threshold)
        model.AddMaxEquality(excess_v, [model.NewConstant(0), surplus_v])
    else:
        model.Add(excess_v == 0)

    filled_v = model.NewIntVar(0, total_cap, 'filled_v')
    model.Add(filled_v == sum(x[i][s] for i in range(m) for s in range(SLOTS_COUNT)))

    atomic_total_v = None
    if atomic is not None:
        atomic_total_v = model.NewIntVar(0, m * WEEKDAY_DAYS, 'atomic_total_v')
        model.Add(atomic_total_v == sum(
            atomic[i][d] for i in range(m) for d in range(WEEKDAY_DAYS)
        ))

    mix_total_v = model.NewIntVar(0, m, 'mix_total_v')
    model.Add(mix_total_v == sum(mix))

    wd_only_total_v = model.NewIntVar(0, m, 'wdonly_total_v')
    model.Add(wd_only_total_v == sum(wd_only))

    # 인원별 raw unit 명시 변수: 평일 슬롯 수 + 주말 슬롯 수×2
    raw_unit_v = [model.NewIntVar(0, 4, f'rau{i}') for i in range(m)]
    for i in range(m):
        model.Add(raw_unit_v[i] ==
                  sum(x[i][s] for s in range(SLOTS_COUNT)) +
                  sum(x[i][s] for s in WEEKEND_SLOTS))

    # 배정된 eligible 인원의 raw unit 최솟값 (균등 배분 목표)
    # Big-M 선형 조건으로 표현: assigned=1 이면 raw_unit_v[i] >= min_raw_unit_v
    #   raw_unit_v[i] + 4 >= min_raw_unit_v + 4*assigned[i]
    #   → assigned=1: raw_unit_v[i] >= min_raw_unit_v  ✓
    #   → assigned=0: raw_unit_v[i] + 4 >= min_raw_unit_v (항상 성립, max 4)  ✓
    min_raw_unit_v = model.NewIntVar(0, 4, 'min_rau_v')
    for i in eligible_idx:
        model.Add(raw_unit_v[i] + 4 >= min_raw_unit_v + 4 * assigned[i])

    pref_terms = []
    for i in range(m):
        for j in range(i + 1, m):
            pref = _pair_preference(active[i], active[j])
            if pref == 0:
                continue
            for s in range(SLOTS_COUNT):
                # 두 명이 함께 서려면 정원 2 이상 필요 (cap 0/1 슬롯은 페어 불가)
                if cap[s] < 2 or active[i]['restricted'][s] or active[j]['restricted'][s]:
                    continue
                pv = model.NewBoolVar(f'pr{i}_{j}_{s}')
                model.AddMinEquality(pv, [x[i][s], x[j][s]])
                pref_terms.append((pref, pv))

    max_pref = sum(p for p, _ in pref_terms) if pref_terms else 0
    pref_v   = model.NewIntVar(0, max(1, max_pref), 'pref_v')
    if pref_terms:
        model.Add(pref_v == sum(p * v for p, v in pref_terms))
    else:
        model.Add(pref_v == 0)

    # ── Sequential optimization ───────────────────────────────────────────────

    stages_ok      = []   # feasibility 판정 (흐름 제어용, OPTIMAL|FEASIBLE 모두 True)
    stages_optimal = []   # OPTIMAL 여부만 기록 (최종 optimal 플래그용)

    def solve_stage(sense, obj_var, time_s, label=''):
        if sense == 'min':
            model.Minimize(obj_var)
        else:
            model.Maximize(obj_var)
        solver.parameters.max_time_in_seconds = time_s
        status = solver.Solve(model)
        ok = status in (OPTIMAL, FEASIBLE)
        stages_ok.append(ok)
        stages_optimal.append(status == OPTIMAL)
        status_name = _CP_STATUS.get(status, str(status))
        obj_str = str(round(solver.ObjectiveValue())) if ok else 'N/A'
        tag = f'[stage {label}]' if label else '[stage]'
        print(f'{tag} status={status_name} obj={obj_str} wall={solver.WallTime():.3f}s',
              file=sys.stderr)
        if ok:
            return round(solver.ObjectiveValue())
        return None

    # Stage 1: minimize excess unassigned  [8s]
    v1 = solve_stage('min', excess_v, 8.0, label='excess')
    if v1 is None:
        return _empty_result(optimal=False)
    model.Add(excess_v <= v1)

    # Stage 2: maximize filled slots  [5s]
    v2 = solve_stage('max', filled_v, 5.0, label='filled')
    if v2 is not None:
        model.Add(filled_v >= v2)

    # Stage 3: 배정 인원 간 최소 raw unit 최대화 (균등 배분)  [3s]
    v3 = solve_stage('max', min_raw_unit_v, 3.0, label='min_raw_unit')
    if v3 is not None:
        model.Add(min_raw_unit_v >= v3)
        # 이후 단계에서 하한이 해제되지 않도록 per-person 명시 하한 추가
        if v3 > 0:
            for i in eligible_idx:
                model.Add(raw_unit_v[i] + 4 >= v3 + 4 * assigned[i])

    # Stage 4: maximize atomic (both morning+evening same day) count  [2s]
    # summer 모드는 저녁 슬롯이 없어 스킵
    if atomic_total_v is not None:
        v4 = solve_stage('max', atomic_total_v, 2.0, label='atomic')
        if v4 is not None:
            model.Add(atomic_total_v >= v4)

    # Stage 5: 2회 배정 인원 평일+주말 조합 최대화  [2s]
    v5 = solve_stage('max', mix_total_v, 2.0, label='mix')
    if v5 is not None:
        model.Add(mix_total_v >= v5)

    # Stage 6: 2회 배정 인원 평일+평일 조합 최대화 (= 주말+주말 최소화)  [1s]
    v6 = solve_stage('max', wd_only_total_v, 1.0, label='wd_only')
    if v6 is not None:
        model.Add(wd_only_total_v >= v6)

    # Stage 7: maximize pair preference  [1s]
    v7 = solve_stage('max', pref_v, 1.0, label='pref')

    # If stage 7 found nothing (edge case), ensure solver has a valid solution
    if v7 is None:
        model.Minimize(model.NewConstant(0))
        solver.parameters.max_time_in_seconds = 2.0
        status = solver.Solve(model)
        if status not in (OPTIMAL, FEASIBLE):
            return _empty_result(optimal=False)

    # ── Extract solution ──────────────────────────────────────────────────────

    result_schedule = [[None] * cap[s] for s in range(SLOTS_COUNT)]
    for s in range(SLOTS_COUNT):
        pos = 0
        for i in range(m):
            if solver.Value(x[i][s]) == 1:
                result_schedule[s][pos] = active[i]
                pos += 1
                if pos >= cap[s]:
                    break

    assigned_ids = {p['id'] for slot in result_schedule for p in slot if p}
    failed = [
        {
            'person': p,
            'reason': '모든 시간 슬롯 제한됨' if all(p['restricted'])
                       else '슬롯 우선 채움으로 자리 없음',
        }
        for p in active if p['id'] not in assigned_ids
    ]

    full_days   = sum(1 for s, slot in enumerate(result_schedule)
                      if cap[s] > 0 and sum(1 for p in slot if p) == cap[s])
    empty_slots = sum(cap[s] - sum(1 for p in slot if p)
                      for s, slot in enumerate(result_schedule))

    return {
        'schedule':     result_schedule,
        'skipped':      skipped,
        'failed':       failed,
        'full_days':    full_days,
        'empty_slots':  empty_slots,
        'assign_count': assign_units_of(result_schedule),
        'active':       active,
        'optimal':      all(stages_optimal),   # OPTIMAL 상태에서만 True
    }


def check_expected(eligible, expected_assignment, mode='normal'):
    """expected_assignment가 hard constraint를 충족하는지 검사한다.

    generate_schedule과 독립된 경량 함수. 시간예산 1초.

    Args:
        eligible:            generate_schedule에 전달하는 것과 동일한 eligible 배열.
        expected_assignment: {slot_index: [id, ...]} (int 키, id 최대 슬롯 정원 개).
        mode:                'normal' | 'summer' (MODE_CAPACITY 키).
    Returns:
        {'feasible': bool, 'wall': float}
    """
    cap = MODE_CAPACITY[mode]

    skip_result = apply_skip_priority(eligible)
    active = skip_result['active']
    m = len(active)

    if m == 0:
        return {'feasible': True, 'wall': 0.0}

    id_to_idx = {active[i]['id']: i for i in range(m)}

    model  = CpModel()
    solver = CpSolver()
    solver.parameters.max_time_in_seconds = 1.0

    x = [[model.NewBoolVar(f'x{i}_{s}') for s in range(SLOTS_COUNT)] for i in range(m)]

    # hard: restricted / 정원 0 슬롯
    for i, person in enumerate(active):
        for s in range(SLOTS_COUNT):
            if person['restricted'][s] or cap[s] == 0:
                model.Add(x[i][s] == 0)

    # hard: slot capacity
    for s in range(SLOTS_COUNT):
        model.Add(sum(x[i][s] for i in range(m)) <= cap[s])

    # hard: per-person cap
    for i, person in enumerate(active):
        person_cap = 4 if person.get('double') else 2
        model.Add(
            sum(x[i][s] for s in range(SLOTS_COUNT)) +
            sum(x[i][s] for s in WEEKEND_SLOTS) <= person_cap
        )

    # fix expected assignment: x[i][s] == 1 if assigned, 0 otherwise
    assigned_pairs = set()
    for s_key, ids in expected_assignment.items():
        s = int(s_key)
        for pid in (ids or []):
            if pid in id_to_idx:
                assigned_pairs.add((id_to_idx[pid], s))

    for i in range(m):
        for s in range(SLOTS_COUNT):
            model.Add(x[i][s] == (1 if (i, s) in assigned_pairs else 0))

    status = solver.Solve(model)
    return {
        'feasible': status in (OPTIMAL, FEASIBLE),
        'wall':     solver.WallTime(),
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('Usage: python schedule_cpsat.py <eligible.json> [normal|summer]', file=sys.stderr)
        sys.exit(1)

    _mode = sys.argv[2] if len(sys.argv) > 2 else 'normal'
    if _mode not in MODE_CAPACITY:
        print(f'unknown mode: {_mode} (normal|summer)', file=sys.stderr)
        sys.exit(1)

    with open(sys.argv[1], encoding='utf-8') as f:
        _eligible = json.load(f)

    _result = generate_schedule(_eligible, mode=_mode)

    _SLOT_LABELS = [
        '월아', '월저', '화아', '화저', '수아', '수저',
        '목아', '목저', '금아', '금저', '토',  '일',
    ]
    print('\n[schedule]', file=sys.stderr)
    for _s in range(SLOTS_COUNT):
        _slot = _result['schedule'][_s]
        _names = [f"{p['name']}({p['id']})" if p else '—' for p in _slot]
        _lbl = _SLOT_LABELS[_s] if _s < len(_SLOT_LABELS) else str(_s)
        print(f'  slot {_s:2d} [{_lbl}]: {", ".join(_names)}', file=sys.stderr)

    print(f'\n[assign_count] {_result["assign_count"]}', file=sys.stderr)
    print(f'[optimal]      {_result["optimal"]}', file=sys.stderr)
