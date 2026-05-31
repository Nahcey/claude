HIERARCHY = ['member', 'leader', 'admin']


def authorize(event, required_role):
    claims = (
        event.get('requestContext', {})
        .get('authorizer', {})
        .get('jwt', {})
        .get('claims', {})
    )
    if not claims or not claims.get('sub'):
        return {'ok': False, 'status': 401, 'message': 'Missing authorization claims'}

    user_sub = claims['sub']
    email = claims.get('email', '')
    groups_raw = claims.get('cognito:groups', '')

    # API GW JWT authorizer passes cognito:groups as a string.
    # Possible forms: "admin", "admin,leader", "[admin]", "[admin,leader]".
    groups = []
    if isinstance(groups_raw, list):
        groups = groups_raw
    elif isinstance(groups_raw, str) and groups_raw:
        trimmed = groups_raw.strip()
        if trimmed.startswith('['):
            inner = trimmed[1:-1]
            groups = [g.strip().strip('"') for g in inner.split(',')]
        else:
            groups = [g.strip() for g in groups_raw.split(',')]

    role = next((r for r in reversed(HIERARCHY) if r in groups), 'member')

    if HIERARCHY.index(role) < HIERARCHY.index(required_role):
        return {'ok': False, 'status': 403, 'message': 'Forbidden'}

    return {'ok': True, 'userSub': user_sub, 'role': role, 'email': email}
