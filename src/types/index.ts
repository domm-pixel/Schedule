// 사용자 (회원) 타입
export interface User {
  id: string; // Firestore 문서 ID
  uid: string; // Firebase Auth UID
  name: string; // 이름
  username: string; // 아이디 (로그인용)
  team: string; // 팀
  role: 'admin' | 'user'; // 역할: 관리자 또는 일반 사용자
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

export interface Schedule {
  id: string; // Firestore 문서 ID
  taskId: string; // 업무 아이디 (전사적으로 Unique)
  taskName: string; // 업무명
  level: 'L1' | 'L2' | 'L3' | 'L4' | 'L5' | 'L6'; // 레벨
  description: string; // 업무 내용
  status: '대기중' | '진행중' | '완료' | '연기'; // 업무 상태
  deadline?: string; // 데드라인 (ISO date string) - 하위 호환성을 위해 유지, startDate/endDate 사용 권장
  startDate?: string; // 시작일 (ISO date string)
  endDate?: string; // 종료일 (ISO date string)
  isPublic?: boolean; // 전사 스케줄 노출 여부 (기본값: false)
  note?: string; // 비고
  userId: string; // 사용자 ID (어떤 사용자의 업무인지)
  userName: string; // 사용자 이름 (조회 시 편의를 위해)
  createdAt: string; // 생성일시
  updatedAt?: string; // 수정일시
  history?: ScheduleHistory[]; // 변경 이력
}

// 주간 뷰를 위한 타입
export interface WeeklySchedule {
  week: string; // 주차 식별자 (예: "2024-01-01" - 해당 주의 월요일)
  schedules: Schedule[]; // 해당 주의 스케줄들
}
