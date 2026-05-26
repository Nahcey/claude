// 이 파일을 복사해 config.js로 만든 뒤 실제 값으로 채우세요.
// config.js는 .gitignore에 등록됨 (GitHub Actions가 배포 시 자동 생성)
window.APP_CONFIG = {
  apiEndpoint:   'https://XXXXXXXXXX.execute-api.ap-northeast-2.amazonaws.com/prod',
  cognitoDomain: 'https://sikchung-auth-ACCOUNTID.auth.ap-northeast-2.amazoncognito.com',
  clientId:      'COGNITO_CLIENT_ID',
  redirectUri:   'https://CLOUDFRONT_DOMAIN/callback', // 5단계 이전엔 로컬 파일 경로 사용
};
