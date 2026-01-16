import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { addMonths, addYears, isAfter, isBefore, parseISO, differenceInYears } from 'date-fns';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import { Vacation } from '../types';

const MyVacation: React.FC = () => {
  const { userData } = useAuth();
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDate, setNewDate] = useState('');
  const [newReason, setNewReason] = useState('');

  useEffect(() => {
    if (!userData) return;
    fetchVacations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData]);

  const fetchVacations = async () => {
    if (!userData) return;
    try {
      setLoading(true);
      const q = query(
        collection(db, 'vacations'),
        where('userId', '==', userData.uid),
        orderBy('date', 'desc'),
      );
      const snapshot = await getDocs(q);
      const list: Vacation[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as Vacation);
      });
      setVacations(list);
    } catch (error) {
      console.error('휴가 내역 조회 실패:', error);
      alert('휴가 내역을 불러오는 데 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  const handleAddVacation = async () => {
    if (!userData || !newDate) return;
    try {
      await addDoc(collection(db, 'vacations'), {
        userId: userData.uid,
        date: newDate,
        days: 1,
        reason: newReason || null,
        createdByUid: userData.uid,
        createdByName: userData.name,
        createdAt: serverTimestamp(),
      });
      setNewDate('');
      setNewReason('');
      fetchVacations();
    } catch (error) {
      console.error('휴가 등록 실패:', error);
      alert('휴가 등록에 실패했습니다.');
    }
  };

  const handleDeleteVacation = async (vacationId: string) => {
    if (!window.confirm('해당 휴가 사용 내역을 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'vacations', vacationId));
      setVacations((prev) => prev.filter((v) => v.id !== vacationId));
    } catch (error) {
      console.error('휴가 삭제 실패:', error);
      alert('휴가 삭제에 실패했습니다.');
    }
  };

  const calculateAccrual = useCallback((): { accrued: number; used: number; remaining: number; substituteDays: number } => {
    if (!userData) {
      return { accrued: 0, used: vacations.length, remaining: -vacations.length, substituteDays: 0 };
    }

    const substituteDays = (userData.substituteHolidays || []).length;

    if (!userData.hireDate) {
      return { accrued: 0, used: vacations.length, remaining: -vacations.length + substituteDays, substituteDays };
    }

    const today = new Date();
    const hireDate = parseISO(userData.hireDate);
    if (isNaN(hireDate.getTime()) || isAfter(hireDate, today)) {
      return { accrued: 0, used: vacations.length, remaining: -vacations.length + substituteDays, substituteDays };
    }

    const yearsSinceHire = differenceInYears(today, hireDate);
    const oneYearAnniversary = addYears(hireDate, 1);
    let accrued = 0;

    // 1년 미만: 월차 계산 (최대 11개, 1년 시점에 지급)
    if (yearsSinceHire < 1) {
      // 입사 후 경과 개월 수 계산
      let monthsElapsed = 0;
      let base = hireDate;
      
      while (!isAfter(base, today) && monthsElapsed < 11) {
        monthsElapsed += 1;
        base = addMonths(hireDate, monthsElapsed);
      }
      
      // 1년이 되는 시점에 월차 11개 지급
      if (!isBefore(oneYearAnniversary, today)) {
        // 아직 1년이 안 지났으면 경과 개월 수만큼
        accrued = Math.min(monthsElapsed, 11);
      } else {
        // 1년이 지났으면 월차 11개 모두 지급
        accrued = 11;
      }
    } else {
      // 1년 초과: 월차 11개 + 관리자가 입력한 연차 일수
      accrued = 11 + (userData.annualLeaveDays || 0);
    }

    const used = vacations.length;
    const remaining = accrued - used + substituteDays;
    return { accrued, used, remaining, substituteDays };
  }, [vacations, userData]);

  const stats = useMemo(
    () => calculateAccrual(),
    [calculateAccrual],
  );

  if (!userData) {
    return <div style={{ padding: '2rem' }}>로그인이 필요합니다.</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <div style={{ marginLeft: '250px', width: 'calc(100% - 250px)', padding: '2rem' }}>
        <div style={styles.container}>
          <h1 style={styles.title}>내 휴가 관리</h1>

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>휴가 현황</h2>
            <div style={styles.statsRow}>
              <div style={styles.statItem}>
                <div style={styles.statLabel}>입사일</div>
                <div style={styles.statValue}>
                  {userData.hireDate
                    ? new Date(userData.hireDate).toLocaleDateString('ko-KR')
                    : '미입력 (관리자에게 문의)'}
                </div>
              </div>
              <div style={styles.statItem}>
                <div style={styles.statLabel}>발생 휴가</div>
                <div style={styles.statValue}>{stats.accrued}일</div>
              </div>
              <div style={styles.statItem}>
                <div style={styles.statLabel}>사용 휴가</div>
                <div style={styles.statValue}>{stats.used}일</div>
              </div>
              {stats.substituteDays > 0 && (
                <div style={styles.statItem}>
                  <div style={styles.statLabel}>대체 휴무</div>
                  <div style={{ ...styles.statValue, color: '#17a2b8' }}>+{stats.substituteDays}일</div>
                </div>
              )}
              <div style={styles.statItem}>
                <div style={styles.statLabel}>잔여 휴가</div>
                <div style={styles.statValue}>{stats.remaining}일</div>
              </div>
            </div>
            <div style={styles.helperText}>
              * 규칙: 입사 후 1년 미만은 매달 1일씩 발생, 각 일수는 발생일로부터 1년이 지나면 자동 소멸합니다.
            </div>
          </div>

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>휴가 사용 등록</h2>
            <div style={styles.formRow}>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                style={styles.input}
              />
              <input
                type="text"
                placeholder="사유 (선택)"
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                style={styles.input}
              />
              <button
                style={styles.addButton}
                onClick={handleAddVacation}
                disabled={!newDate}
              >
                등록
              </button>
            </div>
          </div>

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>휴가 사용 내역</h2>
            {loading ? (
              <div style={styles.loading}>로딩 중...</div>
            ) : vacations.length === 0 ? (
              <div style={styles.empty}>등록된 휴가가 없습니다.</div>
            ) : (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>사용일</th>
                      <th style={styles.th}>일수</th>
                      <th style={styles.th}>사유</th>
                      <th style={styles.th}>작업</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vacations.map((v) => (
                      <tr key={v.id}>
                        <td style={styles.td}>
                          {new Date(v.date).toLocaleDateString('ko-KR')}
                        </td>
                        <td style={styles.td}>{v.days}일</td>
                        <td style={styles.td}>{v.reason || '-'}</td>
                        <td style={styles.td}>
                          {userData?.role === 'admin' ? (
                            <button
                              style={styles.deleteButton}
                              onClick={() => handleDeleteVacation(v.id)}
                            >
                              삭제
                            </button>
                          ) : (
                            <span style={styles.noAction}>-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '1000px',
    margin: '0 auto',
  },
  title: {
    marginBottom: '2rem',
    color: '#333',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
  },
  cardTitle: {
    margin: 0,
    marginBottom: '1rem',
    fontSize: '1.1rem',
    fontWeight: 600,
  },
  statsRow: {
    display: 'flex',
    gap: '1rem',
    flexWrap: 'wrap',
  },
  statItem: {
    flex: '1 1 200px',
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    backgroundColor: '#f8f9fa',
  },
  statLabel: {
    fontSize: '0.85rem',
    color: '#666',
    marginBottom: '0.25rem',
  },
  statValue: {
    fontSize: '1.1rem',
    fontWeight: 600,
  },
  helperText: {
    marginTop: '0.75rem',
    fontSize: '0.8rem',
    color: '#888',
  },
  formRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
    alignItems: 'center',
  },
  input: {
    flex: '1 1 180px',
    padding: '0.5rem 0.75rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '0.9rem',
  },
  addButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  tableContainer: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    padding: '0.75rem',
    textAlign: 'left',
    backgroundColor: '#f8f9fa',
    borderBottom: '2px solid #dee2e6',
    fontSize: '0.85rem',
  },
  td: {
    padding: '0.75rem',
    borderBottom: '1px solid #eee',
    fontSize: '0.85rem',
  },
  deleteButton: {
    padding: '0.25rem 0.75rem',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  loading: {
    padding: '1rem',
    textAlign: 'center',
    color: '#666',
  },
  empty: {
    padding: '1rem',
    textAlign: 'center',
    color: '#999',
    fontSize: '0.9rem',
  },
  noAction: {
    color: '#999',
    fontSize: '0.9rem',
  },
};

export default MyVacation;

