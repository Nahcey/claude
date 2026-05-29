'use strict';
// Cognito Hosted UI — OAuth2 authorization_code flow

(function () {
  const KEYS = {
    id:      'sikchung_id_token',
    access:  'sikchung_access_token',
    refresh: 'sikchung_refresh_token',
    expiry:  'sikchung_token_expiry',
  };

  let _refreshTimer = null;

  function cfg() { return window.APP_CONFIG || {}; }

  function getTokens() {
    return {
      idToken:      localStorage.getItem(KEYS.id),
      accessToken:  localStorage.getItem(KEYS.access),
      refreshToken: localStorage.getItem(KEYS.refresh),
      expiry:       Number(localStorage.getItem(KEYS.expiry)) || 0,
    };
  }

  function storeTokens(data) {
    localStorage.removeItem('sikchung_logged_out'); // 로그인 성공 시 로그아웃 플래그 제거
    const expiry = Date.now() + (data.expires_in || 3600) * 1000;
    localStorage.setItem(KEYS.id,     data.id_token);
    localStorage.setItem(KEYS.access, data.access_token);
    if (data.refresh_token) localStorage.setItem(KEYS.refresh, data.refresh_token);
    localStorage.setItem(KEYS.expiry, String(expiry));
    _scheduleRefresh(expiry);
  }

  function clearTokens() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    if (_refreshTimer) { clearTimeout(_refreshTimer); _refreshTimer = null; }
  }

  function isLoggedIn() {
    const { idToken, expiry } = getTokens();
    return !!(idToken && expiry > Date.now() + 10000);
  }

  function login() {
    const { cognitoDomain, clientId, redirectUri } = cfg();
    if (!cognitoDomain) { alert('APP_CONFIG가 설정되지 않았습니다.'); return; }
    const url = new URL(cognitoDomain + '/oauth2/authorize');
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'openid email profile');
    window.location.href = url.toString();
  }

  function logout() {
    clearTokens();
    localStorage.setItem('sikchung_logged_out', '1'); // 자동 리다이렉트 억제 플래그
    console.log('[Auth] logout: flag set, redirecting');
    window.location.href = window.location.origin + window.location.pathname;
  }

  async function _tokenRequest(params) {
    const { cognitoDomain } = cfg();
    const res = await fetch(cognitoDomain + '/oauth2/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    new URLSearchParams(params).toString(),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error('Token request failed: ' + text);
    }
    return res.json();
  }

  async function handleCallback() {
    const code = new URLSearchParams(window.location.search).get('code');
    if (!code) return false;
    history.replaceState(null, '', window.location.pathname);
    const { clientId, redirectUri } = cfg();
    const data = await _tokenRequest({
      grant_type:   'authorization_code',
      client_id:    clientId,
      redirect_uri: redirectUri,
      code,
    });
    storeTokens(data);
    return true;
  }

  async function refreshTokens() {
    const { refreshToken } = getTokens();
    if (!refreshToken) throw new Error('No refresh token available');
    const { clientId } = cfg();
    const data = await _tokenRequest({
      grant_type:    'refresh_token',
      client_id:     clientId,
      refresh_token: refreshToken,
    });
    storeTokens(data);
    return data;
  }

  function _scheduleRefresh(expiry) {
    if (_refreshTimer) clearTimeout(_refreshTimer);
    const ms = expiry - Date.now() - 5 * 60 * 1000;
    if (ms > 0) {
      _refreshTimer = setTimeout(
        () => refreshTokens().catch(e => console.warn('[Auth] auto-refresh failed:', e)),
        ms
      );
    }
  }

  // Resume auto-refresh on page reload if already logged in
  (function () {
    const { expiry } = getTokens();
    if (expiry > Date.now()) _scheduleRefresh(expiry);
  })();

  window.Auth = { login, logout, handleCallback, refreshTokens, getTokens, isLoggedIn };
})();
