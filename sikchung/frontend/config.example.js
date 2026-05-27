// config.js 생성 방법:
//   1. GitHub Actions 완료 후 해당 워크플로우의 "Print stack outputs" 단계에서 값 확인
//   2. 이 파일을 복사해 sikchung/frontend/config.js 를 만들고 실제 값으로 채울 것
//   3. config.js 는 .gitignore 에 등록되어 있으므로 절대 커밋하지 않는다
//
// ── 로컬 테스트 (4단계) ───────────────────────────────────────────────────────
//   1. cd sikchung/frontend && python3 -m http.server 8080
//   2. redirectUri 를 'http://localhost:8080/index3.html' 로 설정
//   3. http://localhost:8080/index3.html 을 브라우저로 열기
//   (Cognito 는 http://localhost 를 HTTPS 예외로 허용함)
//
// ── 프로덕션 (5단계: CloudFront 설정 후) ─────────────────────────────────────
//   redirectUri 를 'https://CLOUDFRONT_DOMAIN/index3.html' 로 교체

window.APP_CONFIG = {
  // SAM Output: ApiEndpoint
  apiEndpoint:   'https://XXXXXXXXXX.execute-api.ap-northeast-2.amazonaws.com/prod',

  // SAM Output: CognitoDomain  (https:// 포함)
  cognitoDomain: 'https://sikchung-auth-ACCOUNTID.auth.ap-northeast-2.amazoncognito.com',

  // SAM Output: ClientId
  clientId:      'COGNITO_CLIENT_ID',

  // 로컬 테스트:  'http://localhost:8080/index3.html'
  // 5단계 이후:   'https://CLOUDFRONT_DOMAIN/index3.html'
  redirectUri:   'http://localhost:8080/index3.html',
};
