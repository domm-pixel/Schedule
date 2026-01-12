import React from 'react';
import { useHistory } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import UserDataForm from '../components/UserDataForm';

const Home: React.FC = () => {
  const { userData, currentUser, loading } = useAuth();
  const history = useHistory();

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '3rem' }}>로딩 중...</div>;
  }

  if (!currentUser) {
    history.push('/login');
    return null;
  }

  // 사용자 데이터가 없으면 등록 폼 표시
  if (!userData) {
    return (
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div style={{ marginLeft: '250px', width: 'calc(100% - 250px)' }}>
          <UserDataForm />
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <div style={{ marginLeft: '250px', width: 'calc(100% - 250px)', padding: '2rem' }}>
        <div style={styles.container}>
          <div style={styles.header}>
            <h1 style={styles.title}>스케줄 관리 시스템</h1>
            <div style={styles.quickActions}>
              <button
                style={styles.quickButton}
                onClick={() => history.push('/schedule/new')}
              >
                + 새 업무 등록
              </button>
            </div>
          </div>
          <div style={styles.welcome}>
            <h2>환영합니다, {userData.name}님!</h2>
            <p>좌측 메뉴에서 원하는 기능을 선택하세요.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    paddingBottom: '1.5rem',
    borderBottom: '2px solid #eee',
  },
  title: {
    color: '#333',
    margin: 0,
    fontSize: '2rem',
  },
  quickActions: {
    display: 'flex',
    gap: '1rem',
  },
  quickButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '500',
  },
  welcome: {
    backgroundColor: 'white',
    padding: '3rem',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    textAlign: 'center',
  },
};

export default Home;
