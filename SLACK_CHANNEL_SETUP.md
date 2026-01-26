# Slack 채널 설정 가이드

## 현재 설정 위치

Slack Webhook URL은 `src/utils/slackNotification.ts` 파일의 4번째 줄에 설정되어 있습니다.

```typescript
const SLACK_WEBHOOK_URL = 'https://hooks.slack.com/services/...';
```

## 채널 변경 방법

### 방법 1: 기존 Webhook URL의 채널 변경

1. Slack 워크스페이스에 로그인
2. https://api.slack.com/apps 접속
3. 기존에 생성한 App 선택 (또는 새로 생성)
4. 왼쪽 메뉴에서 "Incoming Webhooks" 선택
5. 기존 Webhook의 "Settings" 클릭
6. "Post to Channel"에서 원하는 채널 선택
7. "Save Settings" 클릭

### 방법 2: 새로운 채널용 Webhook URL 생성

1. Slack 워크스페이스에 로그인
2. https://api.slack.com/apps 접속
3. 기존 App 선택 (또는 새로 생성)
4. 왼쪽 메뉴에서 "Incoming Webhooks" 선택
5. "Add New Webhook to Workspace" 클릭
6. **알림을 받을 채널 선택** (예: #휴가알림, #일정관리 등)
7. "Allow" 클릭
8. 생성된 새로운 Webhook URL 복사
9. `src/utils/slackNotification.ts` 파일의 `SLACK_WEBHOOK_URL` 값을 새 URL로 교체

### 방법 3: 여러 채널로 알림 보내기

여러 채널로 알림을 보내려면 각 채널마다 Webhook URL을 생성하고, 코드를 수정해야 합니다.

예시:
```typescript
const SLACK_WEBHOOK_URLS = {
  vacation: 'https://hooks.slack.com/services/...', // 휴가 채널
  substitute: 'https://hooks.slack.com/services/...', // 대체휴무 채널
};
```

## 주의사항

- Webhook URL은 **채널별로 고유**합니다
- 하나의 Webhook URL은 **하나의 채널**로만 메시지를 보낼 수 있습니다
- 여러 채널로 보내려면 각 채널마다 Webhook URL을 생성해야 합니다
- Webhook URL은 보안상 공개 저장소에 커밋하지 않는 것이 좋지만, 내부용이므로 현재는 코드에 직접 포함되어 있습니다

## 채널 변경 후

코드를 수정한 후에는:
1. 빌드: `npm run build`
2. 배포: `firebase deploy --only hosting`

또는 개발 중이라면:
- 저장 후 자동 리로드되며 즉시 반영됩니다
