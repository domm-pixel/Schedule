import React, { useState, useEffect, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { collection, getDocs, doc, deleteDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Schedule } from '../types';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import LevelTooltip from '../components/LevelTooltip';

const ScheduleList: React.FC = () => {
  const [allSchedules, setAllSchedules] = useState<Schedule[]>([]); // 전체 데이터
  const [schedules, setSchedules] = useState<Schedule[]>([]); // 필터링된 데이터
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<'전체' | '대기중' | '진행중' | '완료' | '연기'>('전체');
  const [searchInput, setSearchInput] = useState(''); // 입력용
  const [searchTerm, setSearchTerm] = useState(''); // 실제 검색용
  const { userData } = useAuth();
  const history = useHistory();

  // Firebase에서 데이터 로드 (초기 로딩 시에만)
  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      
      let q = query(collection(db, 'schedules'));
      
      if (userData) {
        q = query(
          collection(db, 'schedules'),
          where('userId', '==', userData.uid)
        );
      }

      const querySnapshot = await getDocs(q);
      const schedulesList: Schedule[] = [];
      querySnapshot.forEach((docSnapshot) => {
        schedulesList.push({ id: docSnapshot.id, ...docSnapshot.data() } as Schedule);
      });

      // 휴가(레벨 '휴가') 항목은 내 스케줄 관리에서 제외
      const nonVacationSchedules = schedulesList.filter((s) => s.level !== '휴가');

      // createdAt 기준으로 정렬 (내림차순)
      nonVacationSchedules.sort((a, b) => {
        const dateA = a.createdAt ? (a.createdAt as any).toMillis?.() || new Date(a.createdAt).getTime() : 0;
        const dateB = b.createdAt ? (b.createdAt as any).toMillis?.() || new Date(b.createdAt).getTime() : 0;
        return dateB - dateA;
      });

      setAllSchedules(nonVacationSchedules);
    } catch (error) {
      console.error('스케줄 목록 가져오기 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [userData]);

  // 초기 데이터 로드
  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  // 클라이언트 사이드 필터링 (검색/상태 필터 변경 시)
  useEffect(() => {
    let filtered = allSchedules;

    // 상태 필터링
    if (filterStatus !== '전체') {
      filtered = filtered.filter(s => s.status === filterStatus);
    }

    // 검색어 필터링
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(s => 
        s.taskName.toLowerCase().includes(term) ||
        s.taskId.toLowerCase().includes(term) ||
        s.description?.toLowerCase().includes(term) ||
        s.level.toLowerCase().includes(term)
      );
    }

    setSchedules(filtered);
  }, [allSchedules, filterStatus, searchTerm]);

  const handleDelete = async (scheduleId: string) => {
    if (!window.confirm('정말 이 업무를 삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'schedules', scheduleId));
      fetchSchedules();
    } catch (error) {
      console.error('스케줄 삭제 실패:', error);
      alert('스케줄 삭제에 실패했습니다.');
    }
  };

  const handleEdit = (scheduleId: string) => {
    history.push(`/schedule/edit/${scheduleId}`);
  };

  if (loading) {
    return <div style={styles.loading}>로딩 중...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <div style={{ marginLeft: '250px', width: 'calc(100% - 250px)', padding: '2rem' }}>
        <div style={styles.container}>
          <div style={styles.header}>
            <h1 style={styles.title}>내 스케줄 관리</h1>
            <button
              onClick={() => history.push('/schedule/new')}
              style={styles.addButton}
            >
              + 새 업무 등록
            </button>
          </div>

          {/* 검색 */}
          <div style={styles.searchContainer}>
            <input
              type="text"
              placeholder="🔍 업무명, 업무ID, 내용, 레벨 검색..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setSearchTerm(searchInput);
                }
              }}
              style={styles.searchInput}
            />
            <button
              onClick={() => setSearchTerm(searchInput)}
              style={styles.searchButton}
              title="검색"
            >
              검색
            </button>
            {searchInput && (
              <button
                onClick={() => {
                  setSearchInput('');
                  setSearchTerm('');
                }}
                style={styles.clearButton}
                title="검색어 지우기"
              >
                ✕
              </button>
            )}
          </div>

          <div style={styles.filters}>
        <button
          onClick={() => setFilterStatus('전체')}
          style={{
            ...styles.filterButton,
            ...(filterStatus === '전체' ? styles.filterButtonActive : {}),
          }}
        >
          전체
        </button>
        <button
          onClick={() => setFilterStatus('대기중')}
          style={{
            ...styles.filterButton,
            ...(filterStatus === '대기중' ? styles.filterButtonActive : {}),
          }}
        >
          대기중
        </button>
        <button
          onClick={() => setFilterStatus('진행중')}
          style={{
            ...styles.filterButton,
            ...(filterStatus === '진행중' ? styles.filterButtonActive : {}),
          }}
        >
          진행중
        </button>
        <button
          onClick={() => setFilterStatus('완료')}
          style={{
            ...styles.filterButton,
            ...(filterStatus === '완료' ? styles.filterButtonActive : {}),
          }}
        >
          완료
        </button>
        <button
          onClick={() => setFilterStatus('연기')}
          style={{
            ...styles.filterButton,
            ...(filterStatus === '연기' ? styles.filterButtonActive : {}),
          }}
        >
          연기
        </button>
      </div>

      <div style={styles.listContainer}>
        {schedules.length === 0 ? (
          <div style={styles.empty}>등록된 업무가 없습니다.</div>
        ) : (
          schedules.map((schedule) => (
            <div key={schedule.id} style={styles.card}>
              <div style={styles.cardHeader}>
                <div style={styles.cardTitle}>
                  <span style={styles.taskId}>[{schedule.userName}]</span>
                  <span style={styles.taskName}>{schedule.taskName}</span>
                  <LevelTooltip level={schedule.level}>
                    <span style={{
                      ...styles.level,
                      ...styles[`level${schedule.level}` as keyof typeof styles],
                    }}>
                      {schedule.level}
                    </span>
                  </LevelTooltip>
                </div>
                <div style={styles.cardActions}>
                  <button
                    onClick={() => handleEdit(schedule.id)}
                    style={styles.editButton}
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(schedule.id)}
                    style={styles.deleteButton}
                  >
                    삭제
                  </button>
                </div>
              </div>
              <div style={styles.cardBody}>
                <div style={styles.cardRow}>
                  <span style={styles.label}>상태:</span>
                  <span style={{
                    ...styles.status,
                    ...styles[`status${schedule.status}` as keyof typeof styles],
                  }}>
                    {schedule.status}
                  </span>
                </div>
                <div style={styles.cardRow}>
                  <span style={styles.label}>기간:</span>
                  <span>
                    {schedule.startDate 
                      ? `${new Date(schedule.startDate).toLocaleDateString('ko-KR')} ~ ${new Date(schedule.endDate || schedule.deadline || schedule.startDate).toLocaleDateString('ko-KR')}`
                      : schedule.deadline
                      ? new Date(schedule.deadline).toLocaleDateString('ko-KR')
                      : '-'}
                  </span>
                </div>
                <div style={styles.cardRow}>
                  <span style={styles.label}>업무 내용:</span>
                  <span>{schedule.description}</span>
                </div>
                {schedule.note && (
                  <div style={styles.cardRow}>
                    <span style={styles.label}>비고:</span>
                    <span>{schedule.note}</span>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
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
  },
  title: {
    color: '#333',
    margin: 0,
  },
  addButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '500',
  },
  searchContainer: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  searchInput: {
    flex: 1,
    padding: '0.75rem 1rem',
    border: '1px solid #ddd',
    borderRadius: '8px 0 0 8px',
    fontSize: '0.95rem',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  searchButton: {
    padding: '0.75rem 1.25rem',
    backgroundColor: '#007bff',
    color: 'white',
    border: '1px solid #007bff',
    borderRadius: '0 8px 8px 0',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  clearButton: {
    marginLeft: '0.5rem',
    padding: '0.75rem 1rem',
    background: '#f0f0f0',
    border: '1px solid #ddd',
    borderRadius: '8px',
    cursor: 'pointer',
    color: '#666',
    fontSize: '0.95rem',
  },
  filters: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '2rem',
  },
  filterButton: {
    padding: '0.5rem 1rem',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  filterButtonActive: {
    backgroundColor: '#007bff',
    color: 'white',
    borderColor: '#007bff',
  },
  listContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  empty: {
    textAlign: 'center',
    padding: '3rem',
    color: '#666',
  },
  card: {
    backgroundColor: 'white',
    border: '1px solid #ddd',
    borderRadius: '8px',
    padding: '1.5rem',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem',
    paddingBottom: '1rem',
    borderBottom: '1px solid #eee',
  },
  cardTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    flex: 1,
  },
  taskId: {
    color: '#666',
    fontSize: '0.9rem',
  },
  taskName: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#333',
  },
  level: {
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.75rem',
    fontWeight: '600',
  },
  levelL1: { backgroundColor: '#e3f2fd', color: '#1976d2' },
  levelL2: { backgroundColor: '#bbdefb', color: '#1565c0' },
  levelL3: { backgroundColor: '#90caf9', color: '#0d47a1' },
  levelL4: { backgroundColor: '#64b5f6', color: '#01579b' },
  levelL5: { backgroundColor: '#42a5f5', color: '#004d40' },
  levelL6: { backgroundColor: '#2196f3', color: '#ffffff' },
  level휴가: { backgroundColor: '#fff3e0', color: '#e65100' },
  level재택: { backgroundColor: '#f3e5f5', color: '#6a1b9a' },
  level미팅: { backgroundColor: '#e8f5e9', color: '#2e7d32' },
  cardActions: {
    display: 'flex',
    gap: '0.5rem',
  },
  editButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  deleteButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  cardBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  cardRow: {
    display: 'flex',
    gap: '0.5rem',
  },
  label: {
    fontWeight: '600',
    color: '#666',
    minWidth: '80px',
  },
  status: {
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  status대기중: { backgroundColor: '#e7f3ff', color: '#004085' },
  status진행중: { backgroundColor: '#fff3cd', color: '#856404' },
  status완료: { backgroundColor: '#d4edda', color: '#155724' },
  status연기: { backgroundColor: '#f8d7da', color: '#721c24' },
  loading: {
    textAlign: 'center',
    padding: '3rem',
  },
};

export default ScheduleList;
