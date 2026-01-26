# Slack 알림 설정 가이드

## 1. Slack Webhook URL 생성

1. Slack 워크스페이스에 로그인
2. https://api.slack.com/apps 접속
3. "Create New App" 클릭
4. "From scratch" 선택
5. App 이름과 워크스페이스를 입력하고 생성
6. 왼쪽 메뉴에서 "Incoming Webhooks" 선택
7. "Activate Incoming Webhooks" 토글 활성화
8. "Add New Webhook to Workspace" 클릭
9. 알림을 받을 채널 선택
10. 생성된 Webhook URL 복사 (예: `https://hooks.slack.com/services/XXXXX/XXXXX/XXXXX`)

## 2. Firebase Functions 환경 변수 설정

Firebase CLI를 사용하여 Slack Webhook URL을 환경 변수로 설정합니다:

```bash
firebase functions:config:set slack.webhook_url="YOUR_SLACK_WEBHOOK_URL"
```

예시:
```bash
firebase functions:config:set slack.webhook_url="https://hooks.slack.com/services/XXXXX/XXXXX/XXXXX"
```

## 3. Functions 배포

```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```

## 4. 알림 내용

다음 이벤트 발생 시 Slack으로 알림이 전송됩니다:

- ✅ **휴가 등록**: 사용자가 휴가를 등록하면 알림 전송
- 🔄 **대체휴무 신청**: 사용자가 대체휴무를 신청하면 알림 전송
- ✅ **대체휴무 승인**: 관리자가 대체휴무 신청을 승인하면 알림 전송
- ❌ **대체휴무 반려**: 관리자가 대체휴무 신청을 반려하면 알림 전송

## 5. 환경 변수 확인

설정된 환경 변수를 확인하려면:

```bash
firebase functions:config:get
```

## 6. 로그 확인

Functions 로그를 확인하려면:

```bash
firebase functions:log
```

## 주의사항

- Webhook URL은 절대 공개 저장소에 커밋하지 마세요
- `.gitignore`에 환경 변수 파일이 포함되어 있는지 확인하세요
- Functions는 `asia-northeast3` 리전에 배포됩니다
