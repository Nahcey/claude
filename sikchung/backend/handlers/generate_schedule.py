import json
import os
import sys

# ensure backend root (parent of handlers/) is on sys.path for sibling imports
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _root not in sys.path:
    sys.path.insert(0, _root)

from lib.auth import authorize
from lib.audit import write_audit
from algo.schedule_cpsat import generate_schedule

_HEADERS = {'Content-Type': 'application/json'}


def _resp(status, body):
    return {'statusCode': status, 'headers': _HEADERS, 'body': json.dumps(body, ensure_ascii=False)}


def handler(event, context):
    auth = authorize(event, 'leader')
    if not auth['ok']:
        return _resp(auth['status'], {'error': auth['message']})

    try:
        body = json.loads(event.get('body') or '{}')
        eligible = body.get('eligible', [])
        mode = body.get('mode', 'normal')
    except Exception:
        return _resp(400, {'error': 'Invalid request body'})

    if not isinstance(eligible, list):
        return _resp(400, {'error': 'eligible must be an array'})

    if mode not in ('normal', 'summer'):
        return _resp(400, {'error': "mode must be 'normal' or 'summer'"})

    # --- trust boundary: validate all caller-supplied fields ---
    if len(eligible) > 50:
        return _resp(400, {'error': 'eligible exceeds maximum of 50'})

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
        if (not isinstance(rst, list) or len(rst) != 12
                or not all(isinstance(b, bool) for b in rst)):
            return _resp(400, {'error': f'eligible[{idx}].restricted must be 12 booleans'})
        if not isinstance(p.get('priority', 0), (int, float)):
            return _resp(400, {'error': f'eligible[{idx}].priority must be a number'})
        if 'double' in p and not isinstance(p['double'], bool):
            return _resp(400, {'error': f'eligible[{idx}].double must be boolean'})
        if 'rookie' in p and not isinstance(p['rookie'], bool):
            return _resp(400, {'error': f'eligible[{idx}].rookie must be boolean'})

    result = generate_schedule(eligible, mode=mode)

    # schedule: person dicts → ids (JSON numbers)
    schedule_ids = [
        [p['id'] if p else None for p in slot]
        for slot in result['schedule']
    ]

    # assignCount: {int_id: units} → {"str_id": units} (JSON keys must be strings)
    assign_count = {str(k): v for k, v in result['assign_count'].items()}

    # 감사 로그: 동기 호출이지만 write_audit 내부에서 예외를 삼켜 본 응답을 막지 않음
    write_audit(event, auth, 'SCHEDULE_GENERATE', {
        'mode':         mode,
        'optimal':      result.get('optimal', False),
        'skippedCount': len(result['skipped']),
        'assignCount':  assign_count,
    })

    return _resp(200, {
        'mode':        mode,
        'schedule':    schedule_ids,
        'skipped':     [{'id': s['person']['id'], 'reason': s['reason']} for s in result['skipped']],
        'failed':      [{'id': f['person']['id'], 'reason': f['reason']} for f in result['failed']],
        'fullDays':    result['full_days'],
        'emptySlots':  result['empty_slots'],
        'assignCount': assign_count,
        'optimal':     result.get('optimal', False),
    })
