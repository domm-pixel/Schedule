import React from 'react';
import { useHistory, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Sidebar: React.FC = () => {
  const history = useHistory();
  const location = useLocation();
  const { userData, logout } = useAuth();

  const menuItems = [
    {
      title: '내 스케줄 관리',
      path: '/schedule',
      icon: '📋',
    },
    {
      title: '내 휴가 관리',
      path: '/vacations/my',
      icon: '🏖️',
    },
    {
      title: '주간 스케줄 관리',
      path: '/schedule/weekly',
      icon: '📅',
    },
    {
      title: '전사 스케줄 열람',
      path: '/calendar',
      icon: '🗓️',
    },
    {
      title: '회의실 예약',
      path: '/meeting-room',
      icon: '🏢',
    },
    {
      title: '게시판',
      path: '/board',
      icon: '📝',
    },
    {
      title: '내 정보 수정',
      path: '/profile',
      icon: '👤',
    },
  ];

  const handleLogout = async () => {
    try {
      await logout();
      history.push('/login');
    } catch (error) {
      console.error('로그아웃 실패:', error);
    }
  };

  const isActive = (path: string) => {
    if (path === '/schedule') {
      // /schedule은 정확히 일치하거나 /schedule/new, /schedule/edit 같은 하위 경로일 때만 활성화
      // /schedule/weekly는 제외
      return location.pathname === path || 
             (location.pathname.startsWith(path + '/') && !location.pathname.startsWith('/schedule/weekly'));
    }
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  return (
    <div style={styles.sidebar}>
      <div style={styles.header}>
        <div 
          style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem', cursor: 'pointer' }}
          onClick={() => history.push('/')}
          title="대시보드로 이동"
        >
          <img src="/logo192.png" alt="돌돌" style={{ width: '45px', height: 'auto' }} />
          <h2 style={{ ...styles.title, marginBottom: 0 }}>돌돌 스퀘어</h2>
        </div>
        {userData && (
          <div style={styles.userInfo}>
            <div style={styles.userName}>{userData.name}님</div>
            <div style={styles.userTeam}>{userData.team}</div>
          </div>
        )}
      </div>

      <nav style={styles.nav}>
        {menuItems.map((item) => (
          <div
            key={item.path}
            style={{
              ...styles.menuItem,
              ...(isActive(item.path) ? styles.menuItemActive : {}),
            }}
            onClick={() => history.push(item.path)}
          >
            <span style={styles.menuIcon}>{item.icon}</span>
            <span style={styles.menuText}>{item.title}</span>
          </div>
        ))}

        {userData?.role === 'admin' && (
          <div
            style={{
              ...styles.menuItem,
              ...(isActive('/users') ? styles.menuItemActive : {}),
            }}
            onClick={() => history.push('/users')}
          >
            <span style={styles.menuIcon}>👥</span>
            <span style={styles.menuText}>회원 관리</span>
          </div>
        )}
        {userData?.role === 'admin' && (
          <div
            style={{
              ...styles.menuItem,
              ...(isActive('/vacations/admin') ? styles.menuItemActive : {}),
            }}
            onClick={() => history.push('/vacations/admin')}
          >
            <span style={styles.menuIcon}>🛠️</span>
            <span style={styles.menuText}>휴가 관리(관리자)</span>
          </div>
        )}
      </nav>

      <div style={styles.footer}>
        <button onClick={handleLogout} style={styles.logoutButton}>
          로그아웃
        </button>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  sidebar: {
    width: '250px',
    height: '100vh',
    backgroundColor: '#2c3e50',
    color: 'white',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    left: 0,
    top: 0,
    boxShadow: '2px 0 5px rgba(0,0,0,0.1)',
  },
  header: {
    padding: '2rem 1.5rem',
    borderBottom: '1px solid rgba(255,255,255,0.1)',
  },
  title: {
    margin: 0,
    fontSize: '1.5rem',
    fontWeight: '600',
    marginBottom: '1rem',
  },
  userInfo: {
    marginTop: '1rem',
  },
  userName: {
    fontSize: '1rem',
    fontWeight: '600',
    marginBottom: '0.25rem',
  },
  userTeam: {
    fontSize: '0.875rem',
    color: '#bdc3c7',
  },
  nav: {
    flex: 1,
    padding: '1rem 0',
    overflowY: 'auto',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    cursor: 'pointer',
    transition: 'background-color 0.2s',
    color: '#ecf0f1',
  },
  menuItemActive: {
    backgroundColor: '#34495e',
    borderLeft: '4px solid #3498db',
    fontWeight: '600',
  },
  menuIcon: {
    fontSize: '1.25rem',
    marginRight: '0.75rem',
    width: '24px',
    textAlign: 'center',
  },
  menuText: {
    fontSize: '1rem',
  },
  footer: {
    padding: '1.5rem',
    borderTop: '1px solid rgba(255,255,255,0.1)',
  },
  logoutButton: {
    width: '100%',
    padding: '0.75rem',
    backgroundColor: '#e74c3c',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '500',
  },
};

export default Sidebar;
