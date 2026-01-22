import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { addMonths, addYears, isAfter, isBefore, parseISO, differenceInYears, isPast, startOfDay } from 'date-fns';
import { db } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import { Vacation, SubstituteHolidayRequest, User } from '../types';
import Toast from '../components/Toast';
import DatePicker from 'react-datepicker';
import { ko } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';

const MyVacation: React.FC = () => {
  const { userData, refreshUserData } = useAuth();
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [requests, setRequests] = useState<SubstituteHolidayRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'vacation' | 'substitute'>('vacation');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<User[]>([]);
  const [newDate, setNewDate] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newSubstituteUserName, setNewSubstituteUserName] = useState('');
  const [requestDate, setRequestDate] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [requestSubstituteUserName, setRequestSubstituteUserName] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const fetchVacations = useCallback(async () => {
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
        const data = d.data() as any;
        // 기존 데이터에 대직자가 없으면 본인 이름으로 설정 (마이그레이션)
        const vacation: Vacation = {
          id: d.id,
          userId: data.userId,
          date: data.date,
          days: data.days || 1,
          reason: data.reason,
          substituteUserName: data.substituteUserName || userData.name,
          createdByUid: data.createdByUid,
          createdByName: data.createdByName,
          createdAt: data.createdAt,
        };
        list.push(vacation);
        
        // 대직자가 없는 기존 데이터는 업데이트 (한 번만, 백그라운드에서 처리)
        if (!data.substituteUserName && userData && data.createdAt) {
          // 생성일이 있는 경우에만 마이그레이션 (새 데이터는 이미 대직자가 있음)
          updateDoc(doc(db, 'vacations', d.id), {
            substituteUserName: userData.name,
          }).catch((err) => {
            // 이미 업데이트된 경우 무시 (에러 무시)
            if (err.code !== 'permission-denied') {
              console.error('대직자 마이그레이션 실패:', err);
            }
          });
        }
      });
      setVacations(list);
    } catch (error) {
      console.error('휴가 내역 조회 실패:', error);
      setToast({ message: '휴가 내역을 불러오는 데 실패했습니다.', type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [userData]);

  const handleAddVacation = async () => {
    if (!userData || !newDate) return;
    
    // 입력 검증
    const selectedDate = parseISO(newDate);
    if (isPast(startOfDay(selectedDate))) {
      setToast({ message: '과거 날짜는 등록할 수 없습니다.', type: 'error' });
      return;
    }
    
    // 중복 체크
    const isDuplicate = vacations.some((v) => v.date === newDate);
    if (isDuplicate) {
      setToast({ message: '이미 등록된 날짜입니다.', type: 'error' });
      return;
    }
    
    try {
      await addDoc(collection(db, 'vacations'), {
        userId: userData.uid,
        date: newDate,
        days: 1,
        reason: newReason || null,
        substituteUserName: newSubstituteUserName || userData.name,
        createdByUid: userData.uid,
        createdByName: userData.name,
        createdAt: serverTimestamp(),
      });
      setNewDate('');
      setNewReason('');
      setNewSubstituteUserName(userData.name); // 기본값으로 리셋
      fetchVacations();
      setToast({ message: '휴가가 등록되었습니다.', type: 'success' });
    } catch (error) {
      console.error('휴가 등록 실패:', error);
      setToast({ message: '휴가 등록에 실패했습니다.', type: 'error' });
    }
  };

  const handleDeleteVacation = async (vacationId: string) => {
    if (!window.confirm('해당 휴가 사용 내역을 삭제하시겠습니까?')) return;
    try {
      await deleteDoc(doc(db, 'vacations', vacationId));
      setVacations((prev) => prev.filter((v) => v.id !== vacationId));
      setToast({ message: '휴가가 삭제되었습니다.', type: 'success' });
    } catch (error) {
      console.error('휴가 삭제 실패:', error);
      setToast({ message: '휴가 삭제에 실패했습니다.', type: 'error' });
    }
  };

  const fetchRequests = useCallback(async () => {
    if (!userData) return;
    try {
      const q = query(
        collection(db, 'substituteHolidayRequests'),
        where('userId', '==', userData.uid),
        orderBy('createdAt', 'desc'),
      );
      const snapshot = await getDocs(q);
      const list: SubstituteHolidayRequest[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as any;
        const request: SubstituteHolidayRequest = {
          id: d.id,
          userId: data.userId,
          userName: data.userName,
          date: data.date,
          reason: data.reason,
          substituteUserName: data.substituteUserName || userData.name,
          status: data.status,
          rejectedReason: data.rejectedReason,
          createdByUid: data.createdByUid,
          createdByName: data.createdByName,
          createdAt: data.createdAt,
          reviewedByUid: data.reviewedByUid,
          reviewedByName: data.reviewedByName,
          reviewedAt: data.reviewedAt,
        };
        list.push(request);
        
        // 대직자가 없는 기존 데이터는 업데이트 (한 번만, 백그라운드에서 처리)
        if (!data.substituteUserName && userData && data.createdAt) {
          updateDoc(doc(db, 'substituteHolidayRequests', d.id), {
            substituteUserName: userData.name,
          }).catch((err) => {
            // 이미 업데이트된 경우 무시 (에러 무시)
            if (err.code !== 'permission-denied') {
              console.error('대직자 마이그레이션 실패:', err);
            }
          });
        }
      });
      setRequests(list);
    } catch (error) {
      console.error('대체 휴무 신청 내역 조회 실패:', error);
    }
  }, [userData]);

  const fetchUsers = useCallback(async () => {
    try {
      const q = query(collection(db, 'users'), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      const list: User[] = [];
      snapshot.forEach((d) => {
        list.push({ id: d.id, ...d.data() } as User);
      });
      setUsers(list);
    } catch (error) {
      console.error('사용자 목록 조회 실패:', error);
    }
  }, []);

  useEffect(() => {
    if (!userData) return;
    fetchUsers();
    fetchVacations();
    fetchRequests();
  }, [userData, fetchVacations, fetchRequests, fetchUsers]);
  
  // 대직자 기본값 설정 (본인)
  useEffect(() => {
    if (userData && !newSubstituteUserName) {
      setNewSubstituteUserName(userData.name);
    }
    if (userData && !requestSubstituteUserName) {
      setRequestSubstituteUserName(userData.name);
    }
  }, [userData, newSubstituteUserName, requestSubstituteUserName]);
  
  // 승인된 신청이 있는지 확인하고 userData 갱신 (별도 useEffect로 분리하여 무한 루프 방지)
  useEffect(() => {
    if (!userData || requests.length === 0) return;
    
    const approvedDates = requests
      .filter((req) => req.status === 'approved')
      .map((req) => req.date);
    const currentHolidays = userData.substituteHolidays || [];
    const hasNewApprovals = approvedDates.some((date) => !currentHolidays.includes(date));
    
    if (hasNewApprovals) {
      // 승인된 대체 휴무가 새로 있으면 userData 갱신
      refreshUserData();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requests, userData?.substituteHolidays?.join(',')]); // substituteHolidays 배열을 문자열로 변환하여 비교
  
  // 대체 휴무 신청 탭일 때 주기적으로 신청 목록 갱신 (승인 확인용)
  useEffect(() => {
    if (!userData || activeTab !== 'substitute') return;
    
    const interval = setInterval(() => {
      fetchRequests();
    }, 5000); // 5초마다 확인
    
    return () => clearInterval(interval);
  }, [userData, activeTab, fetchRequests]);

  const handleSubmitRequest = async () => {
    if (!userData || !requestDate) return;
    
    // 입력 검증
    const selectedDate = parseISO(requestDate);
    if (isPast(startOfDay(selectedDate))) {
      setToast({ message: '과거 날짜는 신청할 수 없습니다.', type: 'error' });
      return;
    }
    
    // 중복 체크 (대기중이거나 승인된 신청)
    const isDuplicate = requests.some(
      (req) => req.date === requestDate && (req.status === 'pending' || req.status === 'approved')
    );
    if (isDuplicate) {
      setToast({ message: '이미 신청된 날짜입니다.', type: 'error' });
      return;
    }
    
    try {
      await addDoc(collection(db, 'substituteHolidayRequests'), {
        userId: userData.uid,
        userName: userData.name,
        date: requestDate,
        reason: requestReason || null,
        substituteUserName: requestSubstituteUserName || userData.name,
        status: 'pending',
        createdByUid: userData.uid,
        createdByName: userData.name,
        createdAt: serverTimestamp(),
      });
      setRequestDate('');
      setRequestReason('');
      setRequestSubstituteUserName(userData.name); // 기본값으로 리셋
      fetchRequests();
      setToast({ message: '대체 휴무 신청이 완료되었습니다. 관리자 승인을 기다려주세요.', type: 'success' });
    } catch (error) {
      console.error('대체 휴무 신청 실패:', error);
      setToast({ message: '대체 휴무 신청에 실패했습니다.', type: 'error' });
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

          <div style={styles.tabContainer}>
            <button
              style={{
                ...styles.tabButton,
                ...(activeTab === 'vacation' ? styles.tabButtonActive : {}),
              }}
              onClick={() => setActiveTab('vacation')}
            >
              휴가 관리
            </button>
            <button
              style={{
                ...styles.tabButton,
                ...(activeTab === 'substitute' ? styles.tabButtonActive : {}),
              }}
              onClick={() => setActiveTab('substitute')}
            >
              대체 휴무 신청
              {requests.filter((r) => r.status === 'pending').length > 0 && (
                <span style={styles.badge}>
                  {requests.filter((r) => r.status === 'pending').length}
                </span>
              )}
            </button>
          </div>

          {activeTab === 'vacation' && (
            <>
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
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem', fontWeight: '500' }}>날짜 *</label>
                <DatePicker
                  selected={newDate ? new Date(newDate) : null}
                  onChange={(date: Date | null) => {
                    if (date) {
                      setNewDate(date.toISOString().split('T')[0]);
                    } else {
                      setNewDate('');
                    }
                  }}
                  dateFormat="yyyy-MM-dd"
                  locale={ko}
                  placeholderText="날짜를 선택하세요"
                  minDate={new Date()}
                  showYearDropdown
                  showMonthDropdown
                  yearDropdownItemNumber={100}
                  scrollableYearDropdown
                  className="date-picker-input"
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem', fontWeight: '500' }}>대직자 *</label>
                <select
                  value={newSubstituteUserName}
                  onChange={(e) => setNewSubstituteUserName(e.target.value)}
                  style={{ height: '38px', padding: '0.5rem 0.75rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.9rem', minWidth: '120px' }}
                >
                  {users.map((user) => (
                    <option key={user.uid} value={user.name}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem', fontWeight: '500' }}>사유</label>
                <input
                  type="text"
                  placeholder="사유 (선택)"
                  value={newReason}
                  onChange={(e) => setNewReason(e.target.value)}
                  style={{ height: '38px', padding: '0.5rem 0.75rem', border: '1px solid #ddd', borderRadius: '4px', fontSize: '0.9rem', width: '100%', boxSizing: 'border-box' }}
                />
              </div>
              <button
                style={{ ...styles.addButton, height: '38px', padding: '0.5rem 1rem' }}
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
                        <th style={styles.th}>대직자</th>
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
                          <td style={styles.td}>{v.substituteUserName || userData?.name || '-'}</td>
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
            </>
          )}

          {activeTab === 'substitute' && (
            <>
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>대체 휴무 신청</h2>
            <div style={styles.helperText}>
              * 대체 휴무는 휴일 근무 시 발생합니다. 관리자 승인 후 잔여 휴가에 반영됩니다.
            </div>
            <div style={styles.formRow}>
              <DatePicker
                selected={requestDate ? new Date(requestDate) : null}
                onChange={(date: Date | null) => {
                  if (date) {
                    setRequestDate(date.toISOString().split('T')[0]);
                  } else {
                    setRequestDate('');
                  }
                }}
                dateFormat="yyyy-MM-dd"
                locale={ko}
                placeholderText="근무한 휴일을 선택하세요"
                minDate={new Date()}
                showYearDropdown
                showMonthDropdown
                yearDropdownItemNumber={100}
                scrollableYearDropdown
                className="date-picker-input"
              />
              <select
                value={requestSubstituteUserName}
                onChange={(e) => setRequestSubstituteUserName(e.target.value)}
                style={styles.input}
              >
                {users.map((user) => (
                  <option key={user.uid} value={user.name}>
                    {user.name}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="신청 사유 (선택)"
                value={requestReason}
                onChange={(e) => setRequestReason(e.target.value)}
                style={styles.input}
              />
              <button
                style={styles.addButton}
                onClick={handleSubmitRequest}
                disabled={!requestDate}
              >
                신청
              </button>
            </div>
          </div>

          <div style={styles.card}>
            <h2 style={styles.cardTitle}>대체 휴무 신청 내역</h2>
            {requests.length === 0 ? (
              <div style={styles.empty}>신청 내역이 없습니다.</div>
            ) : (
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>신청일</th>
                        <th style={styles.th}>근무한 휴일</th>
                        <th style={styles.th}>대직자</th>
                        <th style={styles.th}>사유</th>
                        <th style={styles.th}>상태</th>
                        <th style={styles.th}>처리 내용</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((req) => (
                        <tr key={req.id}>
                          <td style={styles.td}>
                            {req.createdAt
                              ? (req.createdAt as any)?.toDate
                                ? (req.createdAt as any).toDate().toLocaleDateString('ko-KR')
                                : new Date(req.createdAt).toLocaleDateString('ko-KR')
                              : '-'}
                          </td>
                          <td style={styles.td}>
                            {new Date(req.date).toLocaleDateString('ko-KR')}
                          </td>
                          <td style={styles.td}>{req.substituteUserName || userData?.name || '-'}</td>
                          <td style={styles.td}>{req.reason || '-'}</td>
                        <td style={styles.td}>
                          <span style={{
                            ...styles.statusBadge,
                            backgroundColor: req.status === 'approved' ? '#d4edda' : req.status === 'rejected' ? '#f8d7da' : '#fff3cd',
                            color: req.status === 'approved' ? '#155724' : req.status === 'rejected' ? '#721c24' : '#856404',
                          }}>
                            {req.status === 'pending' ? '대기중' : req.status === 'approved' ? '승인' : '반려'}
                          </span>
                        </td>
                        <td style={styles.td}>
                          {req.status === 'approved' && (
                            <span style={{ color: '#28a745', fontSize: '0.85rem' }}>
                              {req.reviewedByName}님이 승인
                            </span>
                          )}
                          {req.status === 'rejected' && (
                            <div>
                              <div style={{ color: '#dc3545', fontSize: '0.85rem', marginBottom: '0.25rem' }}>
                                {req.reviewedByName}님이 반려
                              </div>
                              {req.rejectedReason && (
                                <div style={{ fontSize: '0.8rem', color: '#666' }}>
                                  사유: {req.rejectedReason}
                                </div>
                              )}
                            </div>
                          )}
                          {req.status === 'pending' && (
                            <span style={{ color: '#999', fontSize: '0.85rem' }}>승인 대기중</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
            </>
          )}
        </div>
      </div>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
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
    height: '38px',
    boxSizing: 'border-box',
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
  statusBadge: {
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.85rem',
    fontWeight: '600',
  },
  tabContainer: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1.5rem',
    borderBottom: '2px solid #eee',
  },
  tabButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: 'transparent',
    color: '#666',
    border: 'none',
    borderBottom: '3px solid transparent',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '500',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  tabButtonActive: {
    color: '#007bff',
    borderBottomColor: '#007bff',
    fontWeight: '600',
  },
  badge: {
    backgroundColor: '#dc3545',
    color: 'white',
    borderRadius: '12px',
    padding: '0.125rem 0.5rem',
    fontSize: '0.75rem',
    fontWeight: '600',
  },
};

export default MyVacation;

