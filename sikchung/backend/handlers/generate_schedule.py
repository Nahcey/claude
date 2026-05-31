import json
import os
import sys

# ensure backend root (parent of handlers/) is on sys.path for sibling imports
_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _root not in sys.path:
    sys.path.insert(0, _root)

from lib.auth import authorize
from algo.schedule_cpsat import generate_schedule

_CORS = {'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json'}


def _resp(status, body):
    return {'statusCode': status, 'headers': _CORS, 'body': json.dumps(body, ensure_ascii=False)}


def handler(event, context):
    auth = authorize(event, 'leader')
    if not auth['ok']:
        return _resp(auth['status'], {'error': auth['message']})

    try:
        body = json.loads(event.get('body') or '{}')
        eligible = body.get('eligible', [])
    except Exception:
        return _resp(400, {'error': 'Invalid request body'})

    if not isinstance(eligible, list):
        return _resp(400, {'error': 'eligible must be an array'})

    result = generate_schedule(eligible)

    # schedule: person dicts → ids (JSON numbers)
    schedule_ids = [
        [p['id'] if p else None for p in slot]
        for slot in result['schedule']
    ]

    # assignCount: {int_id: units} → {"str_id": units} (JSON keys must be strings)
    assign_count = {str(k): v for k, v in result['assign_count'].items()}

    return _resp(200, {
        'schedule':    schedule_ids,
        'skipped':     [{'id': s['person']['id'], 'reason': s['reason']} for s in result['skipped']],
        'failed':      [{'id': f['person']['id'], 'reason': f['reason']} for f in result['failed']],
        'fullDays':    result['full_days'],
        'emptySlots':  result['empty_slots'],
        'assignCount': assign_count,
        'optimal':     result.get('optimal', False),
    })
