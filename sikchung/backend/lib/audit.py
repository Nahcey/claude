import os
import secrets
from datetime import datetime, timezone

import boto3

# 감사 로그 기록기 (Python 핸들러용 — generate_schedule).
# audit.js 와 동일 로직. 예외를 삼키고 print 로만 남긴다.
#
# generate_schedule 은 무거운 CP-SAT 작업(수십 초)이므로 PutItem 한 건(수 ms)을
# 동기 호출해도 무방하다. threading.Thread 는 Lambda freeze 위험이 있어 쓰지 않는다.

_TABLE_NAME = os.environ.get('TABLE_NAME')
_table = (
    boto3.resource('dynamodb', region_name=os.environ.get('AWS_REGION', 'ap-northeast-2'))
    .Table(_TABLE_NAME)
    if _TABLE_NAME else None
)


def write_audit(event, auth, action, detail=None):
    """감사 로그를 기록한다. 예외를 삼키고 print 로만 남겨 본 응답을 막지 않는다.

    Args:
        event:  Lambda 이벤트 (sourceIp 추출용)
        auth:   authorize() 결과 ({'userSub', 'role'})
        action: 액션 코드 (예: 'SCHEDULE_GENERATE')
        detail: 액션별 추가 정보 (대용량 데이터 금지)
    """
    try:
        if _table is None:
            return
        now = datetime.now(timezone.utc)
        # JS toISOString() 과 동일 형식: 2026-06-01T12:34:56.789Z
        timestamp = now.strftime('%Y-%m-%dT%H:%M:%S.') + f'{now.microsecond // 1000:03d}Z'
        sk = timestamp + '#' + secrets.token_hex(3)

        item = {
            'PK':        'AUDIT',
            'SK':        sk,
            'timestamp': timestamp,
            'action':    action,
            'actorSub':  (auth or {}).get('userSub'),
            'actorRole': (auth or {}).get('role'),
            'detail':    detail or {},
        }
        if detail and detail.get('targetSub'):
            item['targetSub'] = detail['targetSub']

        ip = (event or {}).get('requestContext', {}).get('http', {}).get('sourceIp')
        if ip:
            item['ip'] = ip

        _table.put_item(Item=item)
    except Exception as e:
        print('[audit] write failed:', e)
