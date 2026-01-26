// Slack 알림 유틸리티 함수
// 내부용이므로 클라이언트 사이드에서 직접 호출

// Slack Webhook URL 설정
// 환경 변수에서 가져오거나 기본값 사용
// .env 파일에 REACT_APP_SLACK_WEBHOOK_URL을 설정하세요
const SLACK_WEBHOOK_URL = process.env.REACT_APP_SLACK_WEBHOOK_URL || '';

interface SlackMessage {
  text: string;
}

// Slack 메시지 전송
async function sendSlackMessage(message: string): Promise<void> {
  if (!SLACK_WEBHOOK_URL) {
    console.warn('Slack Webhook URL이 설정되지 않았습니다.');
    return;
  }

  try {
    // Slack Webhook은 CORS를 허용하지 않으므로 no-cors 모드 사용
    // no-cors 모드는 응답을 읽을 수 없지만 요청은 전송됩니다
    const payload = JSON.stringify({ text: message });
    
    await fetch(SLACK_WEBHOOK_URL, {
      method: 'POST',
      mode: 'no-cors', // CORS 우회
      headers: {
        'Content-Type': 'application/json',
      },
      body: payload,
    });
    
    // no-cors 모드에서는 응답을 확인할 수 없지만, 
    // Slack Webhook은 POST 요청만 받으면 메시지를 전송하므로 정상 작동합니다
  } catch (error) {
    console.error('Slack 메시지 전송 실패:', error);
  }
}

// 휴가 등록 알림 (연차 - 여러 날짜 가능)
export async function notifyVacationCreated(
  userName: string,
  dates: string[], // 여러 날짜 배열
  substituteUserName?: string,
  reason?: string
): Promise<void> {
  // 날짜 포맷팅
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const weekday = date.toLocaleDateString('ko-KR', { weekday: 'short' });
    return `${month}.${day}(${weekday})`;
  };

  let periodText = '';
  if (dates.length === 1) {
    periodText = formatDate(dates[0]);
  } else {
    const start = formatDate(dates[0]);
    const end = formatDate(dates[dates.length - 1]);
    const startWeekday = new Date(dates[0]).toLocaleDateString('ko-KR', { weekday: 'short' });
    const endWeekday = new Date(dates[dates.length - 1]).toLocaleDateString('ko-KR', { weekday: 'short' });
    periodText = `${start.split('(')[0]} ~ ${end.split('(')[0]}(${startWeekday}~${endWeekday})`;
  }

  const message = `[휴가 신청]\n` +
    `성명: ${userName}\n` +
    `휴가구분: 연차\n` +
    `휴가기간: ${periodText}\n` +
    `대직자: ${substituteUserName || '-'}${substituteUserName ? '님' : ''}\n` +
    `${reason ? `비고: ${reason}` : ''}`;

  await sendSlackMessage(message);
}

// 대체휴무 신청 알림
export async function notifySubstituteHolidayRequestCreated(
  userName: string,
  workDate: string, // 근무한 휴일
  useDate: string, // 사용하려는 휴일
  substituteUserName?: string,
  reason?: string
): Promise<void> {
  const formatDate = (dateStr: string) => {
    const dateObj = new Date(dateStr);
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    const weekday = dateObj.toLocaleDateString('ko-KR', { weekday: 'short' });
    return `${month}.${day} (${weekday})`;
  };

  const formattedWorkDate = formatDate(workDate);
  const formattedUseDate = formatDate(useDate);

  // 대체휴무 개수 계산 (현재는 1개만, 나중에 확장 가능)
  const count = 1;
  const total = 1;

  let message = `[휴가 신청]\n` +
    `성명: ${userName}\n` +
    `휴가구분: 대체휴무 (${formattedWorkDate})\n` +
    `휴가기간: ${formattedUseDate}\n` +
    `대직자: ${substituteUserName || '-'}${substituteUserName ? '님' : ''}`;
  
  if (reason) {
    message += `\n비고: ${reason}`;
  }

  await sendSlackMessage(message);
}

// 대체휴무 신청 승인 알림
export async function notifySubstituteHolidayRequestApproved(
  userName: string,
  workDate: string,
  useDate: string,
  reviewedByName?: string
): Promise<void> {
  const formatDate = (dateStr: string) => {
    const dateObj = new Date(dateStr);
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    const weekday = dateObj.toLocaleDateString('ko-KR', { weekday: 'short' });
    return `${month}.${day} (${weekday})`;
  };

  const formattedWorkDate = formatDate(workDate);
  const formattedUseDate = formatDate(useDate);

  const message = `✅ *대체휴무 신청 승인*\n\n` +
    `👤 *신청자*: ${userName}\n` +
    `📅 *근무한 휴일*: ${formattedWorkDate}\n` +
    `📅 *사용하려는 휴일*: ${formattedUseDate}\n` +
    `✍️ *승인자*: ${reviewedByName || '-'}`;

  await sendSlackMessage(message);
}

// 대체휴무 신청 반려 알림
export async function notifySubstituteHolidayRequestRejected(
  userName: string,
  workDate: string,
  useDate: string,
  rejectedReason?: string,
  reviewedByName?: string
): Promise<void> {
  const formatDate = (dateStr: string) => {
    const dateObj = new Date(dateStr);
    const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
    const day = dateObj.getDate().toString().padStart(2, '0');
    const weekday = dateObj.toLocaleDateString('ko-KR', { weekday: 'short' });
    return `${month}.${day} (${weekday})`;
  };

  const formattedWorkDate = formatDate(workDate);
  const formattedUseDate = formatDate(useDate);

  const message = `❌ *대체휴무 신청 반려*\n\n` +
    `👤 *신청자*: ${userName}\n` +
    `📅 *근무한 휴일*: ${formattedWorkDate}\n` +
    `📅 *사용하려는 휴일*: ${formattedUseDate}\n` +
    `${rejectedReason ? `📝 *반려 사유*: ${rejectedReason}\n` : ''}` +
    `✍️ *반려자*: ${reviewedByName || '-'}`;

  await sendSlackMessage(message);
}

// 재택근무 신청 알림
export async function notifyRemoteWorkCreated(
  userName: string,
  date: string,
  startTime: string,
  endTime: string,
  workLocation: string
): Promise<void> {
  const dateObj = new Date(date);
  const year = dateObj.getFullYear();
  const month = (dateObj.getMonth() + 1).toString().padStart(2, '0');
  const day = dateObj.getDate().toString().padStart(2, '0');
  const weekday = dateObj.toLocaleDateString('ko-KR', { weekday: 'short' });
  const formattedDate = `${year}.${month}.${day}(${weekday})`;

  const message = `[재택근무 신청]\n` +
    `성명 : ${userName}\n` +
    `재택일시 : ${formattedDate}\n` +
    `출퇴근시간 : ${startTime}~${endTime}\n` +
    `근무장소 : ${workLocation}`;

  await sendSlackMessage(message);
}
