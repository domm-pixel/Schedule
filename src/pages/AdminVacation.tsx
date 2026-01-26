import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore';
import { addMonths, addYears, isAfter, isBefore, parseISO, differenceInYears, isPast, startOfDay, format } from 'date-fns';
import { db } from '../firebase/config';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { User, Vacation, SubstituteHolidayRequest } from '../types';
import Toast from '../components/Toast';
import DatePicker from 'react-datepicker';
import { ko } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { 
  notifyVacationCreated, 
  notifySubstituteHolidayRequestApproved, 
  notifySubstituteHolidayRequestRejected 
} from '../utils/slackNotification';

// 날짜를 로컬 시간대 기준으로 yyyy-MM-dd 형식으로 변환
const formatDateToLocal = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// 날짜 문자열을 로컬 시간대 기준 Date 객체로 변환
const parseDateString = (dateStr: string): Date => {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
};

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
  const [viewingSubstituteHoliday, setViewingSubstituteHoliday] = useState(false);
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
          workDate: data.workDate || data.date, // 하위 호환성
          useDate: data.useDate || data.date, // 하위 호환성
          date: data.useDate || data.date, // 하위 호환성
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

  const handleApproveRequest = async (requestId: string, userId: string, useDate: string) => {
    if (!userData) return;
    try {
      const requestRef = doc(db, 'substituteHolidayRequests', requestId);
      await updateDoc(requestRef, {
        status: 'approved',
        reviewedByUid: userData.uid,
        reviewedByName: userData.name,
        reviewedAt: serverTimestamp(),
      });

      // 승인 시 해당 사용자의 substituteHolidays 배열에 사용하려는 휴일 추가
      const user = users.find((u) => u.uid === userId);
      if (user) {
        const currentHolidays = user.substituteHolidays || [];
        if (!currentHolidays.includes(useDate)) {
          const userRef = doc(db, 'users', user.id);
          await updateDoc(userRef, {
            substituteHolidays: [...currentHolidays, useDate],
            updatedAt: new Date().toISOString(),
          });
        }
      }

      fetchRequests();
      if (selectedUserId === userId) {
        fetchUsers();
      }
      setToast({ message: '승인 완료되었습니다.', type: 'success' });
      
      // Slack 알림 전송
      const request = requests.find(r => r.id === requestId);
      if (request) {
        notifySubstituteHolidayRequestApproved(
          request.userName,
          request.workDate || request.date || '',
          request.useDate || request.date || '',
          userData.name
        ).catch(err => console.error('Slack 알림 전송 실패:', err));
      }
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
      const request = requests.find(r => r.id === requestId);
      
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
      
      // Slack 알림 전송
      if (request) {
        notifySubstituteHolidayRequestRejected(
          request.userName,
          request.workDate || request.date || '',
          request.useDate || request.date || '',
          rejectReason.trim(),
          userData.name
        ).catch(err => console.error('Slack 알림 전송 실패:', err));
      }
    } catch (error) {
      console.error('반려 실패:', error);
      setToast({ message: '반려 처리에 실패했습니다.', type: 'error' });
    }
  };

  const handleDeleteRequest = async (requestId: string, userId: string, useDate: string, status: string) => {
    if (!window.confirm('이 신청 내역을 삭제하시겠습니까? 승인된 경우 사용자의 대체 휴무 일수에서도 제거됩니다.')) return;
    if (!userData) return;
    
    try {
      // 승인된 신청인 경우, 사용자의 substituteHolidays 배열에서 사용하려는 휴일 제거
      if (status === 'approved') {
        const user = users.find((u) => u.uid === userId);
        if (user) {
          const currentHolidays = user.substituteHolidays || [];
          if (currentHolidays.includes(useDate)) {
            const userRef = doc(db, 'users', user.id);
            await updateDoc(userRef, {
              substituteHolidays: currentHolidays.filter((d) => d !== useDate),
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
      
      // Slack 알림 전송 (관리자가 등록하는 경우는 알림 제외)
      // notifyVacationCreated는 사용자가 직접 등록할 때만 호출
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

  const handleAddSubstituteHoliday = async () => {
    if (!selectedUser || !userData) return;
    
    const dateStr = prompt('대체 휴무일을 입력하세요 (yyyy-MM-dd 형식):');
    if (!dateStr) return;

    try {
      const currentHolidays = selectedUser.substituteHolidays || [];
      if (currentHolidays.includes(dateStr)) {
        setToast({ message: '이미 등록된 대체 휴무일입니다.', type: 'error' });
        return;
      }

      await updateDoc(doc(db, 'users', selectedUser.id), {
        substituteHolidays: [...currentHolidays, dateStr],
        updatedAt: new Date().toISOString(),
      });
      fetchUsers();
      setToast({ message: '대체 휴무일이 추가되었습니다.', type: 'success' });
    } catch (error) {
      console.error('대체 휴무일 추가 실패:', error);
      setToast({ message: '대체 휴무일 추가에 실패했습니다.', type: 'error' });
    }
  };

  const handleRemoveSubstituteHoliday = async (dateStr: string) => {
    if (!selectedUser || !userData) return;
    if (!window.confirm('이 대체 휴무일을 삭제하시겠습니까?')) return;

    try {
      const currentHolidays = selectedUser.substituteHolidays || [];
      await updateDoc(doc(db, 'users', selectedUser.id), {
        substituteHolidays: currentHolidays.filter((d) => d !== dateStr),
        updatedAt: new Date().toISOString(),
      });
      fetchUsers();
      setToast({ message: '대체 휴무일이 삭제되었습니다.', type: 'success' });
    } catch (error) {
      console.error('대체 휴무일 삭제 실패:', error);
      setToast({ message: '대체 휴무일 삭제에 실패했습니다.', type: 'error' });
    }
  };

  // 선택된 사용자의 휴가 내역을 엑셀로 다운로드
  const handleDownloadExcel = () => {
    if (!selectedUser || vacations.length === 0) {
      setToast({ message: '다운로드할 휴가 내역이 없습니다.', type: 'error' });
      return;
    }

    const excelData = vacations.map((v) => ({
      '사용일': format(new Date(v.date), 'yyyy-MM-dd'),
      '일수': v.days,
      '대직자': v.substituteUserName || selectedUser.name || '-',
      '사유': v.reason || '-',
      '입력자': v.createdByName,
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '휴가 사용 내역');

    // 컬럼 너비 설정
    worksheet['!cols'] = [
      { wch: 12 }, // 사용일
      { wch: 6 },  // 일수
      { wch: 10 }, // 대직자
      { wch: 20 }, // 사유
      { wch: 10 }, // 입력자
    ];

    const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileName = `${selectedUser.name}_휴가사용내역_${format(new Date(), 'yyyyMMdd')}.xlsx`;
    saveAs(blob, fileName);
    setToast({ message: '엑셀 파일이 다운로드되었습니다.', type: 'success' });
  };

  // 전체 사용자의 휴가 내역을 엑셀로 다운로드
  const handleDownloadAllExcel = async () => {
    try {
      const allVacationsQuery = query(
        collection(db, 'vacations'),
        orderBy('date', 'desc')
      );
      const snapshot = await getDocs(allVacationsQuery);
      const allVacations = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Vacation[];

      if (allVacations.length === 0) {
        setToast({ message: '다운로드할 휴가 내역이 없습니다.', type: 'error' });
        return;
      }

      // 사용자 이름 매핑
      const userMap = new Map(users.map(u => [u.uid, u.name]));

      const excelData = allVacations.map((v) => ({
        '사원명': userMap.get(v.userId) || v.userId,
        '사용일': format(new Date(v.date), 'yyyy-MM-dd'),
        '일수': v.days,
        '대직자': v.substituteUserName || '-',
        '사유': v.reason || '-',
        '입력자': v.createdByName,
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, '전체 휴가 사용 내역');

      // 컬럼 너비 설정
      worksheet['!cols'] = [
        { wch: 10 }, // 사원명
        { wch: 12 }, // 사용일
        { wch: 6 },  // 일수
        { wch: 10 }, // 대직자
        { wch: 20 }, // 사유
        { wch: 10 }, // 입력자
      ];

      const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileName = `전체_휴가사용내역_${format(new Date(), 'yyyyMMdd')}.xlsx`;
      saveAs(blob, fileName);
      setToast({ message: '전체 휴가 내역이 다운로드되었습니다.', type: 'success' });
    } catch (error) {
      console.error('전체 휴가 내역 다운로드 실패:', error);
      setToast({ message: '다운로드에 실패했습니다.', type: 'error' });
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
                  <div style={styles.helperText}>
                    * 규칙: 입사 후 1년 미만은 매달 1일씩 발생, 각 일수는 발생일로부터 1년이 지나면 자동 소멸합니다.
                  </div>
                  <button
                    onClick={() => setViewingSubstituteHoliday(true)}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: '#17a2b8',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    대체 휴무 관리
                  </button>
                </div>
              </div>

              <div style={styles.card}>
                <h2 style={styles.cardTitle}>휴가 사용 등록</h2>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.25rem', fontWeight: '500' }}>날짜 *</label>
                    <DatePicker
                      selected={newDate ? parseDateString(newDate) : null}
                      onChange={(date: Date | null) => {
                        if (date) {
                          setNewDate(formatDateToLocal(date));
                        } else {
                          setNewDate('');
                        }
                      }}
                      dateFormat="yyyy-MM-dd"
                      locale={ko}
                      placeholderText="날짜를 선택하세요"
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
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h2 style={{ ...styles.cardTitle, marginBottom: 0 }}>휴가 사용 내역</h2>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                      onClick={handleDownloadExcel}
                      disabled={vacations.length === 0}
                      title="선택된 사용자의 휴가 내역 다운로드"
                    >
                      📥 엑셀 다운로드
                    </button>
                    <button
                      style={{
                        padding: '0.5rem 1rem',
                        backgroundColor: '#17a2b8',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.25rem',
                      }}
                      onClick={handleDownloadAllExcel}
                      title="전체 사용자의 휴가 내역 다운로드"
                    >
                      📥 전체 다운로드
                    </button>
                  </div>
                </div>
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
                        <th style={styles.th}>사용하려는 휴일</th>
                        <th style={styles.th}>대직자</th>
                        <th style={styles.th}>사유</th>
                        <th style={styles.th}>상태</th>
                        <th style={styles.th}>작업</th>
                      </tr>
                    </thead>
                    <tbody>
                      {requests.map((req) => {
                        const workDate = req.workDate || req.date; // 하위 호환성
                        const useDate = req.useDate || req.date; // 하위 호환성
                        return (
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
                            {workDate ? new Date(workDate).toLocaleDateString('ko-KR') : '-'}
                          </td>
                          <td style={styles.td}>
                            {useDate ? new Date(useDate).toLocaleDateString('ko-KR') : '-'}
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
                                  onClick={() => {
                                    const useDate = req.useDate || req.date || '';
                                    if (useDate) {
                                      handleApproveRequest(req.id, req.userId, useDate);
                                    }
                                  }}
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
                                  onClick={() => {
                                    const useDate = req.useDate || req.date || '';
                                    if (useDate) {
                                      handleDeleteRequest(req.id, req.userId, useDate, req.status);
                                    }
                                  }}
                                  title="삭제"
                                >
                                  삭제
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                        );
                        })}
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
      
      {/* 대체 휴무일 관리 모달 */}
      {viewingSubstituteHoliday && selectedUser && (
        <div style={styles.modalOverlay} onClick={() => setViewingSubstituteHoliday(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>
                {selectedUser.name}님의 대체 휴무일 관리
              </h3>
              <button
                onClick={() => setViewingSubstituteHoliday(false)}
                style={styles.modalCloseButton}
              >
                ×
              </button>
            </div>
            <div style={styles.modalBody}>
              <div style={{ marginBottom: '1rem' }}>
                <button
                  onClick={handleAddSubstituteHoliday}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#17a2b8',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                  }}
                >
                  + 대체 휴무일 추가
                </button>
              </div>
              {(() => {
                const holidays = selectedUser.substituteHolidays || [];
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
                            handleRemoveSubstituteHoliday(dateStr);
                            if (holidays.length === 1) {
                              setViewingSubstituteHoliday(false);
                            }
                          }}
                          style={styles.removeButton}
                          title="삭제"
                        >
                          삭제
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
};

export default AdminVacation;

