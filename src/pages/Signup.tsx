import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

const Signup: React.FC = () => {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [team, setTeam] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signup } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 필수 필드 검증
    if (!name || !name.trim()) {
      setError('이름을 입력해주세요.');
      return;
    }

    if (!username || !username.trim()) {
      setError('아이디를 입력해주세요.');
      return;
    }

    if (username.trim().length < 2) {
      setError('아이디는 최소 2자 이상이어야 합니다.');
      return;
    }

    if (!email || !email.trim()) {
      setError('이메일을 입력해주세요.');
      return;
    }

    // 간단한 이메일 형식 검증
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      setError('올바른 이메일 형식을 입력해주세요. (예: user@example.com)');
      return;
    }

    if (!team || !team.trim()) {
      setError('팀을 입력해주세요.');
      return;
    }

    if (password !== confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return;
    }

    if (password.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.');
      return;
    }

    setLoading(true);

    try {
      // 사용자가 입력한 이메일을 trim하여 사용
      await signup(email.trim(), password, name, username, team);
      // 회원가입 성공 후 /schedule로 이동 (window.location을 사용하여 확실하게 리다이렉트)
      window.location.href = '/schedule';
    } catch (err: any) {
      console.error('Signup error:', err);
      if (err.code === 'auth/invalid-email') {
        setError('올바른 이메일 형식을 입력해주세요.');
      } else if (err.code === 'auth/email-already-in-use') {
        setError('이미 사용 중인 이메일입니다.');
      } else if (err.code === 'auth/weak-password') {
        setError('비밀번호가 너무 약합니다. 더 강한 비밀번호를 사용해주세요.');
      } else if (err.code === 'auth/username-already-in-use') {
        setError('이미 사용 중인 아이디입니다.');
      } else {
        setError(`회원가입에 실패했습니다: ${err.message || '알 수 없는 오류'}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
          <img src="/logo192.png" alt="돌돌" style={{ width: '80px', height: 'auto', marginBottom: '0.5rem' }} />
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#2c3e50' }}>돌돌 스퀘어</h1>
          <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.9rem', color: '#7f8c8d' }}>주식회사 꾼 그룹웨어</p>
        </div>
        <h2 style={styles.title}>회원가입</h2>
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
              placeholder="아이디를 입력하세요 (최소 2자)"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>이메일 (로그인 아이디로 사용) *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={styles.input}
              placeholder="example@company.com"
            />
            <small style={styles.helpText}>
              이메일 형식으로 입력하세요 (예: user@company.com)
            </small>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>비밀번호 *</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={styles.input}
              placeholder="최소 6자 이상"
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>비밀번호 확인 *</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={styles.input}
              placeholder="비밀번호를 다시 입력하세요"
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
            {loading ? '가입 중...' : '회원가입'}
          </button>
        </form>
        <div style={styles.loginLink}>
          이미 계정이 있으신가요?{' '}
          <a href="/login" style={styles.link}>
            로그인
          </a>
        </div>
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
    padding: '1rem',
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
    marginBottom: '2rem',
    color: '#333',
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
  helpText: {
    display: 'block',
    marginTop: '0.25rem',
    color: '#666',
    fontSize: '0.875rem',
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
    padding: '0.5rem',
    backgroundColor: '#f8d7da',
    borderRadius: '4px',
    fontSize: '0.9rem',
  },
  loginLink: {
    textAlign: 'center',
    marginTop: '1.5rem',
    color: '#666',
  },
  link: {
    color: '#007bff',
    textDecoration: 'none',
  },
};

export default Signup;
