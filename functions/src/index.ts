import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';

admin.initializeApp();

// Slack Webhook URL을 환경 변수에서 가져옴
const SLACK_WEBHOOK_URL = functions.config().slack?.webhook_url || '';

interface VacationData {
  userId: string;
  date: string;
  days: number;
  reason?: string;
  substituteUserName?: string;
  createdByName?: string;
}

interface SubstituteHolidayRequestData {
  userId: string;
  userName: string;
  date: string;
  reason?: string;
  substituteUserName?: string;
  status: 'pending' | 'approved' | 'rejected';
}

// 사용자 이름 가져오기 헬퍼 함수
async function getUserName(userId: string): Promise<string> {
  try {
    const userDoc = await admin.firestore().collection('users').where('uid', '==', userId).limit(1).get();
    if (!userDoc.empty) {
      return userDoc.docs[0].data().name || '알 수 없음';
    }
    return '알 수 없음';
  } catch (error) {
    console.error('사용자 이름 가져오기 실패:', error);
    return '알 수 없음';
  }
}

// Slack 메시지 전송 헬퍼 함수
async function sendSlackMessage(message: string) {
  if (!SLACK_WEBHOOK_URL) {
    console.warn('Slack Webhook URL이 설정되지 않았습니다. 환경 변수를 설정해주세요.');
    return;
  }

  try {
    await axios.post(SLACK_WEBHOOK_URL, {
      text: message,
    });
  } catch (error) {
    console.error('Slack 메시지 전송 실패:', error);
  }
}

// 휴가 등록 시 Slack 알림
export const onVacationCreated = functions
  .region('asia-northeast3')
  .firestore.document('vacations/{vacationId}')
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data() as VacationData;
    
    try {
      const userName = await getUserName(data.userId);
      const date = new Date(data.date).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      });

      const message = `🏖️ *휴가 등록 알림*\n\n` +
        `👤 *사용자*: ${userName}\n` +
        `📅 *날짜*: ${date}\n` +
        `👥 *대직자*: ${data.substituteUserName || '-'}\n` +
        `${data.reason ? `📝 *사유*: ${data.reason}\n` : ''}` +
        `✍️ *등록자*: ${data.createdByName || '-'}`;

      await sendSlackMessage(message);
    } catch (error) {
      console.error('휴가 등록 알림 처리 실패:', error);
    }
  });

// 대체휴무 신청 시 Slack 알림
export const onSubstituteHolidayRequestCreated = functions
  .region('asia-northeast3')
  .firestore.document('substituteHolidayRequests/{requestId}')
  .onCreate(async (snapshot, context) => {
    const data = snapshot.data() as SubstituteHolidayRequestData;
    
    try {
      const date = new Date(data.date).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      });

      const message = `🔄 *대체휴무 신청 알림*\n\n` +
        `👤 *신청자*: ${data.userName}\n` +
        `📅 *대체휴무일*: ${date}\n` +
        `${data.substituteUserName ? `👥 *대직자*: ${data.substituteUserName}\n` : ''}` +
        `${data.reason ? `📝 *사유*: ${data.reason}\n` : ''}` +
        `📊 *상태*: 대기중`;

      await sendSlackMessage(message);
    } catch (error) {
      console.error('대체휴무 신청 알림 처리 실패:', error);
    }
  });

// 대체휴무 신청 승인/반려 시 Slack 알림
export const onSubstituteHolidayRequestUpdated = functions
  .region('asia-northeast3')
  .firestore.document('substituteHolidayRequests/{requestId}')
  .onUpdate(async (change, context) => {
    const beforeData = change.before.data() as SubstituteHolidayRequestData;
    const afterData = change.after.data() as SubstituteHolidayRequestData;
    
    // 상태가 변경된 경우만 알림
    if (beforeData.status === afterData.status) {
      return;
    }

    try {
      const date = new Date(afterData.date).toLocaleDateString('ko-KR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'short',
      });

      let message = '';
      if (afterData.status === 'approved') {
        message = `✅ *대체휴무 신청 승인*\n\n` +
          `👤 *신청자*: ${afterData.userName}\n` +
          `📅 *대체휴무일*: ${date}\n` +
          `✍️ *승인자*: ${afterData.reviewedByName || '-'}`;
      } else if (afterData.status === 'rejected') {
        message = `❌ *대체휴무 신청 반려*\n\n` +
          `👤 *신청자*: ${afterData.userName}\n` +
          `📅 *대체휴무일*: ${date}\n` +
          `${afterData.rejectedReason ? `📝 *반려 사유*: ${afterData.rejectedReason}\n` : ''}` +
          `✍️ *반려자*: ${afterData.reviewedByName || '-'}`;
      }

      if (message) {
        await sendSlackMessage(message);
      }
    } catch (error) {
      console.error('대체휴무 신청 상태 변경 알림 처리 실패:', error);
    }
  });
