import React, { useState, useEffect } from 'react';
import { doc, updateDoc, collection, query, where, getDocs, getDoc } from 'firebase/firestore';
import { updatePassword, EmailAuthProvider, reauthenticateWithCredential } from 'firebase/auth';
import { db, auth } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { User } from '../types';
import Sidebar from '../components/Sidebar';

const MyProfile: React.FC = () => {
  const { currentUser, userData, refreshUserData, isAdmin } = useAuth();
  const [loading, setLoading] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  
  // 내 정보 수정 폼
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [team, setTeam] = useState('');
  
  // 비밀번호 변경 폼
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  // 관리자용 - 비밀번호 초기화 대상
  const [selectedUserForReset, setSelectedUserForReset] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  
  // 메시지
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (userData) {
      setName(userData.name || '');
      setUsername(userData.username || '');
      setTeam(userData.team || '');
    }
  }, [userData]);

  useEffect(() => {
    if (isAdmin) {
      fetchAllUsers();
    }
  }, [isAdmin]);

  const fetchAllUsers = async () => {
    try {
      const q = query(collection(db, 'users'));
      const snapshot = await getDocs(q);
      const users: User[] = [];
      snapshot.forEach((docSnap) => {
        users.push({ id: docSnap.id, ...docSnap.data() } as User);
      });
      setAllUsers(users.filter(u => u.uid !== currentUser?.uid)); // 본인 제외
    } catch (error) {
      console.error('사용자 목록 조회 실패:', error);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!currentUser || !userData) {
      showMessage('error', '로그인이 필요합니다.');
      return;
    }

    if (!name.trim() || !username.trim() || !team.trim()) {
      showMessage('error', '모든 필드를 입력해주세요.');
      return;
    }

    setLoading(true);
    try {
      // 아이디(username) 중복 체크 (본인 제외)
      if (username.trim() !== userData.username) {
        const q = query(collection(db, 'users'), where('username', '==', username.trim()));
        const snapshot = await getDocs(q);
        const isDuplicate = snapshot.docs.some(doc => doc.id !== currentUser.uid);
        if (isDuplicate) {
          showMessage('error', '이미 사용 중인 아이디입니다.');
          setLoading(false);
          return;
        }
      }

      await updateDoc(doc(db, 'users', currentUser.uid), {
        name: name.trim(),
        username: username.trim(),
        team: team.trim(),
        updatedAt: new Date().toISOString(),
      });

      await refreshUserData();
      showMessage('success', '회원정보가 성공적으로 수정되었습니다.');
    } catch (error: any) {
      console.error('회원정보 수정 실패:', error);
      showMessage('error', '회원정보 수정에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentUser) {
      showMessage('error', '로그인이 필요합니다.');
      return;
    }

    if (!currentPassword || !newPassword || !confirmPassword) {
      showMessage('error', '모든 비밀번호 필드를 입력해주세요.');
      return;
    }

    if (newPassword.length < 6) {
      showMessage('error', '새 비밀번호는 6자 이상이어야 합니다.');
      return;
    }

    if (newPassword !== confirmPassword) {
      showMessage('error', '새 비밀번호가 일치하지 않습니다.');
      return;
    }

    setLoading(true);
    try {
      // 현재 비밀번호로 재인증
      const credential = EmailAuthProvider.credential(currentUser.email!, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
      
      // 비밀번호 변경
      await updatePassword(currentUser, newPassword);
      
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showMessage('success', '비밀번호가 성공적으로 변경되었습니다.');
    } catch (error: any) {
      console.error('비밀번호 변경 실패:', error);
      if (error.code === 'auth/wrong-password') {
        showMessage('error', '현재 비밀번호가 올바르지 않습니다.');
      } else if (error.code === 'auth/weak-password') {
        showMessage('error', '새 비밀번호가 너무 약합니다.');
      } else {
        showMessage('error', '비밀번호 변경에 실패했습니다.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!selectedUserForReset) {
      showMessage('error', '비밀번호를 초기화할 사용자를 선택해주세요.');
      return;
    }

    const targetUser = allUsers.find(u => u.uid === selectedUserForReset);
    if (!targetUser) {
      showMessage('error', '선택한 사용자를 찾을 수 없습니다.');
      return;
    }

    if (!window.confirm(`${targetUser.name}님의 비밀번호를 123456으로 초기화하시겠습니까?`)) {
      return;
    }

    setResetLoading(true);
    try {
      // Firebase Functions 호출
      const response = await fetch(
        `https://asia-northeast3-${process.env.REACT_APP_FIREBASE_PROJECT_ID}.cloudfunctions.net/resetUserPassword`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${await currentUser?.getIdToken()}`,
          },
          body: JSON.stringify({ targetUid: selectedUserForReset }),
        }
      );

      const result = await response.json();
      
      if (response.ok) {
        showMessage('success', `${targetUser.name}님의 비밀번호가 123456으로 초기화되었습니다.`);
        setSelectedUserForReset('');
      } else {
        showMessage('error', result.error || '비밀번호 초기화에 실패했습니다.');
      }
    } catch (error: any) {
      console.error('비밀번호 초기화 실패:', error);
      showMessage('error', '비밀번호 초기화에 실패했습니다. 서버 연결을 확인해주세요.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <div style={{ marginLeft: '250px', width: 'calc(100% - 250px)', padding: '1.5rem' }}>
        <div style={styles.container}>
          <h1 style={styles.title}>회원정보 수정</h1>

          {message && (
            <div style={{
              ...styles.message,
              backgroundColor: message.type === 'success' ? '#d4edda' : '#f8d7da',
              color: message.type === 'success' ? '#155724' : '#721c24',
              borderColor: message.type === 'success' ? '#c3e6cb' : '#f5c6cb',
            }}>
              {message.text}
            </div>
          )}

          {/* 내 정보 수정 */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>기본 정보</h2>
            <form onSubmit={handleUpdateProfile} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>이름</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  style={styles.input}
                  placeholder="이름을 입력하세요"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>닉네임 (아이디)</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  style={styles.input}
                  placeholder="닉네임을 입력하세요"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>팀</label>
                <input
                  type="text"
                  value={team}
                  onChange={(e) => setTeam(e.target.value)}
                  style={styles.input}
                  placeholder="팀을 입력하세요"
                />
              </div>
              <button
                type="submit"
                style={styles.submitButton}
                disabled={loading}
              >
                {loading ? '저장 중...' : '정보 저장'}
              </button>
            </form>
          </div>

          {/* 비밀번호 변경 */}
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>비밀번호 변경</h2>
            <form onSubmit={handleChangePassword} style={styles.form}>
              <div style={styles.formGroup}>
                <label style={styles.label}>현재 비밀번호</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  style={styles.input}
                  placeholder="현재 비밀번호를 입력하세요"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>새 비밀번호</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  style={styles.input}
                  placeholder="새 비밀번호를 입력하세요 (6자 이상)"
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>새 비밀번호 확인</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={styles.input}
                  placeholder="새 비밀번호를 다시 입력하세요"
                />
              </div>
              <button
                type="submit"
                style={styles.submitButton}
                disabled={loading}
              >
                {loading ? '변경 중...' : '비밀번호 변경'}
              </button>
            </form>
          </div>

          {/* 관리자 전용: 비밀번호 초기화 */}
          {isAdmin && (
            <div style={styles.section}>
              <h2 style={styles.sectionTitle}>
                <span style={styles.adminBadge}>관리자</span>
                회원 비밀번호 초기화
              </h2>
              <p style={styles.description}>
                선택한 회원의 비밀번호를 <strong>123456</strong>으로 초기화합니다.
              </p>
              <div style={styles.resetForm}>
                <select
                  value={selectedUserForReset}
                  onChange={(e) => setSelectedUserForReset(e.target.value)}
                  style={styles.select}
                >
                  <option value="">사용자 선택</option>
                  {allUsers.map((user) => (
                    <option key={user.uid} value={user.uid}>
                      {user.name} ({user.username}) - {user.team}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleResetPassword}
                  style={styles.resetButton}
                  disabled={resetLoading || !selectedUserForReset}
                >
                  {resetLoading ? '초기화 중...' : '비밀번호 초기화'}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '600px',
    margin: '0 auto',
  },
  title: {
    color: '#333',
    marginBottom: '2rem',
  },
  message: {
    padding: '1rem',
    borderRadius: '4px',
    marginBottom: '1.5rem',
    border: '1px solid',
  },
  section: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  sectionTitle: {
    fontSize: '1.25rem',
    color: '#333',
    marginBottom: '1.5rem',
    paddingBottom: '0.75rem',
    borderBottom: '2px solid #3498db',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  label: {
    fontSize: '0.9rem',
    fontWeight: '600',
    color: '#495057',
  },
  input: {
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '1rem',
    transition: 'border-color 0.2s',
  },
  submitButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#3498db',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '500',
    marginTop: '0.5rem',
  },
  adminBadge: {
    backgroundColor: '#e74c3c',
    color: 'white',
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: '600',
  },
  description: {
    color: '#666',
    fontSize: '0.9rem',
    marginBottom: '1rem',
  },
  resetForm: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
  },
  select: {
    flex: 1,
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '1rem',
  },
  resetButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#e74c3c',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
};

export default MyProfile;
