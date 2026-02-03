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

// 관리자용 비밀번호 초기화 함수 (HTTP 요청)
export const resetUserPassword = functions
  .region('asia-northeast3')
  .https.onRequest(async (req, res) => {
    // CORS 설정
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Preflight 요청 처리
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method not allowed' });
      return;
    }

    try {
      // Authorization 헤더에서 토큰 추출
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: '인증 토큰이 필요합니다.' });
        return;
      }

      const idToken = authHeader.split('Bearer ')[1];
      
      // 토큰 검증 및 사용자 정보 가져오기
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const callerUid = decodedToken.uid;

      // 호출자가 관리자인지 확인
      const callerDoc = await admin.firestore().collection('users').doc(callerUid).get();
      if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
        res.status(403).json({ error: '관리자만 비밀번호를 초기화할 수 있습니다.' });
        return;
      }

      // 대상 사용자 UID 확인
      const { targetUid } = req.body;
      if (!targetUid) {
        res.status(400).json({ error: '대상 사용자 UID가 필요합니다.' });
        return;
      }

      // 자기 자신의 비밀번호는 초기화 불가
      if (targetUid === callerUid) {
        res.status(400).json({ error: '자기 자신의 비밀번호는 초기화할 수 없습니다.' });
        return;
      }

      // 비밀번호를 123456으로 초기화
      await admin.auth().updateUser(targetUid, {
        password: '123456',
      });

      console.log(`비밀번호 초기화 완료: ${targetUid} (by ${callerUid})`);
      res.status(200).json({ success: true, message: '비밀번호가 123456으로 초기화되었습니다.' });
    } catch (error: any) {
      console.error('비밀번호 초기화 실패:', error);
      
      if (error.code === 'auth/user-not-found') {
        res.status(404).json({ error: '대상 사용자를 찾을 수 없습니다.' });
      } else {
        res.status(500).json({ error: '비밀번호 초기화에 실패했습니다.' });
      }
    }
  });
