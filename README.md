# 스케줄 관리 시스템

사내 인원들이 개인의 스케줄을 관리하고 조회할 수 있는 웹 애플리케이션입니다.

## 주요 기능

### 인증 및 회원 관리
- **회원가입**: 이름, 아이디, 비밀번호, 팀 정보로 회원 등록
- **로그인**: 이메일/비밀번호 기반 인증
- **회원 관리**: 관리자 계정으로 회원 정보 조회, 수정, 삭제 (역할 변경 가능)

### 스케줄 관리 (CRUD)
- **업무 등록**: 
  - 업무 아이디 (전사적으로 Unique)
  - 업무명
  - 레벨 (L1~L6)
  - 업무 내용
  - 업무 상태 (진행중, 완료, 연기)
  - 데드라인
  - 비고
- **업무 수정/삭제**: 등록된 업무 수정 및 삭제
- **업무 목록**: 개인 업무 목록 조회 (상태별 필터링)

### 주간 스케줄 뷰
- 주간별로 업무를 달력 형태로 조회 (월요일~일요일)
- 주차별 네비게이션 (이전 주, 다음 주, 오늘)
- 각 날짜별 업무 표시

### 전사 달력 조회
- 모든 직원의 업무를 달력 형태로 조회
- 사용자별 필터링 가능
- 날짜 클릭 시 해당 날짜의 업무 상세 정보 표시

## 기술 스택

- **프론트엔드**: React + TypeScript
- **인증/데이터베이스**: Firebase Authentication + Firestore
- **호스팅**: Firebase Hosting
- **라우팅**: React Router
- **날짜 처리**: date-fns

## 설치 및 실행

### 1. 패키지 설치
```bash
npm install
```

### 2. Firebase 설정
자세한 설정 방법은 [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)를 참고하세요.

`src/firebase/config.ts` 파일에 Firebase 설정 정보를 입력하세요:
- apiKey
- authDomain
- projectId
- storageBucket
- messagingSenderId
- appId

### 3. 개발 서버 실행
```bash
npm start
```

브라우저에서 `http://localhost:3000`으로 접속합니다.

### 4. 빌드
```bash
npm run build
```

### 5. Firebase 배포
```bash
firebase deploy
```

## 프로젝트 구조

```
src/
├── components/          # 재사용 가능한 컴포넌트
│   └── PrivateRoute.tsx
├── context/            # React Context
│   └── AuthContext.tsx  # 인증 관련 Context
├── firebase/           # Firebase 설정
│   └── config.ts
├── pages/              # 페이지 컴포넌트
│   ├── Home.tsx              # 홈 페이지
│   ├── Login.tsx             # 로그인
│   ├── Signup.tsx            # 회원가입
│   ├── UserManagement.tsx    # 회원 관리 (관리자)
│   ├── ScheduleList.tsx      # 업무 목록
│   ├── ScheduleForm.tsx      # 업무 등록/수정
│   ├── WeeklySchedule.tsx    # 주간 스케줄
│   └── CompanyCalendar.tsx   # 전사 달력
├── types/              # TypeScript 타입 정의
│   └── index.ts
└── App.tsx             # 메인 App 컴포넌트
```

## 사용 방법

### 1. 회원가입 및 로그인
1. `/signup` 페이지에서 회원가입
2. `/login` 페이지에서 로그인

### 2. 관리자 계정 설정
1. 일반 계정으로 회원가입
2. Firestore Console에서 해당 사용자의 `role` 필드를 `"admin"`으로 변경
3. 다시 로그인하면 관리자 권한으로 접근 가능

### 3. 업무 등록
1. 홈 페이지에서 "새 업무 등록" 클릭
2. 업무 정보 입력 (업무 아이디는 전사적으로 고유해야 함)
3. 등록 버튼 클릭

### 4. 업무 조회
- **목록 조회**: 홈 페이지에서 "업무 목록" 클릭
- **주간 조회**: 홈 페이지에서 "주간 일정" 클릭
- **전사 달력**: 홈 페이지에서 "전사 달력" 클릭

### 5. 회원 관리 (관리자)
1. 홈 페이지에서 "회원 관리" 클릭
2. 회원 목록에서 역할 변경 또는 삭제

## 주요 페이지

- `/` - 홈 (로그인 필요)
- `/login` - 로그인
- `/signup` - 회원가입
- `/schedule` - 업무 목록 (로그인 필요)
- `/schedule/new` - 새 업무 등록 (로그인 필요)
- `/schedule/edit/:id` - 업무 수정 (로그인 필요)
- `/schedule/weekly` - 주간 스케줄 (로그인 필요)
- `/calendar` - 전사 달력 (로그인 필요)
- `/users` - 회원 관리 (관리자만 접근 가능)

## Firebase 설정

자세한 Firebase 설정 방법은 [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) 파일을 참고하세요.

## 라이선스

MIT
