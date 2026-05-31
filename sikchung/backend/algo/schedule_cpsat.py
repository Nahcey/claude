"""
CP-SAT 기반 청소 일정 생성기.
6단계 축차 최적화 (총 시간 예산 24초).
"""
import os
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


def _pair_preference(a, b):
    a_r = bool(a.get('rookie'))
    b_r = bool(b.get('rookie'))
    if a_r or b_r:
        if a_r and b_r:
            return 100 if (a.get('group') in ('A', 'B') and b.get('group') in ('A', 'B')) else 1
        senior = b if a_r else a
        return 100 if senior.get('group') in ('A', 'B') else 1
    return 0


def generate_schedule(eligible):
    skip_result = apply_skip_priority(eligible)
    active  = skip_result['active']
    skipped = skip_result['skipped']
    m = len(active)

    def _empty_result(optimal=False):
        sch = [[None, None] for _ in range(SLOTS_COUNT)]
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
            'empty_slots':  TOTAL_SLOTS,
            'assign_count': {},
            'active':       active,
            'optimal':      optimal,
        }

    if m == 0:
        return _empty_result(optimal=True)

    model  = CpModel()
    solver = CpSolver()
    solver.parameters.num_workers = 4

    # ── Decision variables ────────────────────────────────────────────────────

    x = [[model.NewBoolVar(f'x{i}_{s}') for s in range(SLOTS_COUNT)] for i in range(m)]

    for i, person in enumerate(active):
        for s in range(SLOTS_COUNT):
            if person['restricted'][s]:
                model.Add(x[i][s] == 0)

    # ── Hard constraint: slot capacity ────────────────────────────────────────

    for s in range(SLOTS_COUNT):
        model.Add(sum(x[i][s] for i in range(m)) <= SLOTS_PER_DAY)

    # ── in_wd 먼저 정의 (unit-based cap 계산에 필요) ──────────────────────────

    # in_wd[i][d] = OR(morning, evening) for weekday d
    in_wd = [[model.NewBoolVar(f'inwd{i}_{d}') for d in range(WEEKDAY_DAYS)] for i in range(m)]
    for i in range(m):
        for d in range(WEEKDAY_DAYS):
            model.AddMaxEquality(in_wd[i][d], [x[i][2*d], x[i][2*d+1]])

    # ── Hard constraint: unit-based 개인 cap ─────────────────────────────────
    # unit = distinct_weekday_days + 2×weekend_slots  (JS assignUnitsOf 와 동일)
    # non-double cap=2, double cap=4.
    # 이 제약이 raw-slot cap + weekend-별도-제약을 모두 대체.
    for i, person in enumerate(active):
        cap = 4 if person.get('double') else 2
        model.Add(
            sum(in_wd[i][d] for d in range(WEEKDAY_DAYS)) +
            2 * sum(x[i][s] for s in WEEKEND_SLOTS) <= cap
        )

    # ── Derived variables ─────────────────────────────────────────────────────

    # assigned[i] = OR over all slots
    assigned = [model.NewBoolVar(f'asgn{i}') for i in range(m)]
    for i in range(m):
        model.AddMaxEquality(assigned[i], [x[i][s] for s in range(SLOTS_COUNT)])

    # atomic[i][d] = AND(morning, evening) = min
    atomic = [[model.NewBoolVar(f'atom{i}_{d}') for d in range(WEEKDAY_DAYS)] for i in range(m)]
    for i in range(m):
        for d in range(WEEKDAY_DAYS):
            model.AddMinEquality(atomic[i][d], [x[i][2*d], x[i][2*d+1]])

    # has_wk[i] = OR over weekend slots
    has_wk = [model.NewBoolVar(f'haswk{i}') for i in range(m)]
    for i in range(m):
        model.AddMaxEquality(has_wk[i], [x[i][s] for s in WEEKEND_SLOTS])

    # unit_v[i] = distinct_weekday_days + 2×weekend_slots  (max = 5 + 2×2 = 9)
    unit_v = [model.NewIntVar(0, WEEKDAY_DAYS + 2 * len(WEEKEND_SLOTS), f'unit{i}')
              for i in range(m)]
    for i in range(m):
        model.Add(unit_v[i] == sum(in_wd[i][d] for d in range(WEEKDAY_DAYS))
                              + 2 * sum(x[i][s] for s in WEEKEND_SLOTS))

    # is_dbl[i] = unit_v[i] >= 2
    is_dbl = [model.NewBoolVar(f'isdbl{i}') for i in range(m)]
    for i in range(m):
        model.Add(unit_v[i] >= 2).OnlyEnforceIf(is_dbl[i])
        model.Add(unit_v[i] <= 1).OnlyEnforceIf(is_dbl[i].Not())

    # wod[i] = is_dbl AND NOT has_wk  (weekday-only double)
    wod = [model.NewBoolVar(f'wod{i}') for i in range(m)]
    for i in range(m):
        model.AddBoolAnd([is_dbl[i], has_wk[i].Not()]).OnlyEnforceIf(wod[i])
        model.AddBoolOr([is_dbl[i].Not(), has_wk[i]]).OnlyEnforceIf(wod[i].Not())

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

    filled_v = model.NewIntVar(0, TOTAL_SLOTS, 'filled_v')
    model.Add(filled_v == sum(x[i][s] for i in range(m) for s in range(SLOTS_COUNT)))

    double_total_v = model.NewIntVar(0, m, 'double_total_v')
    model.Add(double_total_v == sum(is_dbl))

    atomic_total_v = model.NewIntVar(0, m * WEEKDAY_DAYS, 'atomic_total_v')
    model.Add(atomic_total_v == sum(
        atomic[i][d] for i in range(m) for d in range(WEEKDAY_DAYS)
    ))

    wod_total_v = model.NewIntVar(0, m, 'wod_total_v')
    model.Add(wod_total_v == sum(wod))

    pref_terms = []
    for i in range(m):
        for j in range(i + 1, m):
            pref = _pair_preference(active[i], active[j])
            if pref == 0:
                continue
            for s in range(SLOTS_COUNT):
                if active[i]['restricted'][s] or active[j]['restricted'][s]:
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

    stages_ok = []

    def solve_stage(sense, obj_var, time_s):
        if sense == 'min':
            model.Minimize(obj_var)
        else:
            model.Maximize(obj_var)
        solver.parameters.max_time_in_seconds = time_s
        status = solver.Solve(model)
        stages_ok.append(status in (OPTIMAL, FEASIBLE))
        if status in (OPTIMAL, FEASIBLE):
            return round(solver.ObjectiveValue())
        return None

    # Stage 1: minimize excess unassigned  [8s]
    v1 = solve_stage('min', excess_v, 8.0)
    if v1 is None:
        return _empty_result(optimal=False)
    model.Add(excess_v <= v1)

    # Stage 2: maximize filled slots  [5s]
    v2 = solve_stage('max', filled_v, 5.0)
    if v2 is not None:
        model.Add(filled_v >= v2)

    # Stage 3: minimize double-assigned count  [4s]
    v3 = solve_stage('min', double_total_v, 4.0)
    if v3 is not None:
        model.Add(double_total_v <= v3)

    # Stage 4: maximize atomic (both morning+evening same day) count  [4s]
    v4 = solve_stage('max', atomic_total_v, 4.0)
    if v4 is not None:
        model.Add(atomic_total_v >= v4)

    # Stage 5: minimize weekday-only double count  [2s]
    v5 = solve_stage('min', wod_total_v, 2.0)
    if v5 is not None:
        model.Add(wod_total_v <= v5)

    # Stage 6: maximize pair preference  [1s]
    v6 = solve_stage('max', pref_v, 1.0)

    # If stage 6 found nothing (edge case), ensure solver has a valid solution
    if v6 is None:
        model.Minimize(model.NewConstant(0))
        solver.parameters.max_time_in_seconds = 2.0
        status = solver.Solve(model)
        if status not in (OPTIMAL, FEASIBLE):
            return _empty_result(optimal=False)

    # ── Extract solution ──────────────────────────────────────────────────────

    result_schedule = [[None, None] for _ in range(SLOTS_COUNT)]
    for s in range(SLOTS_COUNT):
        pos = 0
        for i in range(m):
            if solver.Value(x[i][s]) == 1:
                result_schedule[s][pos] = active[i]
                pos += 1
                if pos >= SLOTS_PER_DAY:
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

    full_days   = sum(1 for slot in result_schedule
                      if sum(1 for p in slot if p) == SLOTS_PER_DAY)
    empty_slots = sum(SLOTS_PER_DAY - sum(1 for p in slot if p)
                      for slot in result_schedule)

    return {
        'schedule':     result_schedule,
        'skipped':      skipped,
        'failed':       failed,
        'full_days':    full_days,
        'empty_slots':  empty_slots,
        'assign_count': assign_units_of(result_schedule),
        'active':       active,
        'optimal':      all(stages_ok),
    }
