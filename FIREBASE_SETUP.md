# Firebase 설정 가이드

이 프로젝트를 사용하기 전에 Firebase 설정이 필요합니다.

## 1. Firebase 프로젝트 생성

1. [Firebase Console](https://console.firebase.google.com/)에 접속
2. "프로젝트 추가" 클릭
3. 프로젝트 이름 입력
4. Google Analytics 설정 (선택사항)
5. 프로젝트 생성 완료

## 2. 웹 앱 추가

1. Firebase 프로젝트 대시보드에서 "웹 앱 추가" (</>) 아이콘 클릭
2. 앱 닉네임 입력
3. "Firebase Hosting도 설정" 체크 (선택사항)
4. "앱 등록" 클릭

## 3. Firebase 설정 정보 입력

생성된 Firebase 설정 정보를 다음 파일에 입력하세요:

**파일 위치:** `src/firebase/config.ts`

```typescript
const firebaseConfig = {
  apiKey: "YOUR_API_KEY", // 여기에 API 키를 입력하세요
  authDomain: "YOUR_AUTH_DOMAIN", // 예: your-project.firebaseapp.com
  projectId: "YOUR_PROJECT_ID", // 여기에 프로젝트 ID를 입력하세요
  storageBucket: "YOUR_STORAGE_BUCKET", // 예: your-project.appspot.com
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID", // 여기에 메시징 송신자 ID를 입력하세요
  appId: "YOUR_APP_ID", // 여기에 앱 ID를 입력하세요
};
```

## 4. Firebase Authentication 설정

1. Firebase Console에서 "Authentication" 메뉴 클릭
2. "시작하기" 클릭
3. "이메일/비밀번호" 인증 방법 활성화
4. "이메일/비밀번호" 토글 ON
5. 저장

## 5. Firestore Database 설정

1. Firebase Console에서 "Firestore Database" 메뉴 클릭
2. "데이터베이스 만들기" 클릭
3. 보안 규칙 모드 선택:
   - **테스트 모드** (개발용)
   - **프로덕션 모드** (운영용 - 권장)

### Firestore 보안 규칙 (firestore.rules)

프로덕션 환경에서는 다음 규칙을 사용하는 것을 권장합니다:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // 사용자 컬렉션
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
      allow delete: if request.auth != null && 
        (request.auth.uid == userId || 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }
    
    // 스케줄 컬렉션
    match /schedules/{scheduleId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && 
        request.resource.data.userId == request.auth.uid;
      allow update, delete: if request.auth != null && 
        (resource.data.userId == request.auth.uid || 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin');
    }
  }
}
```

## 6. 관리자 계정 생성

처음 프로젝트를 시작할 때 관리자 계정을 수동으로 생성해야 합니다:

1. 회원가입을 통해 일반 계정 생성
2. Firestore Console에서 `users` 컬렉션을 열고
3. 생성된 사용자 문서를 찾아
4. `role` 필드를 `"admin"`으로 변경

또는 Firebase Console의 Authentication에서 관리자 이메일을 확인한 후,
Firestore에서 해당 UID를 가진 문서의 `role`을 `"admin"`으로 변경하세요.

## 7. Firebase Hosting 배포 (선택사항)

1. Firebase CLI 설치:
   ```bash
   npm install -g firebase-tools
   ```

2. Firebase 로그인:
   ```bash
   firebase login
   ```

3. 프로젝트 초기화 (이미 firebase.json이 있으면 생략 가능):
   ```bash
   firebase init
   ```

4. 프로젝트 빌드:
   ```bash
   npm run build
   ```

5. 배포:
   ```bash
   firebase deploy
   ```

## 주요 Firestore 컬렉션 구조

### users 컬렉션
```
users/{userId}
  - uid: string
  - name: string
  - username: string
  - team: string
  - role: 'admin' | 'user'
  - createdAt: timestamp
  - updatedAt?: timestamp
```

### schedules 컬렉션
```
schedules/{scheduleId}
  - taskId: string (전사적으로 Unique)
  - taskName: string
  - level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6'
  - description: string
  - status: '진행중' | '완료' | '연기'
  - deadline: timestamp
  - note?: string
  - userId: string
  - userName: string
  - createdAt: timestamp
  - updatedAt?: timestamp
```

## 문제 해결

### 인증 오류
- Firebase Console에서 Authentication이 활성화되어 있는지 확인
- 이메일/비밀번호 인증 방법이 활성화되어 있는지 확인

### Firestore 오류
- Firestore Database가 생성되어 있는지 확인
- 보안 규칙이 올바르게 설정되어 있는지 확인

### 빌드 오류
- `npm install`을 실행하여 모든 패키지가 설치되었는지 확인
- Firebase 설정 정보가 올바르게 입력되었는지 확인
