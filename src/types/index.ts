// 사용자 (회원) 타입
export interface User {
  id: string; // Firestore 문서 ID
  uid: string; // Firebase Auth UID
  name: string; // 이름
  username: string; // 아이디 (로그인용)
  team: string; // 팀
  role: 'admin' | 'user'; // 역할: 관리자 또는 일반 사용자
  hireDate?: string; // 입사일 (yyyy-MM-dd 형식, 선택값)
  annualLeaveDays?: number; // 1년 초과 시 연차 일수 (직접 입력)
  substituteHolidays?: string[]; // 대체 휴무일 배열 (yyyy-MM-dd 형식)
  createdAt: string; // 생성일시
  updatedAt?: string; // 수정일시
}

// 스케줄 (업무) 타입
export interface ScheduleHistory {
  field: string; // 변경된 필드명
  oldValue: string; // 이전 값
  newValue: string; // 새로운 값
  changedBy: string; // 변경한 사용자 이름
  changedAt: any; // 변경일시 (Firebase Timestamp)
}

// 스케줄 의견 타입
export interface ScheduleComment {
  id?: string; // 의견 ID
  text: string; // 의견 내용
  createdBy: string; // 작성자 이름
  createdByUid: string; // 작성자 UID
  createdAt: any; // 작성일시 (Firebase Timestamp)
}

export interface Schedule {
  id: string; // Firestore 문서 ID
  taskId: string; // 업무 아이디 (전사적으로 Unique)
  taskName: string; // 업무명
  level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6' | '휴가' | '재택' | '미팅'; // 레벨
  description: string; // 업무 내용
  status: '대기중' | '진행중' | '완료' | '연기'; // 업무 상태
  deadline?: string; // 데드라인 (ISO date string) - 하위 호환성을 위해 유지, startDate/endDate 사용 권장
  startDate?: string; // 시작일 (ISO date string)
  endDate?: string; // 종료일 (ISO date string)
  startTime?: string; // 시작 시간 (HH:mm 형식, 미팅용)
  endTime?: string; // 종료 시간 (HH:mm 형식, 미팅용)
  location?: '회의실' | '외부' | string; // 회의 장소 (미팅용)
  isPublic?: boolean; // 전사 스케줄 노출 여부 (기본값: false)
  note?: string; // 비고
  userId: string; // 사용자 ID (어떤 사용자의 업무인지)
  userName: string; // 사용자 이름 (조회 시 편의를 위해)
  createdAt: string; // 생성일시
  updatedAt?: string; // 수정일시
  history?: ScheduleHistory[]; // 변경 이력
  comments?: ScheduleComment[]; // 의견 목록
}

// 레벨 설명 상수
export const LEVEL_DESCRIPTIONS: { [key: string]: string } = {
  'L1': '심부름. 단순 육체노동. 사무직으로는 누가 회사에 왔는지 기록하고 커피심부름 하고 청소하는 경리업무 혹은 서비스 업무',
  'L2': '이미 기록되어 있는 단순한 매뉴얼을 그대로 따라하는 업무.',
  'L3': '업무를 하는 방법(매뉴얼)을 내부나 외부에서 찾아서 그대로 따라하는 업무(PRS)',
  'L4': '주어진 룰안에서 업무를 하는 방법을 본인 스스로가 생각하여 최적의 방법으로 혼자서 해결하는 업무(성과개념)',
  'L5': '타인과 커뮤니케이션을 해서 내가 원하는 시나리오 및 방법대로 업무를 처리할수 있게 타인을 유도하여 업무를 해결하는 업무(성과개념)',
  'L6': '타인과 커뮤니케이션이나 기존의 룰로 만으로는 해결할수 없는 말그대로 창조의 업무.(성과개념)',
  '휴가': '휴가',
  '재택': '재택근무',
  '미팅': '미팅',
};

// 주간 뷰를 위한 타입
export interface WeeklySchedule {
  week: string; // 주차 식별자 (예: "2024-01-01" - 해당 주의 월요일)
  schedules: Schedule[]; // 해당 주의 스케줄들
}

// 휴가(연차) 타입
export interface Vacation {
  id: string; // Firestore 문서 ID
  userId: string; // 대상 사용자 UID
  date: string; // 사용 일자 (yyyy-MM-dd)
  days: number; // 사용 일수 (기본 1)
  reason?: string; // 사유
  substituteUserName?: string; // 대직자 이름 (기록 보존을 위해 이름만 저장)
  createdByUid: string; // 입력한 사람 UID
  createdByName: string; // 입력한 사람 이름
  createdAt: any; // 생성일시 (Firebase Timestamp)
}

// 대체 휴무 신청 타입
export interface SubstituteHolidayRequest {
  id: string; // Firestore 문서 ID
  userId: string; // 신청자 UID
  userName: string; // 신청자 이름
  workDate: string; // 근무한 휴일 (yyyy-MM-dd)
  useDate: string; // 사용하려는 휴일 (yyyy-MM-dd)
  date?: string; // 하위 호환성을 위한 필드 (useDate와 동일)
  reason?: string; // 신청 사유 (선택)
  substituteUserName?: string; // 대직자 이름 (기록 보존을 위해 이름만 저장)
  status: 'pending' | 'approved' | 'rejected'; // 상태: 대기중, 승인, 반려
  rejectedReason?: string; // 반려 사유
  createdByUid: string; // 신청자 UID
  createdByName: string; // 신청자 이름
  createdAt: any; // 신청일시 (Firebase Timestamp)
  reviewedByUid?: string; // 승인/반려한 관리자 UID
  reviewedByName?: string; // 승인/반려한 관리자 이름
  reviewedAt?: any; // 승인/반려 일시 (Firebase Timestamp)
}

// 게시판 글 타입
export interface Post {
  id: string; // Firestore 문서 ID
  title: string; // 글 제목
  content: string; // 글 내용
  category: 'notice' | 'bug' | 'general'; // 카테고리: 공지, 버그리포트, 일반
  authorUid: string; // 작성자 UID
  authorName: string; // 작성자 이름
  createdAt: any; // 작성일시 (Firebase Timestamp)
  updatedAt?: any; // 수정일시 (Firebase Timestamp)
}
