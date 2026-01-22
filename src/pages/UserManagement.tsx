import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useHistory } from 'react-router-dom';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';
import { User, Vacation } from '../types';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import { addMonths, addYears, isAfter, isBefore, parseISO, differenceInYears } from 'date-fns';
import DatePicker from 'react-datepicker';
import { ko } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';

const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewingSubstituteUserId, setViewingSubstituteUserId] = useState<string | null>(null);
  const { userData } = useAuth();
  const history = useHistory();

  useEffect(() => {
    fetchUsers();
    fetchVacations();
  }, []);

  const fetchUsers = async () => {
    try {
      const q = query(collection(db, 'users'), orderBy('createdAt', 'desc'));
      const querySnapshot = await getDocs(q);
      const usersList: User[] = [];
      querySnapshot.forEach((docSnapshot) => {
        usersList.push({ id: docSnapshot.id, ...docSnapshot.data() } as User);
      });
      setUsers(usersList);
    } catch (error) {
      console.error('사용자 목록 가져오기 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchVacations = async () => {
    try {
      const q = query(collection(db, 'vacations'), orderBy('date', 'desc'));
      const snapshot = await getDocs(q);
      const list: Vacation[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as any;
        list.push({
          id: d.id,
          userId: data.userId,
          date: data.date,
          days: data.days,
          reason: data.reason,
          createdByUid: data.createdByUid,
          createdByName: data.createdByName,
          createdAt: data.createdAt,
        } as Vacation);
      });
      setVacations(list);
    } catch (error) {
      console.error('휴가 내역 조회 실패:', error);
    }
  };

  const calculateAccrual = useCallback((user: User, userId: string): { accrued: number; used: number; remaining: number; substituteDays: number } => {
    const userVacations = vacations.filter((v) => v.userId === userId);
    const substituteDays = (user.substituteHolidays || []).length;
    
    if (!user.hireDate) {
      return { accrued: 0, used: userVacations.length, remaining: -userVacations.length + substituteDays, substituteDays };
    }

    const today = new Date();
    const hireDate = parseISO(user.hireDate);
    if (isNaN(hireDate.getTime()) || isAfter(hireDate, today)) {
      return { accrued: 0, used: userVacations.length, remaining: -userVacations.length + substituteDays, substituteDays };
    }

    const yearsSinceHire = differenceInYears(today, hireDate);
    const oneYearAnniversary = addYears(hireDate, 1);
    
    let accrued = 0;

    // 1년 미만: 월차 계산 (최대 11개, 1년 시점에 지급)
    if (yearsSinceHire < 1) {
      // 월차는 입사 후 한 달이 지나야 지급됨 (예: 1월 22일 입사 → 2월 22일부터 첫 월차)
      // 각 월차는 입사일로부터 N개월 후에 지급됨 (N = 1, 2, 3, ..., 11)
      let monthsElapsed = 0;
      
      // 첫 번째 월차 지급일부터 시작 (입사일 + 1개월)
      for (let month = 1; month <= 11; month++) {
        const accrualDate = addMonths(hireDate, month);
        // 해당 월차 지급일이 오늘 이전이거나 오늘이면 지급됨
        if (isBefore(accrualDate, today) || accrualDate.getTime() === today.getTime()) {
          monthsElapsed = month;
        } else {
          break; // 아직 지급되지 않은 월차를 만나면 중단
        }
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
      accrued = 11 + (user.annualLeaveDays || 0);
    }

    const used = userVacations.length;
    const remaining = accrued - used + substituteDays;
    return { accrued, used, remaining, substituteDays };
  }, [vacations]);

  const usersWithStats = useMemo(() => {
    return users.map((user) => ({
      ...user,
      vacationStats: calculateAccrual(user, user.uid),
    }));
  }, [users, calculateAccrual]);

  const handleHireDateChange = async (userId: string, hireDate: string) => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        hireDate: hireDate || null,
        updatedAt: new Date().toISOString(),
      });
      fetchUsers();
    } catch (error) {
      console.error('입사일 변경 실패:', error);
      alert('입사일 변경에 실패했습니다.');
    }
  };

  const handleMakeAllAdmin = async () => {
    if (!window.confirm('현재 등록된 모든 사용자의 역할을 관리자(admin)로 변경하시겠습니까?')) {
      return;
    }

    try {
      const q = query(collection(db, 'users'));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);

      snapshot.forEach((docSnapshot) => {
        batch.update(doc(db, 'users', docSnapshot.id), {
          role: 'admin',
          updatedAt: new Date().toISOString(),
        });
      });

      await batch.commit();
      fetchUsers();
      alert('모든 사용자의 역할이 관리자(admin)로 변경되었습니다.');
    } catch (error) {
      console.error('전체 관리자 변경 실패:', error);
      alert('전체 관리자 변경에 실패했습니다.');
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'user') => {
    try {
      await updateDoc(doc(db, 'users', userId), {
        role: newRole,
        updatedAt: new Date().toISOString(),
      });
      fetchUsers();
    } catch (error) {
      console.error('역할 변경 실패:', error);
      alert('역할 변경에 실패했습니다.');
    }
  };

  const handleDelete = async (userId: string) => {
    if (!window.confirm('정말 이 사용자를 삭제하시겠습니까?')) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'users', userId));
      fetchUsers();
    } catch (error) {
      console.error('사용자 삭제 실패:', error);
      alert('사용자 삭제에 실패했습니다.');
    }
  };

  const handleAnnualLeaveDaysChange = async (userId: string, days: string) => {
    try {
      const annualLeaveDays = days ? parseInt(days, 10) : null;
      await updateDoc(doc(db, 'users', userId), {
        annualLeaveDays: annualLeaveDays,
        updatedAt: new Date().toISOString(),
      });
      fetchUsers();
    } catch (error) {
      console.error('연차 일수 변경 실패:', error);
      alert('연차 일수 변경에 실패했습니다.');
    }
  };

  const handleAddSubstituteHoliday = async (userId: string) => {
    const dateStr = prompt('대체 휴무일을 입력하세요 (yyyy-MM-dd 형식):');
    if (!dateStr) return;

    try {
      const user = users.find((u) => u.id === userId);
      if (!user) return;

      const currentHolidays = user.substituteHolidays || [];
      if (currentHolidays.includes(dateStr)) {
        alert('이미 등록된 대체 휴무일입니다.');
        return;
      }

      await updateDoc(doc(db, 'users', userId), {
        substituteHolidays: [...currentHolidays, dateStr],
        updatedAt: new Date().toISOString(),
      });
      fetchUsers();
    } catch (error) {
      console.error('대체 휴무일 추가 실패:', error);
      alert('대체 휴무일 추가에 실패했습니다.');
    }
  };

  const handleRemoveSubstituteHoliday = async (userId: string, dateStr: string) => {
    if (!window.confirm('이 대체 휴무일을 삭제하시겠습니까?')) return;

    try {
      const user = users.find((u) => u.id === userId);
      if (!user) return;

      const currentHolidays = user.substituteHolidays || [];
      await updateDoc(doc(db, 'users', userId), {
        substituteHolidays: currentHolidays.filter((d) => d !== dateStr),
        updatedAt: new Date().toISOString(),
      });
      fetchUsers();
    } catch (error) {
      console.error('대체 휴무일 삭제 실패:', error);
      alert('대체 휴무일 삭제에 실패했습니다.');
    }
  };

  const isOverOneYear = (hireDateStr?: string | null): boolean => {
    if (!hireDateStr) return false;
    const today = new Date();
    const hireDate = parseISO(hireDateStr);
    if (isNaN(hireDate.getTime())) return false;
    return differenceInYears(today, hireDate) >= 1;
  };

  const handleGoToVacationManagement = (userUid: string) => {
    history.push('/vacations/admin', { selectedUserId: userUid });
  };

  if (loading) {
    return <div style={styles.loading}>로딩 중...</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <div style={{ marginLeft: '250px', width: 'calc(100% - 250px)', padding: '1.5rem' }}>
        <div style={styles.container}>
          <div style={styles.headerRow}>
            <h1 style={styles.title}>회원 관리</h1>
            <button
              style={styles.makeAllAdminButton}
              onClick={handleMakeAllAdmin}
            >
              전체를 관리자 권한으로 변경
            </button>
          </div>
      <div style={styles.tableContainer}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.th}>이름</th>
              <th style={styles.th}>아이디</th>
              <th style={styles.th}>팀</th>
              <th style={styles.th}>입사일</th>
              <th style={styles.th}>연차 일수</th>
              <th style={styles.th}>역할</th>
              <th style={styles.th}>잔여 휴가</th>
              <th style={styles.th}>대체 휴무</th>
              <th style={styles.th}>휴가 관리</th>
              <th style={styles.th}>작업</th>
            </tr>
          </thead>
          <tbody>
            {usersWithStats.map((user) => (
              <tr key={user.id}>
                <td style={{ ...styles.td, ...styles.nameCell }}>{user.name}</td>
                <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{user.username}</td>
                <td style={{ ...styles.td, whiteSpace: 'nowrap' }}>{user.team}</td>
              <td style={styles.td}>
                <DatePicker
                  selected={user.hireDate ? new Date(user.hireDate) : null}
                  onChange={(date: Date | null) => {
                    if (date) {
                      handleHireDateChange(user.id, date.toISOString().split('T')[0]);
                    } else {
                      handleHireDateChange(user.id, '');
                    }
                  }}
                  dateFormat="yyyy-MM-dd"
                  locale={ko}
                  placeholderText="입사일을 선택하세요"
                  showYearDropdown
                  showMonthDropdown
                  yearDropdownItemNumber={100}
                  scrollableYearDropdown
                  className="date-picker-input"
                />
              </td>
              <td style={styles.td}>
                {isOverOneYear(user.hireDate) ? (
                  <input
                    type="number"
                    min="0"
                    value={user.annualLeaveDays ?? ''}
                    onChange={(e) => handleAnnualLeaveDaysChange(user.id, e.target.value)}
                    placeholder="연차 일수"
                    style={styles.numberInput}
                  />
                ) : (
                  <span style={styles.noData}>월차 자동</span>
                )}
              </td>
                <td style={styles.td}>
                  <select
                    value={user.role}
                    onChange={(e) => handleRoleChange(user.id, e.target.value as 'admin' | 'user')}
                    style={styles.select}
                  >
                    <option value="user">일반 사용자</option>
                    <option value="admin">관리자</option>
                  </select>
                </td>
                <td style={styles.td}>
                  {user.vacationStats ? (
                    <div style={styles.vacationStats}>
                      <div style={styles.vacationStatItem}>
                        <span style={styles.vacationLabel}>발생:</span>
                        <span>{user.vacationStats.accrued}일</span>
                      </div>
                      <div style={styles.vacationStatItem}>
                        <span style={styles.vacationLabel}>사용:</span>
                        <span>{user.vacationStats.used}일</span>
                      </div>
                      {user.vacationStats.substituteDays > 0 && (
                        <div style={styles.vacationStatItem}>
                          <span style={styles.vacationLabel}>대체:</span>
                          <span style={{ color: '#17a2b8' }}>+{user.vacationStats.substituteDays}일</span>
                        </div>
                      )}
                      <div style={styles.vacationStatItem}>
                        <span style={styles.vacationLabel}>잔여:</span>
                        <span style={{
                          ...styles.vacationRemaining,
                          color: user.vacationStats.remaining < 0 ? '#dc3545' : user.vacationStats.remaining === 0 ? '#ffc107' : '#28a745'
                        }}>
                          {user.vacationStats.remaining}일
                        </span>
                      </div>
                    </div>
                  ) : (
                    <span style={styles.noData}>-</span>
                  )}
                </td>
                <td style={styles.td}>
                  <div style={styles.substituteHolidaysCell}>
                    <button
                      onClick={() => handleAddSubstituteHoliday(user.id)}
                      style={styles.addButton}
                      title="대체 휴무일 추가"
                    >
                      +
                    </button>
                    {(user.substituteHolidays && user.substituteHolidays.length > 0) ? (
                      <button
                        onClick={() => setViewingSubstituteUserId(viewingSubstituteUserId === user.id ? null : user.id)}
                        style={styles.viewButton}
                        title="대체 휴무일 열람"
                      >
                        열람 ({user.substituteHolidays.length})
                      </button>
                    ) : (
                      <span style={styles.noData}>없음</span>
                    )}
                  </div>
                </td>
                <td style={styles.td}>
                  <button
                    onClick={() => handleGoToVacationManagement(user.uid)}
                    style={{ ...styles.vacationManageButton, whiteSpace: 'nowrap' }}
                  >
                    휴가 관리
                  </button>
                </td>
                <td style={styles.td}>
                  {user.id !== userData?.id && (
                    <button
                      onClick={() => handleDelete(user.id)}
                      style={styles.deleteButton}
                    >
                      삭제
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
        </div>
      </div>
      
      {/* 대체 휴무일 열람 모달 */}
      {viewingSubstituteUserId && (
        <div style={styles.modalOverlay} onClick={() => setViewingSubstituteUserId(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>
                {users.find(u => u.id === viewingSubstituteUserId)?.name}님의 대체 휴무일
              </h3>
              <button
                onClick={() => setViewingSubstituteUserId(null)}
                style={styles.modalCloseButton}
              >
                ×
              </button>
            </div>
            <div style={styles.modalBody}>
              {(() => {
                const user = users.find(u => u.id === viewingSubstituteUserId);
                const holidays = user?.substituteHolidays || [];
                if (holidays.length === 0) {
                  return <p style={styles.noData}>대체 휴무일이 없습니다.</p>;
                }
                return (
                  <div style={styles.substituteList}>
                    {holidays.map((dateStr) => (
                      <div key={dateStr} style={styles.substituteItem}>
                        <span>{new Date(dateStr).toLocaleDateString('ko-KR', { 
                          year: 'numeric', 
                          month: 'long', 
                          day: 'numeric',
                          weekday: 'short'
                        })}</span>
                        <button
                          onClick={() => {
                            handleRemoveSubstituteHoliday(viewingSubstituteUserId, dateStr);
                            if (holidays.length === 1) {
                              setViewingSubstituteUserId(null);
                            }
                          }}
                          style={styles.removeButton}
                          title="삭제"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '100%',
    margin: 0,
  },
  headerRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
  },
  title: {
    color: '#333',
  },
  loading: {
    textAlign: 'center',
    padding: '2rem',
  },
  tableContainer: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: 'white',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  th: {
    padding: '0.75rem 1rem',
    textAlign: 'left',
    backgroundColor: '#f8f9fa',
    borderBottom: '2px solid #dee2e6',
    fontWeight: '600',
    color: '#495057',
    whiteSpace: 'nowrap',
  },
  td: {
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #dee2e6',
    verticalAlign: 'top',
  },
  nameCell: {
    whiteSpace: 'nowrap',
    minWidth: '120px',
  },
  select: {
    padding: '0.5rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '0.9rem',
  },
  deleteButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  input: {
    padding: '0.5rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '0.9rem',
  },
  makeAllAdminButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  vacationStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.85rem',
  },
  vacationStatItem: {
    display: 'flex',
    gap: '0.5rem',
  },
  vacationLabel: {
    fontWeight: '600',
    color: '#666',
    minWidth: '40px',
  },
  vacationRemaining: {
    fontWeight: '600',
  },
  noData: {
    color: '#999',
    fontSize: '0.9rem',
  },
  numberInput: {
    padding: '0.5rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '0.9rem',
    width: '80px',
  },
  substituteHolidaysCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    whiteSpace: 'nowrap',
  },
  addButton: {
    padding: '0.25rem 0.5rem',
    backgroundColor: '#17a2b8',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    width: '30px',
    height: '30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  viewButton: {
    padding: '0.4rem 0.8rem',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    whiteSpace: 'nowrap',
  },
  substituteList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    maxHeight: '400px',
    overflowY: 'auto',
  },
  substituteItem: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0.75rem 1rem',
    backgroundColor: '#e7f3ff',
    borderRadius: '4px',
    fontSize: '0.9rem',
  },
  removeButton: {
    padding: '0.25rem 0.5rem',
    backgroundColor: 'transparent',
    color: '#dc3545',
    border: '1px solid #dc3545',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
    marginLeft: '1rem',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '0',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.5rem',
    borderBottom: '1px solid #dee2e6',
  },
  modalTitle: {
    margin: 0,
    fontSize: '1.25rem',
    color: '#333',
  },
  modalCloseButton: {
    padding: '0.25rem 0.75rem',
    backgroundColor: 'transparent',
    color: '#666',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '1.5rem',
    lineHeight: 1,
    fontWeight: 'bold',
  },
  modalBody: {
    padding: '1.5rem',
    overflowY: 'auto',
  },
  vacationManageButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#17a2b8',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
};

export default UserManagement;
