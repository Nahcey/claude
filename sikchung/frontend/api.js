'use strict';
// HTTP API client — all requests go through fetchApi()

(function () {
  async function fetchApi(path, opts, _retry) {
    opts   = opts   === undefined ? {}   : opts;
    _retry = _retry === undefined ? true : _retry;

    const { idToken } = Auth.getTokens();
    if (!idToken) {
      const err = new Error('Not authenticated');
      err.status = 401;
      throw err;
    }

    const res = await fetch(window.APP_CONFIG.apiEndpoint + path, {
      ...opts,
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + idToken,
        ...(opts.headers || {}),
      },
    });

    if (res.status === 401 && _retry) {
      try {
        await Auth.refreshTokens();
        return fetchApi(path, opts, false);
      } catch (_) {
        const err = new Error('세션이 만료됐습니다. 다시 로그인하세요.');
        err.status = 401;
        throw err;
      }
    }

    if (!res.ok) {
      let msg;
      try { msg = (await res.json()).error; } catch (_) { msg = res.statusText; }
      const err = new Error(msg || 'HTTP ' + res.status);
      err.status = res.status;
      throw err;
    }

    if (res.status === 204) return null;
    return res.json();
  }

  const getMe               = ()            => fetchApi('/me');
  const putMe               = (d)           => fetchApi('/me',                    { method: 'PUT',    body: JSON.stringify(d) });
  const getMembers          = ()            => fetchApi('/members');
  const putMember           = (sub, d)      => fetchApi('/member/' + sub,         { method: 'PUT',    body: JSON.stringify(d) });
  const getLatestSchedule   = ()            => fetchApi('/schedule/latest');
  const getScheduleMode     = ()            => fetchApi('/schedule/mode');   // 변경은 admin CLI 전용
  const postSchedule        = (wId, sd, mode) => fetchApi('/schedule',            { method: 'POST',   body: JSON.stringify({ weekId: wId, scheduleData: sd, mode: mode || 'normal' }) });
  const deleteSchedule      = ()            => fetchApi('/schedule/latest',        { method: 'DELETE' });
  const generateSchedule    = (eligible, mode) => fetchApi('/schedule/generate',   { method: 'POST', body: JSON.stringify({ eligible, mode: mode || 'normal' }) });
  const generateFlexSchedule = (eligible, demand) => fetchApi('/schedule/flex/generate', { method: 'POST', body: JSON.stringify({ eligible, demand }) });
  const postUser            = (d)           => fetchApi('/user',                  { method: 'POST',   body: JSON.stringify(d) });
  const deleteUser          = (sub)         => fetchApi('/user/' + sub,           { method: 'DELETE' });
  const putUserRole         = (sub, role)   => fetchApi('/user/' + sub + '/role', { method: 'PUT',    body: JSON.stringify({ role }) });
  const getAuditLogs        = (limit, cursor) => {
    const p = new URLSearchParams();
    if (limit)  p.set('limit', limit);
    if (cursor) p.set('cursor', cursor);
    const qs = p.toString();
    return fetchApi('/audit' + (qs ? '?' + qs : ''));
  };

  window.API = {
    getMe, putMe,
    getMembers, putMember,
    getLatestSchedule, postSchedule, deleteSchedule, generateSchedule, generateFlexSchedule,
    getScheduleMode,
    postUser, deleteUser, putUserRole,
    getAuditLogs,
  };
})();
