import React, { useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { User } from '../types';

const UserDataForm: React.FC = () => {
  const { currentUser } = useAuth();
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [team, setTeam] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name || !username || !team) {
      setError('모든 필드를 입력해주세요.');
      return;
    }

    if (!currentUser) {
      setError('로그인이 필요합니다.');
      return;
    }

    setLoading(true);

    try {
      const userData: Omit<User, 'id'> = {
        uid: currentUser.uid,
        name,
        username,
        team,
        role: 'user',
        createdAt: serverTimestamp() as any,
      };

      await setDoc(doc(db, 'users', currentUser.uid), userData);
      setSuccess(true);
      
      // 페이지 새로고침하여 userData 업데이트
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    } catch (error: any) {
      console.error('사용자 데이터 저장 실패:', error);
      setError('사용자 정보 저장에 실패했습니다. 다시 시도해주세요.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div style={styles.container}>
        <div style={styles.successMessage}>
          사용자 정보가 저장되었습니다. 페이지를 새로고침합니다...
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h2 style={styles.title}>사용자 정보 등록</h2>
        <p style={styles.description}>
          추가 정보를 입력해주세요. 이 정보는 스케줄 관리에 사용됩니다.
        </p>
        {error && <div style={styles.error}>{error}</div>}
        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>이름 *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              style={styles.input}
              placeholder="이름을 입력하세요"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>아이디 *</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              style={styles.input}
              placeholder="아이디를 입력하세요"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>팀 *</label>
            <input
              type="text"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              required
              style={styles.input}
              placeholder="소속 팀을 입력하세요"
            />
          </div>
          <button 
            type="submit" 
            disabled={loading}
            style={{...styles.button, ...(loading ? styles.buttonDisabled : {})}}
          >
            {loading ? '저장 중...' : '저장'}
          </button>
        </form>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    minHeight: '100vh',
    backgroundColor: '#f5f5f5',
    padding: '2rem',
  },
  card: {
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '8px',
    boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
    width: '100%',
    maxWidth: '500px',
  },
  title: {
    textAlign: 'center',
    marginBottom: '1rem',
    color: '#333',
  },
  description: {
    textAlign: 'center',
    color: '#666',
    marginBottom: '2rem',
    fontSize: '0.9rem',
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
  },
  formGroup: {
    marginBottom: '1.5rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#555',
    fontWeight: '500',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '1rem',
    boxSizing: 'border-box',
  },
  button: {
    padding: '0.75rem',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    marginTop: '1rem',
  },
  buttonDisabled: {
    backgroundColor: '#ccc',
    cursor: 'not-allowed',
  },
  error: {
    color: '#dc3545',
    marginBottom: '1rem',
    padding: '0.75rem',
    backgroundColor: '#f8d7da',
    borderRadius: '4px',
    fontSize: '0.9rem',
  },
  successMessage: {
    color: '#28a745',
    padding: '1rem',
    backgroundColor: '#d4edda',
    borderRadius: '4px',
    fontSize: '1rem',
    textAlign: 'center',
  },
};

export default UserDataForm;
