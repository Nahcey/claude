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
    url.searchParams.set('scope', 'openid email profile aws.cognito.signin.user.admin');
    window.location.href = url.toString();
  }

  function logout() {
    const { cognitoDomain, clientId, redirectUri } = cfg();
    clearTokens();
    localStorage.setItem('sikchung_logged_out', '1'); // 자동 리다이렉트 억제 플래그
    console.log('[Auth] logout: clearing Cognito session');
    // Cognito /logout 엔드포인트로 리다이렉트 → 서버측 세션 쿠키 삭제
    // logout_uri 는 UserPoolClient.LogoutURLs 에 등록된 값과 문자 단위로 일치해야 함
    if (cognitoDomain && clientId) {
      const url = new URL(cognitoDomain + '/logout');
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('logout_uri', redirectUri || (window.location.origin + window.location.pathname));
      window.location.href = url.toString();
    } else {
      // APP_CONFIG 미로드 시 폴백 (Cognito 세션은 남을 수 있음)
      window.location.href = window.location.origin + window.location.pathname;
    }
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

  // 현재 로그인된 사용자가 직접 비밀번호를 변경한다.
  // Cognito ChangePassword API — AccessToken 기반, SRP 불필요.
  async function changePassword(previousPassword, proposedPassword) {
    const { cognitoDomain } = cfg();
    const regionMatch = cognitoDomain && cognitoDomain.match(/\.auth\.([^.]+)\.amazoncognito\.com/);
    if (!regionMatch) throw new Error('APP_CONFIG.cognitoDomain 형식 오류');
    const region = regionMatch[1];
    const { accessToken } = getTokens();
    if (!accessToken) throw new Error('로그인 상태가 아닙니다.');
    const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
      method:  'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': 'AWSCognitoIdentityProviderService.ChangePassword',
      },
      body: JSON.stringify({
        AccessToken:       accessToken,
        PreviousPassword:  previousPassword,
        ProposedPassword:  proposedPassword,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const type = data.__type || '';
      const msg  = data.message || '';
      if (type === 'NotAuthorizedException') {
        if (msg.toLowerCase().includes('scope') || msg.toLowerCase().includes('token'))
          throw new Error('로그아웃 후 다시 로그인하면 변경할 수 있습니다.');
        throw new Error('현재 비밀번호가 틀렸습니다.');
      }
      if (type === 'InvalidPasswordException') throw new Error('새 비밀번호가 정책을 위반합니다.');
      if (type === 'LimitExceededException')   throw new Error('시도 횟수를 초과했습니다. 잠시 후 다시 시도하세요.');
      throw new Error(msg || '비밀번호 변경 실패');
    }
  }

  window.Auth = { login, logout, handleCallback, refreshTokens, getTokens, isLoggedIn, changePassword };
})();
