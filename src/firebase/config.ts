import { initializeApp } from "firebase/app";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";
import { getAuth } from "firebase/auth";

// Firebase 설정 정보는 여기에 입력하세요
// Firebase 콘솔에서 프로젝트 설정 > 일반 > 앱 추가 > 웹 앱 에서 확인할 수 있습니다
const firebaseConfig = {
  apiKey: "AIzaSyBzBqPtR2Y_TNVhn5117RaqgvVvmQq_SYo",
  authDomain: "doldolschedule.firebaseapp.com",
  projectId: "doldolschedule",
  storageBucket: "doldolschedule.firebasestorage.app",
  messagingSenderId: "290990611956",
  appId: "1:290990611956:web:b32aabf811ae0421336da1",
  measurementId: "G-HRG9SKB60G"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// 프로덕션 환경에서는 에뮬레이터 사용 안 함
// 개발 환경에서만 에뮬레이터 사용 (필요시)
// if (window.location.hostname === 'localhost') {
//   try {
//     connectFirestoreEmulator(db, 'localhost', 8080);
//   } catch (err: any) {
//     if (!err.message.includes('already initialized')) {
//       console.warn('Firestore 에뮬레이터 연결 실패:', err);
//     }
//   }
// }

export { db, auth };
