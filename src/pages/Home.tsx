import React, { useEffect, useState, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { collection, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { format, differenceInDays, parseISO, startOfDay, endOfWeek, startOfWeek } from 'date-fns';
import { ko } from 'date-fns/locale';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { useUsers } from '../context/UsersContext';
import Sidebar from '../components/Sidebar';
import UserDataForm from '../components/UserDataForm';
import { Schedule, Post } from '../types';

const Home: React.FC = () => {
  const { userData, currentUser, loading } = useAuth();
  const { users } = useUsers();
  const history = useHistory();

  // 대시보드 데이터 상태
  const [todaySchedules, setTodaySchedules] = useState<Schedule[]>([]);
  const [recentNotices, setRecentNotices] = useState<Post[]>([]);
  const [upcomingDeadlines, setUpcomingDeadlines] = useState<Schedule[]>([]);
  const [weeklyVacations, setWeeklyVacations] = useState<Schedule[]>([]);
  const [myStats, setMyStats] = useState({ pending: 0, inProgress: 0, completed: 0, delayed: 0 });
  const [dataLoading, setDataLoading] = useState(true);

  const fetchDashboardData = useCallback(async () => {
    if (!userData || !currentUser) return;

    try {
      setDataLoading(true);
      const today = new Date();
      const todayStr = format(today, 'yyyy-MM-dd');

      // 1. 오늘의 내 스케줄
      const schedulesQuery = query(
        collection(db, 'schedules'),
        where('userId', '==', currentUser.uid)
      );
      const schedulesSnapshot = await getDocs(schedulesQuery);
      const allMySchedules = schedulesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Schedule[];

      // 오늘 스케줄 필터링
      const todayFiltered = allMySchedules.filter(schedule => {
        const startDate = schedule.startDate ? format(parseISO(schedule.startDate), 'yyyy-MM-dd') : '';
        const endDate = schedule.endDate ? format(parseISO(schedule.endDate), 'yyyy-MM-dd') : startDate;
        return startDate <= todayStr && todayStr <= endDate;
      });
      setTodaySchedules(todayFiltered);

      // 2. 내 업무 통계
      const stats = {
        pending: allMySchedules.filter(s => s.status === '대기중').length,
        inProgress: allMySchedules.filter(s => s.status === '진행중').length,
        completed: allMySchedules.filter(s => s.status === '완료').length,
        delayed: allMySchedules.filter(s => s.status === '연기').length,
      };
      setMyStats(stats);

      // 3. 마감 임박 업무 (D-7 이내, 진행중/대기중만, 휴가/재택 제외)
      const upcoming = allMySchedules
        .filter(schedule => {
          if (schedule.status === '완료' || schedule.status === '연기') return false;
          if (schedule.level === '휴가' || schedule.level === '재택') return false; // 휴가/재택 제외
          if (!schedule.endDate) return false;
          const endDate = parseISO(schedule.endDate);
          const daysUntil = differenceInDays(endDate, today);
          return daysUntil >= 0 && daysUntil <= 7;
        })
        .sort((a, b) => {
          const dateA = parseISO(a.endDate!);
          const dateB = parseISO(b.endDate!);
          return dateA.getTime() - dateB.getTime();
        })
        .slice(0, 5);
      setUpcomingDeadlines(upcoming);

      // 4. 최근 게시글 (카테고리 무관, 최신 3건)
      const noticesQuery = query(
        collection(db, 'posts'),
        orderBy('createdAt', 'desc'),
        limit(3)
      );
      const noticesSnapshot = await getDocs(noticesQuery);
      const notices = noticesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Post[];
      setRecentNotices(notices);

      // 5. 이번 주 휴가/재택 현황 (전체 사용자)
      const weekStart = startOfWeek(today, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(today, { weekStartsOn: 1 });
      const weekStartStr = format(weekStart, 'yyyy-MM-dd');
      const weekEndStr = format(weekEnd, 'yyyy-MM-dd');
      
      // 5-1. schedules 컬렉션에서 휴가/재택 조회
      const schedulesVacationQuery = query(
        collection(db, 'schedules'),
        where('isPublic', '==', true)
      );
      const schedulesVacationSnapshot = await getDocs(schedulesVacationQuery);
      const schedulesVacations = schedulesVacationSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Schedule[];

      const filteredScheduleVacations = schedulesVacations
        .filter(schedule => {
          if (schedule.level !== '휴가' && schedule.level !== '재택') return false;
          if (!schedule.startDate) return false;
          const startDate = parseISO(schedule.startDate);
          const endDate = schedule.endDate ? parseISO(schedule.endDate) : startDate;
          return startDate <= weekEnd && endDate >= weekStart;
        })
        .map(s => ({
          ...s,
          date: s.startDate!,
          type: s.level as string
        }));

      // 5-2. vacations 컬렉션에서 휴가 조회
      const vacationsQuery = query(collection(db, 'vacations'));
      const vacationsSnapshot = await getDocs(vacationsQuery);
      const vacationsData = vacationsSnapshot.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as any[];

      // 사용자 이름 가져오기 (UsersContext에서 캐시된 데이터 사용)
      const usersMap = new Map(users.map(u => [u.uid, u.name]));

      const filteredVacations = vacationsData
        .filter(v => {
          if (!v.date) return false;
          return v.date >= weekStartStr && v.date <= weekEndStr;
        })
        .map(v => ({
          id: v.id,
          startDate: v.date,
          userName: usersMap.get(v.userId) || '알 수 없음',
          level: '휴가' as const,
          taskName: '휴가',
          type: '휴가'
        }));

      // 5-3. 두 데이터 합치기
      const combinedVacations = [...filteredScheduleVacations, ...filteredVacations]
        .sort((a, b) => {
          const dateA = a.startDate ? parseISO(a.startDate) : new Date();
          const dateB = b.startDate ? parseISO(b.startDate) : new Date();
          return dateA.getTime() - dateB.getTime();
        })
        .slice(0, 5) as Schedule[];
      
      setWeeklyVacations(combinedVacations);

    } catch (error) {
      console.error('대시보드 데이터 로딩 실패:', error);
    } finally {
      setDataLoading(false);
    }
  }, [userData, currentUser]);

  useEffect(() => {
    if (userData && currentUser) {
      fetchDashboardData();
    }
  }, [userData, currentUser, fetchDashboardData]);

  const getDaysUntil = (dateStr: string) => {
    const date = parseISO(dateStr);
    const today = startOfDay(new Date());
    const days = differenceInDays(date, today);
    if (days === 0) return 'D-Day';
    if (days < 0) return `D+${Math.abs(days)}`;
    return `D-${days}`;
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, 'M/d', { locale: ko });
  };

  const getCompletionRate = () => {
    const total = myStats.pending + myStats.inProgress + myStats.completed + myStats.delayed;
    if (total === 0) return 0;
    return Math.round((myStats.completed / total) * 100);
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '3rem' }}>로딩 중...</div>;
  }

  if (!currentUser) {
    history.push('/login');
    return null;
  }

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
      <div style={{ marginLeft: '250px', width: 'calc(100% - 250px)', padding: '2rem', backgroundColor: '#f5f6fa', minHeight: '100vh' }}>
        <div style={styles.container}>
          {/* 헤더 */}
          <div style={styles.header}>
            <div>
              <h1 style={styles.title}>돌돌 스퀘어</h1>
              <p style={styles.date}>{format(new Date(), 'yyyy년 M월 d일 (EEEE)', { locale: ko })}</p>
            </div>
            <div style={styles.quickActions}>
              <button
                style={styles.quickButton}
                onClick={() => history.push('/schedule/new')}
              >
                + 새 업무 등록
              </button>
            </div>
          </div>

          {/* 환영 메시지 */}
          <div style={styles.welcomeCard}>
            <h2 style={styles.welcomeText}>👋 환영합니다, {userData.name}님!</h2>
          </div>

          {dataLoading ? (
            <div style={styles.loadingContainer}>
              <p>대시보드 로딩 중...</p>
            </div>
          ) : (
            <>
              {/* 상단 2열 위젯 */}
              <div style={styles.widgetRow}>
                {/* 오늘의 스케줄 */}
                <div style={styles.widget}>
                  <div style={styles.widgetHeader}>
                    <span style={styles.widgetIcon}>📅</span>
                    <h3 style={styles.widgetTitle}>오늘의 스케줄</h3>
                  </div>
                  <div style={styles.widgetContent}>
                    {todaySchedules.length === 0 ? (
                      <p style={styles.emptyText}>오늘 예정된 스케줄이 없습니다.</p>
                    ) : (
                      <ul style={styles.list}>
                        {todaySchedules.slice(0, 5).map(schedule => (
                          <li key={schedule.id} style={styles.listItem}>
                            <span style={{
                              ...styles.levelBadge,
                              backgroundColor: getLevelColor(schedule.level)
                            }}>
                              {schedule.level}
                            </span>
                            <span style={styles.listText}>{schedule.taskName}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div style={styles.widgetFooter}>
                    총 {todaySchedules.length}건
                  </div>
                </div>

                {/* 최근 게시글 */}
                <div style={styles.widget}>
                  <div style={styles.widgetHeader}>
                    <span style={styles.widgetIcon}>📢</span>
                    <h3 style={styles.widgetTitle}>최근 게시글</h3>
                  </div>
                  <div style={styles.widgetContent}>
                    {recentNotices.length === 0 ? (
                      <p style={styles.emptyText}>게시글이 없습니다.</p>
                    ) : (
                      <ul style={styles.list}>
                        {recentNotices.map(notice => (
                          <li 
                            key={notice.id} 
                            style={{ ...styles.listItem, cursor: 'pointer' }}
                            onClick={() => history.push('/board')}
                          >
                            <span style={styles.noticeTitle}>{notice.title}</span>
                            <span style={styles.noticeDate}>{formatDate(notice.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div style={styles.widgetFooter}>
                    <span 
                      style={{ cursor: 'pointer', color: '#3498db' }}
                      onClick={() => history.push('/board')}
                    >
                      더보기 →
                    </span>
                  </div>
                </div>
              </div>

              {/* 중단 2열 위젯 */}
              <div style={styles.widgetRow}>
                {/* 마감 임박 업무 */}
                <div style={styles.widget}>
                  <div style={styles.widgetHeader}>
                    <span style={styles.widgetIcon}>⏰</span>
                    <h3 style={styles.widgetTitle}>마감 임박 업무</h3>
                  </div>
                  <div style={styles.widgetContent}>
                    {upcomingDeadlines.length === 0 ? (
                      <p style={styles.emptyText}>마감 임박 업무가 없습니다. 👍</p>
                    ) : (
                      <ul style={styles.list}>
                        {upcomingDeadlines.map(schedule => (
                          <li key={schedule.id} style={styles.listItem}>
                            <span style={{
                              ...styles.levelBadge,
                              backgroundColor: getLevelColor(schedule.level)
                            }}>
                              {schedule.level}
                            </span>
                            <span style={styles.listText}>{schedule.taskName}</span>
                            <span style={{
                              ...styles.dDayBadge,
                              backgroundColor: getDaysUntil(schedule.endDate!).includes('D-Day') ? '#e74c3c' : 
                                             getDaysUntil(schedule.endDate!).includes('D+') ? '#e74c3c' : '#f39c12'
                            }}>
                              {getDaysUntil(schedule.endDate!)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* 이번 주 휴가 현황 */}
                <div style={styles.widget}>
                  <div style={styles.widgetHeader}>
                    <span style={styles.widgetIcon}>🏖️</span>
                    <h3 style={styles.widgetTitle}>이번 주 휴가/재택 현황</h3>
                  </div>
                  <div style={styles.widgetContent}>
                    {weeklyVacations.length === 0 ? (
                      <p style={styles.emptyText}>이번 주 휴가/재택 예정자가 없습니다.</p>
                    ) : (
                      <ul style={styles.list}>
                        {weeklyVacations.map(schedule => (
                          <li key={schedule.id} style={styles.listItem}>
                            <span style={styles.vacationDate}>
                              {format(parseISO(schedule.startDate!), 'M/d (EEE)', { locale: ko })}
                            </span>
                            <span style={styles.listText}>{schedule.userName}</span>
                            <span style={{
                              ...styles.levelBadge,
                              backgroundColor: schedule.level === '휴가' ? '#e74c3c' : '#3498db',
                              fontSize: '0.7rem'
                            }}>
                              {schedule.level}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </div>

              {/* 하단 전체 너비 위젯 - 내 업무 현황 */}
              <div style={styles.fullWidget}>
                <div style={styles.widgetHeader}>
                  <span style={styles.widgetIcon}>📊</span>
                  <h3 style={styles.widgetTitle}>내 업무 현황</h3>
                </div>
                <div style={styles.statsContent}>
                  <div style={styles.statsRow}>
                    <div style={styles.statItem}>
                      <span style={styles.statLabel}>대기중</span>
                      <span style={{ ...styles.statValue, color: '#f39c12' }}>{myStats.pending}건</span>
                    </div>
                    <div style={styles.statDivider} />
                    <div style={styles.statItem}>
                      <span style={styles.statLabel}>진행중</span>
                      <span style={{ ...styles.statValue, color: '#3498db' }}>{myStats.inProgress}건</span>
                    </div>
                    <div style={styles.statDivider} />
                    <div style={styles.statItem}>
                      <span style={styles.statLabel}>완료</span>
                      <span style={{ ...styles.statValue, color: '#27ae60' }}>{myStats.completed}건</span>
                    </div>
                    <div style={styles.statDivider} />
                    <div style={styles.statItem}>
                      <span style={styles.statLabel}>연기</span>
                      <span style={{ ...styles.statValue, color: '#95a5a6' }}>{myStats.delayed}건</span>
                    </div>
                  </div>
                  <div style={styles.progressContainer}>
                    <div style={styles.progressBar}>
                      <div 
                        style={{
                          ...styles.progressFill,
                          width: `${getCompletionRate()}%`
                        }}
                      />
                    </div>
                    <span style={styles.progressText}>완료율 {getCompletionRate()}%</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

const getLevelColor = (level: string) => {
  const colors: { [key: string]: string } = {
    'L1': '#95a5a6',
    'L2': '#3498db',
    'L3': '#2ecc71',
    'L4': '#f39c12',
    'L5': '#e67e22',
    'L6': '#e74c3c',
    '휴가': '#9b59b6',
    '재택': '#1abc9c',
    '미팅': '#34495e',
  };
  return colors[level] || '#95a5a6';
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '1200px',
    margin: '0 auto',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1.5rem',
  },
  title: {
    color: '#2c3e50',
    margin: 0,
    fontSize: '1.8rem',
    fontWeight: '700',
  },
  date: {
    color: '#7f8c8d',
    margin: '0.25rem 0 0 0',
    fontSize: '0.95rem',
  },
  quickActions: {
    display: 'flex',
    gap: '0.75rem',
  },
  quickButton: {
    padding: '0.75rem 1.25rem',
    backgroundColor: '#3498db',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '600',
    boxShadow: '0 2px 4px rgba(52, 152, 219, 0.3)',
    transition: 'all 0.2s',
  },
  welcomeCard: {
    backgroundColor: 'white',
    padding: '1.25rem 1.5rem',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    marginBottom: '1.5rem',
  },
  welcomeText: {
    margin: 0,
    fontSize: '1.1rem',
    color: '#2c3e50',
    fontWeight: '500',
  },
  loadingContainer: {
    textAlign: 'center',
    padding: '3rem',
    color: '#7f8c8d',
  },
  widgetRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1.5rem',
    marginBottom: '1.5rem',
  },
  widget: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  fullWidget: {
    backgroundColor: 'white',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  widgetHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1rem 1.25rem',
    borderBottom: '1px solid #f0f0f0',
    backgroundColor: '#fafbfc',
  },
  widgetIcon: {
    fontSize: '1.2rem',
  },
  widgetTitle: {
    margin: 0,
    fontSize: '1rem',
    fontWeight: '600',
    color: '#2c3e50',
  },
  widgetContent: {
    padding: '1rem 1.25rem',
    minHeight: '120px',
  },
  widgetFooter: {
    padding: '0.75rem 1.25rem',
    borderTop: '1px solid #f0f0f0',
    fontSize: '0.85rem',
    color: '#7f8c8d',
    backgroundColor: '#fafbfc',
  },
  emptyText: {
    color: '#95a5a6',
    fontSize: '0.9rem',
    textAlign: 'center',
    margin: '1.5rem 0',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: 0,
  },
  listItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 0',
    borderBottom: '1px solid #f5f5f5',
  },
  listText: {
    flex: 1,
    fontSize: '0.9rem',
    color: '#34495e',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  levelBadge: {
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    color: 'white',
    fontSize: '0.75rem',
    fontWeight: '600',
    minWidth: '28px',
    textAlign: 'center',
  },
  dDayBadge: {
    padding: '0.2rem 0.5rem',
    borderRadius: '4px',
    color: 'white',
    fontSize: '0.75rem',
    fontWeight: '600',
  },
  noticeTitle: {
    flex: 1,
    fontSize: '0.9rem',
    color: '#34495e',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  noticeDate: {
    fontSize: '0.8rem',
    color: '#95a5a6',
  },
  vacationDate: {
    fontSize: '0.85rem',
    color: '#7f8c8d',
    minWidth: '80px',
  },
  statsContent: {
    padding: '1.5rem',
  },
  statsRow: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: '2rem',
    marginBottom: '1.5rem',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.25rem',
  },
  statLabel: {
    fontSize: '0.85rem',
    color: '#7f8c8d',
  },
  statValue: {
    fontSize: '1.5rem',
    fontWeight: '700',
  },
  statDivider: {
    width: '1px',
    height: '40px',
    backgroundColor: '#eee',
  },
  progressContainer: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
  },
  progressBar: {
    flex: 1,
    height: '12px',
    backgroundColor: '#ecf0f1',
    borderRadius: '6px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#27ae60',
    borderRadius: '6px',
    transition: 'width 0.5s ease',
  },
  progressText: {
    fontSize: '0.9rem',
    fontWeight: '600',
    color: '#27ae60',
    minWidth: '80px',
  },
};

export default Home;
