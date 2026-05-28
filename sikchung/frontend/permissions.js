'use strict';
// JWT id_token payload decoding (no signature verification — API Gateway validates)

(function () {
  function decodeIdToken(token) {
    try {
      const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      const json = decodeURIComponent(
        atob(b64.padEnd(b64.length + (4 - b64.length % 4) % 4, '='))
          .split('').map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
      );
      return JSON.parse(json);
    } catch (e) {
      console.error('[Permissions] decode failed:', e);
      return null;
    }
  }

  function getCurrentUser() {
    const { idToken } = Auth.getTokens();
    if (!idToken) return null;
    const c = decodeIdToken(idToken);
    if (!c) return null;
    const raw = c['cognito:groups'];
    const groups = Array.isArray(raw) ? raw : (raw ? raw.split(',').map(g => g.trim()) : []);
    // username 기반 풀: email 이 없을 수 있으므로 username/sub 를 식별자 폴백으로 사용
    const username = c['cognito:username'] || c.username || c.sub;
    return {
      sub:         c.sub,
      username,
      email:       c.email || '',
      displayName: c['custom:displayName'] || username,
      groups,
      isAdmin:  groups.includes('admin'),
      isLeader: groups.includes('admin') || groups.includes('leader'),
      isMember: true,
    };
  }

  window.Permissions = { getCurrentUser, decodeIdToken };
})();
