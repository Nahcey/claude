"""
POST /schedule/flex/generate — 유연 인원 스케줄 생성 (leader, admin)

restricted 길이 21 검증, demand 배열(길이 21, 음 아닌 정수) 검증.
audit action: FLEX_SCHEDULE_GENERATE.
"""
import json
import os
import sys

_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _root not in sys.path:
    sys.path.insert(0, _root)

from lib.auth import authorize
from lib.audit import write_audit
from algo.schedule_flex_cpsat import generate_flex_schedule, TOTAL_SLOTS

_HEADERS = {'Content-Type': 'application/json'}
_MAX_ELIGIBLE = 50
_MAX_DEMAND   = 100   # 슬롯당 최대 요청 인원


def _resp(status, body):
    return {'statusCode': status, 'headers': _HEADERS, 'body': json.dumps(body, ensure_ascii=False)}


def handler(event, context):
    auth = authorize(event, 'leader')
    if not auth['ok']:
        return _resp(auth['status'], {'error': auth['message']})

    try:
        body = json.loads(event.get('body') or '{}')
        eligible = body.get('eligible', [])
        demand   = body.get('demand', [])
    except Exception:
        return _resp(400, {'error': 'Invalid request body'})

    # ── demand 검증 ───────────────────────────────────────────────────────────
    if not isinstance(demand, list) or len(demand) != TOTAL_SLOTS:
        return _resp(400, {'error': f'demand must be an array of {TOTAL_SLOTS} integers'})
    for idx, d in enumerate(demand):
        if not isinstance(d, int) or d < 0:
            return _resp(400, {'error': f'demand[{idx}] must be a non-negative integer'})
        if d > _MAX_DEMAND:
            return _resp(400, {'error': f'demand[{idx}] exceeds maximum of {_MAX_DEMAND}'})

    # ── eligible 검증 ─────────────────────────────────────────────────────────
    if not isinstance(eligible, list):
        return _resp(400, {'error': 'eligible must be an array'})
    if len(eligible) > _MAX_ELIGIBLE:
        return _resp(400, {'error': f'eligible exceeds maximum of {_MAX_ELIGIBLE}'})

    seen_ids = set()
    for idx, p in enumerate(eligible):
        if not isinstance(p, dict):
            return _resp(400, {'error': f'eligible[{idx}] must be an object'})
        pid = p.get('id')
        if not isinstance(pid, int):
            return _resp(400, {'error': f'eligible[{idx}].id must be an integer'})
        if pid in seen_ids:
            return _resp(400, {'error': f'duplicate id {pid}'})
        seen_ids.add(pid)
        if not isinstance(p.get('name'), str):
            return _resp(400, {'error': f'eligible[{idx}].name must be a string'})
        rst = p.get('restricted')
        if (not isinstance(rst, list) or len(rst) != TOTAL_SLOTS
                or not all(isinstance(b, bool) for b in rst)):
            return _resp(400, {'error': f'eligible[{idx}].restricted must be {TOTAL_SLOTS} booleans'})
        if not isinstance(p.get('priority', 0), (int, float)):
            return _resp(400, {'error': f'eligible[{idx}].priority must be a number'})
        if 'double' in p and not isinstance(p['double'], bool):
            return _resp(400, {'error': f'eligible[{idx}].double must be boolean'})
        if 'rookie' in p and not isinstance(p['rookie'], bool):
            return _resp(400, {'error': f'eligible[{idx}].rookie must be boolean'})

    result = generate_flex_schedule(eligible, demand)

    assign_count = {str(k): v for k, v in result['assign_count'].items()}

    write_audit(event, auth, 'FLEX_SCHEDULE_GENERATE', {
        'optimal':      result.get('optimal', False),
        'totalDemand':  sum(demand),
        'totalShortage': sum(result['shortage'].values()),
        'assignCount':  assign_count,
    })

    return _resp(200, {
        'schedule':    {str(k): v for k, v in result['schedule'].items()},
        'shortage':    {str(k): v for k, v in result['shortage'].items()},
        'failed':      [{'id': f['person']['id'], 'reason': f['reason']} for f in result['failed']],
        'assignCount': assign_count,
        'optimal':     result.get('optimal', False),
    })
