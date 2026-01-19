import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { addMonths, addYears, isAfter, isBefore, parseISO, differenceInYears, isPast, startOfDay } from 'date-fns';
import { db } from '../firebase/config';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { User, Vacation, SubstituteHolidayRequest } from '../types';
import Toast from '../components/Toast';
import DatePicker from 'react-datepicker';
import { ko } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';

interface AccrualStats {
  accrued: number;
  used: number;
  remaining: number;
  substituteDays: number;
}

const AdminVacation: React.FC = () => {
  const { userData } = useAuth();
  const location = useLocation<{ selectedUserId?: string }>();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [requests, setRequests] = useState<SubstituteHolidayRequest[]>([]);
  const [activeTab, setActiveTab] = useState<'vacation' | 'requests'>('vacation');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingVacations, setLoadingVacations] = useState(false);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [newDate, setNewDate] = useState('');
  const [newReason, setNewReason] = useState('');
  const [newSubstituteUserName, setNewSubstituteUserName] = useState('');
  const [editingVacation, setEditingVacation] = useState<Vacation | null>(null);
  const [editSubstituteUserName, setEditSubstituteUserName] = useState('');
  const [editingRequest, setEditingRequest] = useState<SubstituteHolidayRequest | null>(null);
  const [editRequestSubstituteUserName, setEditRequestSubstituteUserName] = useState('');
  const [rejectReason, setRejectReason] = useState('');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoadingUsers(true);
      const q = query(collection(db, 'users'), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      const list: User[] = [];
      snapshot.forEach((d) => list.push({ id: d.id, ...d.data() } as User));
      setUsers(list);
    } catch (error) {
      // 조용히 실패 (사용자에게는 표시하지 않음, 콘솔에만 기록)
      console.error('사용자 목록 조회 실패:', error);
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const fetchVacations = useCallback(async (userId: string) => {
    try {
      setLoadingVacations(true);
      const q = query(
        collection(db, 'vacations'),
        where('userId', '==', userId),
        orderBy('date', 'desc'),
      );
      const snapshot = await getDocs(q);
      const list: Vacation[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as any;
        const targetUser = users.find((u) => u.uid === userId);
        const vacation: Vacation = {
          id: d.id,
          userId: data.userId,
          date: data.date,
          days: data.days || 1,
          reason: data.reason,
          substituteUserName: data.substituteUserName || targetUser?.name,
          createdByUid: data.createdByUid,
          createdByName: data.createdByName,
          createdAt: data.createdAt,
        };
        list.push(vacation);
        
        // 대직자가 없는 기존 데이터는 업데이트 (한 번만, 백그라운드에서 처리)
        if (!data.substituteUserName && targetUser && data.createdAt) {
          updateDoc(doc(db, 'vacations', d.id), {
            substituteUserName: targetUser.name,
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
      alert('휴가 내역을 불러오는 데 실패했습니다.');
    } finally {
      setLoadingVacations(false);
    }
  }, [users]);

  const fetchRequests = useCallback(async () => {
    try {
      setLoadingRequests(true);
      const q = query(
        collection(db, 'substituteHolidayRequests'),
        orderBy('createdAt', 'desc'),
      );
      const snapshot = await getDocs(q);
      const list: SubstituteHolidayRequest[] = [];
      snapshot.forEach((d) => {
        const data = d.data() as any;
        const targetUser = users.find((u) => u.uid === data.userId);
        const request: SubstituteHolidayRequest = {
          id: d.id,
          userId: data.userId,
          userName: data.userName,
          date: data.date,
          reason: data.reason,
          substituteUserName: data.substituteUserName || targetUser?.name,
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
        if (!data.substituteUserName && targetUser && data.createdAt) {
          updateDoc(doc(db, 'substituteHolidayRequests', d.id), {
            substituteUserName: targetUser.name,
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
      // 조용히 실패 (사용자에게는 표시하지 않음, 콘솔에만 기록)
      console.error('대체 휴무 신청 목록 조회 실패:', error);
    } finally {
      setLoadingRequests(false);
    }
  }, [users]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    // 회원 관리에서 넘어온 경우 해당 사용자 선택
    if (location.state?.selectedUserId) {
      setSelectedUserId(location.state.selectedUserId);
    } else if (users.length > 0 && !selectedUserId) {
      // location.state가 없고 selectedUserId도 없을 때 첫 번째 사용자 선택
      setSelectedUserId(users[0].uid);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state, users]);

  useEffect(() => {
    if (selectedUserId) {
      fetchVacations(selectedUserId);
    } else {
      setVacations([]);
    }
  }, [selectedUserId, fetchVacations]);

  useEffect(() => {
    if (activeTab === 'requests') {
      fetchRequests();
    }
  }, [activeTab, fetchRequests]);

  const handleApproveRequest = async (requestId: string, userId: string, date: string) => {
    if (!userData) return;
    try {
      const requestRef = doc(db, 'substituteHolidayRequests', requestId);
      await updateDoc(requestRef, {
        status: 'approved',
        reviewedByUid: userData.uid,
        reviewedByName: userData.name,
        reviewedAt: serverTimestamp(),
      });

      // 승인 시 해당 사용자의 substituteHolidays 배열에 추가
      const user = users.find((u) => u.uid === userId);
      if (user) {
        const currentHolidays = user.substituteHolidays || [];
        if (!currentHolidays.includes(date)) {
          const userRef = doc(db, 'users', user.id);
          await updateDoc(userRef, {
            substituteHolidays: [...currentHolidays, date],
            updatedAt: new Date().toISOString(),
          });
        }
      }

      fetchRequests();
      if (selectedUserId === userId) {
        fetchUsers();
      }
      setToast({ message: '승인 완료되었습니다.', type: 'success' });
    } catch (error) {
      console.error('승인 실패:', error);
      setToast({ message: '승인 처리에 실패했습니다.', type: 'error' });
    }
  };

  const handleRejectRequest = async (requestId: string) => {
    if (!userData || !rejectReason.trim()) {
      alert('반려 사유를 입력해주세요.');
      return;
    }
    try {
      const requestRef = doc(db, 'substituteHolidayRequests', requestId);
      await updateDoc(requestRef, {
        status: 'rejected',
        rejectedReason: rejectReason.trim(),
        reviewedByUid: userData.uid,
        reviewedByName: userData.name,
        reviewedAt: serverTimestamp(),
      });

      setRejectReason('');
      setSelectedRequestId(null);
      fetchRequests();
      setToast({ message: '반려 처리되었습니다.', type: 'success' });
    } catch (error) {
      console.error('반려 실패:', error);
      setToast({ message: '반려 처리에 실패했습니다.', type: 'error' });
    }
  };

  const handleDeleteRequest = async (requestId: string, userId: string, date: string, status: string) => {
    if (!window.confirm('이 신청 내역을 삭제하시겠습니까? 승인된 경우 사용자의 대체 휴무 일수에서도 제거됩니다.')) return;
    if (!userData) return;
    
    try {
      // 승인된 신청인 경우, 사용자의 substituteHolidays 배열에서 해당 날짜 제거
      if (status === 'approved') {
        const user = users.find((u) => u.uid === userId);
        if (user) {
          const currentHolidays = user.substituteHolidays || [];
          if (currentHolidays.includes(date)) {
            const userRef = doc(db, 'users', user.id);
            await updateDoc(userRef, {
              substituteHolidays: currentHolidays.filter((d) => d !== date),
              updatedAt: new Date().toISOString(),
            });
          }
        }
      }
      
      // 신청 내역 삭제
      await deleteDoc(doc(db, 'substituteHolidayRequests', requestId));
      
      fetchRequests();
      if (selectedUserId === userId) {
        fetchUsers();
      }
      setToast({ message: '삭제되었습니다.', type: 'success' });
    } catch (error) {
      console.error('삭제 실패:', error);
      setToast({ message: '삭제에 실패했습니다.', type: 'error' });
    }
  };

  const handleAddVacation = async () => {
    if (!userData || !selectedUserId || !newDate) return;
    const targetUser = users.find((u) => u.uid === selectedUserId);
    if (!targetUser) return;

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
        userId: selectedUserId,
        date: newDate,
        days: 1,
        reason: newReason || null,
        substituteUserName: newSubstituteUserName || targetUser.name,
        createdByUid: userData.uid,
        createdByName: userData.name,
        createdAt: serverTimestamp(),
      });
      setNewDate('');
      setNewReason('');
      setNewSubstituteUserName(targetUser.name); // 기본값으로 리셋
      fetchVacations(selectedUserId);
      setToast({ message: '휴가가 등록되었습니다.', type: 'success' });
    } catch (error) {
      console.error('휴가 등록 실패:', error);
      setToast({ message: '휴가 등록에 실패했습니다.', type: 'error' });
    }
  };

  const handleUpdateSubstituteUser = async (vacationId: string, substituteUserName: string) => {
    if (!userData) return;
    try {
      await updateDoc(doc(db, 'vacations', vacationId), {
        substituteUserName: substituteUserName,
      });
      if (selectedUserId) {
        fetchVacations(selectedUserId);
      }
      setEditingVacation(null);
      setToast({ message: '대직자가 수정되었습니다.', type: 'success' });
    } catch (error) {
      console.error('대직자 수정 실패:', error);
      setToast({ message: '대직자 수정에 실패했습니다.', type: 'error' });
    }
  };

  const handleUpdateRequestSubstituteUser = async (requestId: string, substituteUserName: string) => {
    if (!userData) return;
    try {
      await updateDoc(doc(db, 'substituteHolidayRequests', requestId), {
        substituteUserName: substituteUserName,
      });
      fetchRequests();
      setEditingRequest(null);
      setToast({ message: '대직자가 수정되었습니다.', type: 'success' });
    } catch (error) {
      console.error('대직자 수정 실패:', error);
      setToast({ message: '대직자 수정에 실패했습니다.', type: 'error' });
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

  const calculateAccrual = useCallback((selectedUser: User | null): AccrualStats => {
    if (!selectedUser) {
      return { accrued: 0, used: vacations.length, remaining: -vacations.length, substituteDays: 0 };
    }

    const substituteDays = (selectedUser.substituteHolidays || []).length;

    if (!selectedUser.hireDate) {
      return { accrued: 0, used: vacations.length, remaining: -vacations.length + substituteDays, substituteDays };
    }

    const today = new Date();
    const hireDate = parseISO(selectedUser.hireDate);
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
      accrued = 11 + (selectedUser.annualLeaveDays || 0);
    }

    const used = vacations.length;
    const remaining = accrued - used + substituteDays;
    return { accrued, used, remaining, substituteDays };
  }, [vacations]);

  const selectedUser = useMemo(
    () => users.find((u) => u.uid === selectedUserId) || null,
    [users, selectedUserId],
  );

  // 선택된 사용자가 변경되면 대직자 기본값 설정
  useEffect(() => {
    if (selectedUser && !newSubstituteUserName) {
      setNewSubstituteUserName(selectedUser.name);
    }
  }, [selectedUser, newSubstituteUserName]);

  const stats: AccrualStats = useMemo(
    () => calculateAccrual(selectedUser),
    [selectedUser, calculateAccrual],
  );

  if (!userData || userData.role !== 'admin') {
    return <div style={{ padding: '2rem' }}>관리자만 접근할 수 있는 페이지입니다.</div>;
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <div style={{ marginLeft: '250px', width: 'calc(100% - 250px)', padding: '2rem' }}>
        <div style={styles.container}>
          <h1 style={styles.title}>휴가 관리 (관리자)</h1>

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
                ...(activeTab === 'requests' ? styles.tabButtonActive : {}),
              }}
              onClick={() => setActiveTab('requests')}
            >
              대체 휴무 신청 관리
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
                <h2 style={styles.cardTitle}>대상자 선택</h2>
            {loadingUsers ? (
              <div style={styles.loading}>사용자 목록 로딩 중...</div>
            ) : (
              <select
                style={styles.select}
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
              >
                {users.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.name} / {u.username} [{u.team}]
                  </option>
                ))}
              </select>
            )}
          </div>

          {selectedUser && (
            <>
              <div style={styles.card}>
                <h2 style={styles.cardTitle}>휴가 현황</h2>
                <div style={styles.statsRow}>
                  <div style={styles.statItem}>
                    <div style={styles.statLabel}>이름</div>
                    <div style={styles.statValue}>{selectedUser.name}</div>
                  </div>
                  <div style={styles.statItem}>
                    <div style={styles.statLabel}>입사일</div>
                    <div style={styles.statValue}>
                      {selectedUser.hireDate
                        ? new Date(selectedUser.hireDate).toLocaleDateString('ko-KR')
                        : '미입력 (회원 관리에서 설정)'}
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
                  <select
                    value={newSubstituteUserName}
                    onChange={(e) => setNewSubstituteUserName(e.target.value)}
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
                {loadingVacations ? (
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
                          <th style={styles.th}>입력자</th>
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
                            <td style={styles.td}>
                              {editingVacation?.id === v.id ? (
                                <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                  <select
                                    value={editSubstituteUserName}
                                    onChange={(e) => setEditSubstituteUserName(e.target.value)}
                                    style={{ ...styles.input, padding: '0.25rem', fontSize: '0.85rem' }}
                                  >
                                    {users.map((user) => (
                                      <option key={user.uid} value={user.name}>
                                        {user.name}
                                      </option>
                                    ))}
                                  </select>
                                  <button
                                    style={{ ...styles.addButton, padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                    onClick={() => handleUpdateSubstituteUser(v.id, editSubstituteUserName)}
                                  >
                                    저장
                                  </button>
                                  <button
                                    style={{ ...styles.deleteButton, padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                    onClick={() => {
                                      setEditingVacation(null);
                                      setEditSubstituteUserName('');
                                    }}
                                  >
                                    취소
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                  <span>{v.substituteUserName || selectedUser?.name || '-'}</span>
                                  <button
                                    style={{ ...styles.addButton, padding: '0.125rem 0.5rem', fontSize: '0.75rem' }}
                                    onClick={() => {
                                      setEditingVacation(v);
                                      setEditSubstituteUserName(v.substituteUserName || selectedUser?.name || '');
                                    }}
                                    title="대직자 수정"
                                  >
                                    수정
                                  </button>
                                </div>
                              )}
                            </td>
                            <td style={styles.td}>{v.reason || '-'}</td>
                            <td style={styles.td}>{v.createdByName}</td>
                            <td style={styles.td}>
                              <button
                                style={styles.deleteButton}
                                onClick={() => handleDeleteVacation(v.id)}
                              >
                                삭제
                              </button>
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
            </>
          )}

          {activeTab === 'requests' && (
            <div style={styles.card}>
              <h2 style={styles.cardTitle}>대체 휴무 신청 목록</h2>
              {loadingRequests ? (
                <div style={styles.loading}>로딩 중...</div>
              ) : requests.length === 0 ? (
                <div style={styles.empty}>신청 내역이 없습니다.</div>
              ) : (
                <div style={styles.tableContainer}>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>신청자</th>
                        <th style={styles.th}>신청일</th>
                        <th style={styles.th}>근무한 휴일</th>
                        <th style={styles.th}>대직자</th>
                        <th style={styles.th}>사유</th>
                        <th style={styles.th}>상태</th>
                        <th style={styles.th}>작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((req) => (
                        <tr key={req.id}>
                          <td style={styles.td}>{req.userName}</td>
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
                          <td style={styles.td}>
                            {editingRequest?.id === req.id ? (
                              <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                                <select
                                  value={editRequestSubstituteUserName}
                                  onChange={(e) => setEditRequestSubstituteUserName(e.target.value)}
                                  style={{ ...styles.input, padding: '0.25rem', fontSize: '0.85rem' }}
                                >
                                  {users.map((user) => (
                                    <option key={user.uid} value={user.name}>
                                      {user.name}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  style={{ ...styles.addButton, padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                  onClick={() => handleUpdateRequestSubstituteUser(req.id, editRequestSubstituteUserName)}
                                >
                                  저장
                                </button>
                                <button
                                  style={{ ...styles.deleteButton, padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
                                  onClick={() => {
                                    setEditingRequest(null);
                                    setEditRequestSubstituteUserName('');
                                  }}
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                <span>{req.substituteUserName || req.userName || '-'}</span>
                                <button
                                  style={{ ...styles.addButton, padding: '0.125rem 0.5rem', fontSize: '0.75rem' }}
                                  onClick={() => {
                                    setEditingRequest(req);
                                    setEditRequestSubstituteUserName(req.substituteUserName || req.userName || '');
                                  }}
                                  title="대직자 수정"
                                >
                                  수정
                                </button>
                              </div>
                            )}
                          </td>
                          <td style={styles.td}>{req.reason || '-'}</td>
                          <td style={styles.td}>
                            <span style={{
                              ...styles.statusBadge,
                              backgroundColor: req.status === 'approved' ? '#d4edda' : req.status === 'rejected' ? '#f8d7da' : '#fff3cd',
                              color: req.status === 'approved' ? '#155724' : req.status === 'rejected' ? '#721c24' : '#856404',
                            }}>
                              {req.status === 'pending' ? '대기중' : req.status === 'approved' ? '승인' : '반려'}
                            </span>
                            {req.status !== 'pending' && req.reviewedByName && (
                              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                                {req.reviewedByName}
                              </div>
                            )}
                          </td>
                          <td style={styles.td}>
                            {req.status === 'pending' ? (
                              <div style={styles.actionButtons}>
                                <button
                                  style={styles.approveButton}
                                  onClick={() => handleApproveRequest(req.id, req.userId, req.date)}
                                >
                                  승인
                                </button>
                                <button
                                  style={styles.rejectButton}
                                  onClick={() => setSelectedRequestId(req.id)}
                                >
                                  반려
                                </button>
                              </div>
                            ) : (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                {req.status === 'rejected' && req.rejectedReason && (
                                  <div style={{ fontSize: '0.85rem', color: '#666' }}>
                                    사유: {req.rejectedReason}
                                  </div>
                                )}
                                <button
                                  style={styles.deleteButton}
                                  onClick={() => handleDeleteRequest(req.id, req.userId, req.date, req.status)}
                                  title="삭제"
                                >
                                  삭제
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {selectedRequestId && (
                <div style={styles.rejectModal}>
                  <div style={styles.rejectModalContent}>
                    <h3 style={styles.rejectModalTitle}>반려 사유 입력</h3>
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="반려 사유를 입력하세요..."
                      style={styles.rejectTextarea}
                      rows={4}
                    />
                    <div style={styles.rejectModalButtons}>
                      <button
                        style={styles.cancelButton}
                        onClick={() => {
                          setSelectedRequestId(null);
                          setRejectReason('');
                        }}
                      >
                        취소
                      </button>
                      <button
                        style={styles.confirmRejectButton}
                        onClick={() => handleRejectRequest(selectedRequestId)}
                        disabled={!rejectReason.trim()}
                      >
                        반려
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
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
    maxWidth: '1100px',
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
  select: {
    width: '100%',
    padding: '0.5rem 0.75rem',
    borderRadius: '4px',
    border: '1px solid #ddd',
    fontSize: '0.9rem',
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
  statusBadge: {
    padding: '0.25rem 0.5rem',
    borderRadius: '4px',
    fontSize: '0.85rem',
    fontWeight: '600',
  },
  actionButtons: {
    display: 'flex',
    gap: '0.5rem',
  },
  approveButton: {
    padding: '0.25rem 0.75rem',
    backgroundColor: '#28a745',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  rejectButton: {
    padding: '0.25rem 0.75rem',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.8rem',
  },
  noAction: {
    color: '#999',
    fontSize: '0.9rem',
  },
  rejectModal: {
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
  rejectModalContent: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '2rem',
    maxWidth: '500px',
    width: '90%',
  },
  rejectModalTitle: {
    margin: '0 0 1rem 0',
    fontSize: '1.25rem',
    fontWeight: '600',
  },
  rejectTextarea: {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    resize: 'vertical',
    boxSizing: 'border-box',
    marginBottom: '1rem',
  },
  rejectModalButtons: {
    display: 'flex',
    gap: '0.5rem',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  confirmRejectButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#dc3545',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
};

export default AdminVacation;

