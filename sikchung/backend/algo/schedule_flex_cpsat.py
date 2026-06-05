"""
CP-SAT 기반 유연 인원 스케줄 생성기 (21슬롯, 2-pass 최적화).

슬롯 구조
---------
인덱스 = day*3 + shift  (shift: 0=아침, 1=점심, 2=저녁)
  월아침=0 월점심=1 월저녁=2 화아침=3 ... 금저녁=14 토아침=15 ... 일저녁=20
주말 슬롯: 15~20 (토·일 각 3칸).

2-pass 설계
-----------
Pass 1: shortage(미배정 슬롯 수) 최소화.

배정 목표 (Pass 1 직후 해석적 계산):
  nd_base = floor(total_fill / n_all)          ← 전체 인원 기준 1인당 기본 배정량
  비double: n_dbl > 0 → 정확히 nd_base
            n_dbl == 0 → [nd_base, nd_base+1]  (최대 1 차이)
  double:   남은 슬롯을 균등 배분 → [dbl_base, dbl_base+1]  (최대 1 차이)
  합계 제약(shortage=shortage_star)이 정확한 분배 수를 자동 결정함.

Pass 2: 배정 목표를 hard 제약으로 박고 double 주말 페널티 + 페어링 최적화.
두 목표를 가중합으로 뭉개지 않음; 반드시 순차 풀이.
"""
import json
import random
import sys

from ortools.sat.python.cp_model import CpModel, CpSolver, OPTIMAL, FEASIBLE

DAYS          = 7
SHIFTS        = 3
TOTAL_SLOTS   = DAYS * SHIFTS        # 21
WEEKEND_START = 5 * SHIFTS           # 15
WEEKEND_SLOTS = list(range(WEEKEND_START, TOTAL_SLOTS))   # [15..20]

PASS1_TIME = 6.0    # Pass 1: shortage 최소화
PASS2_TIME = 15.0   # Pass 2: double 주말 페널티 + 페어링 (균등 배분은 hard 제약)

_CP_STATUS = {
    0: 'UNKNOWN', 2: 'OPTIMAL', 3: 'FEASIBLE',
    4: 'INFEASIBLE', 5: 'MODEL_INVALID',
}


def _log(tag, status, solver):
    ok = status in (OPTIMAL, FEASIBLE)
    print(
        f'[{tag}] status={_CP_STATUS.get(status, "?")} '
        f'obj={round(solver.ObjectiveValue()) if ok else "N/A"} '
        f'wall={solver.WallTime():.3f}s',
        file=sys.stderr,
    )


def _pair_preference(pi, pj):
    """같은 슬롯 배정 선호도 점수: rookie+선임(A/B) 3점, 같은 그룹 1점."""
    gi, gj = pi.get('group'), pj.get('group')
    ri, rj = pi.get('rookie', False), pj.get('rookie', False)
    score = 0
    if ri and not rj and gj in ('A', 'B'):
        score += 3
    if rj and not ri and gi in ('A', 'B'):
        score += 3
    if gi and gj and gi == gj:
        score += 1
    return score


def generate_flex_schedule(eligible, demand):
    """
    Parameters
    ----------
    eligible : list[dict]
        각 요소: {id, name, restricted: bool[21], double: bool,
                  priority: int, group: str|None, rookie: bool}
    demand : list[int]  (길이 21, 음 아닌 정수)
        슬롯별 목표 배정 인원 수.

    Returns
    -------
    dict
        schedule:     {slot_index: [id, ...]}   빈 슬롯 생략
        shortage:     {slot_index: int}          0인 슬롯 생략
        assign_count: {id: int}
        failed:       [{person, reason}]
        optimal:      bool
    """
    assert len(demand) == TOTAL_SLOTS, \
        f'demand 길이 {len(demand)} != {TOTAL_SLOTS}'

    _empty = {
        'schedule':     {},
        'shortage':     {s: d for s, d in enumerate(demand) if d > 0},
        'assign_count': {},
        'failed':       [],
        'optimal':      True,
    }
    if not eligible:
        return _empty

    random.shuffle(eligible)   # 변수 인덱스 편향 제거
    n            = len(eligible)
    total_demand = sum(demand)

    # ── Pass 1: shortage 최소화 ───────────────────────────────────────────────
    m1 = CpModel()
    s1 = CpSolver()
    s1.parameters.num_workers = 4
    s1.parameters.random_seed = random.randint(0, 2_147_483_647)

    x1 = [[m1.NewBoolVar(f'x{i}_{s}') for s in range(TOTAL_SLOTS)] for i in range(n)]

    for s in range(TOTAL_SLOTS):
        m1.Add(sum(x1[i][s] for i in range(n)) <= demand[s])
    for i, p in enumerate(eligible):
        for s in range(TOTAL_SLOTS):
            if p['restricted'][s]:
                m1.Add(x1[i][s] == 0)

    sh1       = [m1.NewIntVar(0, demand[s], f'sh{s}') for s in range(TOTAL_SLOTS)]
    for s in range(TOTAL_SLOTS):
        m1.Add(sh1[s] == demand[s] - sum(x1[i][s] for i in range(n)))
    total_sh1 = m1.NewIntVar(0, total_demand, 'total_sh')
    m1.Add(total_sh1 == sum(sh1))

    m1.Minimize(total_sh1)
    s1.parameters.max_time_in_seconds = PASS1_TIME
    st1 = s1.Solve(m1)
    _log('pass1/shortage', st1, s1)

    if st1 not in (OPTIMAL, FEASIBLE):
        return {**_empty,
                'failed':  [{'person': p, 'reason': '해 없음'} for p in eligible],
                'optimal': False}

    shortage_star = round(s1.ObjectiveValue())

    # ── 배정 목표 계산 (해석적) ────────────────────────────────────────────────
    non_dbl_idx = [i for i in range(n) if not eligible[i].get('double')]
    dbl_idx     = [i for i in range(n) if     eligible[i].get('double')]
    n_non_dbl   = len(non_dbl_idx)
    n_dbl       = len(dbl_idx)

    total_fill = total_demand - shortage_star
    nd_base    = total_fill // n   # 전체 인원 기준 1인당 기본 배정량

    if n_dbl == 0:
        # 전원 비double: 최대 1 차이로 균등
        nd_lo, nd_hi = nd_base, nd_base + 1
        dbl_lo, dbl_hi = 0, 0   # 사용 안 됨
    else:
        # 비double은 정확히 nd_base, 나머지 슬롯을 double이 균등 배분
        nd_lo, nd_hi  = nd_base, nd_base
        remaining     = total_fill - n_non_dbl * nd_base
        dbl_base      = remaining // n_dbl
        dbl_lo, dbl_hi = dbl_base, dbl_base + 1

    # ── Pass 2 ────────────────────────────────────────────────────────────────
    m2 = CpModel()
    s2 = CpSolver()
    s2.parameters.num_workers = 4
    s2.parameters.random_seed = random.randint(0, 2_147_483_647)

    x2 = [[m2.NewBoolVar(f'x{i}_{s}') for s in range(TOTAL_SLOTS)] for i in range(n)]

    # Hard: demand cap + restricted
    for s in range(TOTAL_SLOTS):
        m2.Add(sum(x2[i][s] for i in range(n)) <= demand[s])
    for i, p in enumerate(eligible):
        for s in range(TOTAL_SLOTS):
            if p['restricted'][s]:
                m2.Add(x2[i][s] == 0)

    # Hard: shortage == shortage*  (합계가 고정되므로 load 분배 수도 자동 결정)
    sh2 = [m2.NewIntVar(0, demand[s], f'sh{s}') for s in range(TOTAL_SLOTS)]
    for s in range(TOTAL_SLOTS):
        m2.Add(sh2[s] == demand[s] - sum(x2[i][s] for i in range(n)))
    total_sh2 = m2.NewIntVar(0, total_demand, 'total_sh')
    m2.Add(total_sh2 == sum(sh2))
    m2.Add(total_sh2 == shortage_star)

    # Hard: 균등 배분 load 제약
    #   비double: [nd_lo, nd_hi]  (n_dbl>0 이면 nd_lo==nd_hi → 정확히 nd_base)
    #   double:   [dbl_lo, dbl_hi]  (최대 1 차이)
    load2 = [m2.NewIntVar(0, TOTAL_SLOTS, f'ld{i}') for i in range(n)]
    for i in range(n):
        m2.Add(load2[i] == sum(x2[i][s] for s in range(TOTAL_SLOTS)))
    for i in non_dbl_idx:
        m2.Add(load2[i] >= nd_lo)
        m2.Add(load2[i] <= nd_hi)
    for i in dbl_idx:
        m2.Add(load2[i] >= dbl_lo)
        m2.Add(load2[i] <= dbl_hi)

    # double 인원의 주말 배정 수 (최소화 → 평일 우선)
    max_dbl_wknd = max(1, len(dbl_idx) * len(WEEKEND_SLOTS))
    dbl_wknd = m2.NewIntVar(0, max_dbl_wknd, 'dbl_wknd')
    if dbl_idx:
        m2.Add(dbl_wknd == sum(x2[i][s] for i in dbl_idx for s in WEEKEND_SLOTS))
    else:
        m2.Add(dbl_wknd == 0)

    # 페어링 선호 (최하위 soft)
    pref_terms = []
    for i in range(n):
        for j in range(i + 1, n):
            pref = _pair_preference(eligible[i], eligible[j])
            if pref == 0:
                continue
            for s in range(TOTAL_SLOTS):
                if eligible[i]['restricted'][s] or eligible[j]['restricted'][s]:
                    continue
                if demand[s] < 2:
                    continue
                pv = m2.NewBoolVar(f'pr{i}_{j}_{s}')
                m2.AddMinEquality(pv, [x2[i][s], x2[j][s]])
                pref_terms.append((pref, pv))

    max_pref = sum(p for p, _ in pref_terms) if pref_terms else 0
    pref_v = m2.NewIntVar(0, max(1, max_pref), 'pref_v')
    if pref_terms:
        m2.Add(pref_v == sum(p * v for p, v in pref_terms))
    else:
        m2.Add(pref_v == 0)

    # Objective: pref_v − dbl_wknd * weight
    # weight > max_pref → 주말 배정 1 감소가 전체 페어링 이득보다 우선
    wknd_weight = max_pref + 1
    obj2_lo     = -(max_dbl_wknd * wknd_weight)
    obj2_hi     = max(obj2_lo + 1, max_pref)
    obj2 = m2.NewIntVar(obj2_lo, obj2_hi, 'obj2')
    m2.Add(obj2 == pref_v - dbl_wknd * wknd_weight)
    m2.Maximize(obj2)

    s2.parameters.max_time_in_seconds = PASS2_TIME
    st2 = s2.Solve(m2)
    _log('pass2', st2, s2)

    if st2 not in (OPTIMAL, FEASIBLE):
        return {**_empty,
                'failed':  [{'person': p, 'reason': '해 없음 (pass 2)'} for p in eligible],
                'optimal': False}

    # ── Extract ───────────────────────────────────────────────────────────────
    schedule = {}
    for s in range(TOTAL_SLOTS):
        ids = [eligible[i]['id'] for i in range(n) if s2.Value(x2[i][s]) == 1]
        if ids:
            schedule[s] = ids

    assign_count = {}
    for i, p in enumerate(eligible):
        cnt = sum(s2.Value(x2[i][s]) for s in range(TOTAL_SLOTS))
        if cnt > 0:
            assign_count[p['id']] = cnt

    shortage_out = {}
    for s in range(TOTAL_SLOTS):
        v = s2.Value(sh2[s])
        if v > 0:
            shortage_out[s] = v

    assigned_ids = set(assign_count.keys())
    failed = [
        {
            'person': p,
            'reason': '모든 시간 슬롯 제한됨' if all(p['restricted']) else '자리 없음',
        }
        for p in eligible if p['id'] not in assigned_ids
    ]

    return {
        'schedule':     schedule,
        'shortage':     shortage_out,
        'assign_count': assign_count,
        'failed':       failed,
        'optimal':      (st2 == OPTIMAL),
    }


# ── 단위 검증 (__main__) ──────────────────────────────────────────────────────
#
# 검증 항목:
#   (a) pass1/shortage, pass2 2줄 출력 → 2-pass 동작 ✓
#   (b) 비double 인원이 모두 nd_base 개씩 배정되는지 (n_dbl>0 → 완전 균등)
#   (c) double 인원이 평일부터 채워지고 주말 쏠림이 없는지
#   (d) demand=[2]*21 (총 42슬롯), 8명 (7 비double + 1 double):
#       nd_base = 42//8 = 5 → 비double 각 5, double 1명이 7

if __name__ == '__main__':
    DAY_NAMES   = ['월', '화', '수', '목', '금', '토', '일']
    SHIFT_NAMES = ['아침', '점심', '저녁']

    def _mkp(pid, name, group=None, double=False, rookie=False):
        return {
            'id': pid, 'name': name,
            'restricted': [False] * TOTAL_SLOTS,
            'double': double, 'priority': 0,
            'group': group, 'rookie': rookie,
        }

    persons = [
        _mkp(1,  '이동민', group='A'),
        _mkp(2,  '김기환', group='A'),
        _mkp(3,  '정우진', group='A'),
        _mkp(4,  '윤민형', group='B'),
        _mkp(5,  '한우현', group='B'),
        _mkp(6,  '권정훈', group='B', double=True),
        _mkp(7,  '오승호', group='C'),
        _mkp(8,  '박예찬', group='C', rookie=True),
    ]

    # (d) demand 합 42 < 가용 슬롯(8*21=168) → 균등 배분 검증
    demand = [2] * TOTAL_SLOTS

    print('=== 케이스 1: 균등 배분 (demand=[2]*21, 8명) ===', file=sys.stderr)
    r = generate_flex_schedule(persons, demand)

    print('\n── 배정 결과 ──', file=sys.stderr)
    for s in range(TOTAL_SLOTS):
        day, shift = divmod(s, SHIFTS)
        ids   = r['schedule'].get(s, [])
        names = [p['name'] for p in persons if p['id'] in ids]
        sh    = r['shortage'].get(s, 0)
        row   = f'  {DAY_NAMES[day]} {SHIFT_NAMES[shift]}: {", ".join(names) or "(없음)"}'
        if sh:
            row += f'  ← 부족 {sh}'
        print(row, file=sys.stderr)

    print('\n── 인당 배정 수 (검증 d: 고른 분배, c: double 주말 최소) ──', file=sys.stderr)
    for p in persons:
        cnt  = r['assign_count'].get(p['id'], 0)
        wknd = sum(1 for s in WEEKEND_SLOTS if p['id'] in r['schedule'].get(s, []))
        wd   = cnt - wknd
        tag  = ' ← double' if p.get('double') else ''
        print(f'  {p["name"]:10s}  총={cnt}  평일={wd}  주말={wknd}{tag}', file=sys.stderr)

    print(f'\n총 부족: {sum(r["shortage"].values())}', file=sys.stderr)
    print(f'optimal: {r["optimal"]}', file=sys.stderr)

    # (c) double 주말 쏠림 검증
    for p in persons:
        if not p.get('double'):
            continue
        wknd = sum(1 for s in WEEKEND_SLOTS if p['id'] in r['schedule'].get(s, []))
        wd   = r['assign_count'].get(p['id'], 0) - wknd
        assert wd >= wknd or r['assign_count'].get(p['id'], 0) == 0, \
            f'{p["name"]}: 평일({wd}) < 주말({wknd}) — 주말 쏠림 발생'
    print('\n(c) double 주말 쏠림 없음 ✓', file=sys.stderr)

    # 케이스 2: demand 많음 → shortage 발생
    print('\n=== 케이스 2: shortage 발생 (demand=[4]*21, 4명) ===', file=sys.stderr)
    r2 = generate_flex_schedule(persons[:4], [4] * TOTAL_SLOTS)
    print(f'총 부족: {sum(r2["shortage"].values())}  (기대값 > 0)', file=sys.stderr)
    print(f'optimal: {r2["optimal"]}', file=sys.stderr)
