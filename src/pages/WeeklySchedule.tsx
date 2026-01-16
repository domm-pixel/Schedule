import React, { useState, useEffect, useCallback } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, serverTimestamp, getDoc, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Schedule, Vacation } from '../types';
import { useAuth } from '../context/AuthContext';
import { 
  startOfWeek, endOfWeek, addWeeks, format, eachDayOfInterval, 
  parseISO, isSameDay, startOfDay, endOfDay, 
  differenceInCalendarDays, max, min, isBefore 
} from 'date-fns';
import { ko } from 'date-fns/locale'; // 한국어 요일 표기를 위해 권장 (없으면 제거 가능)
import Sidebar from '../components/Sidebar';
import LevelTooltip from '../components/LevelTooltip';

const WeeklySchedule: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [currentWeek, setCurrentWeek] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [draggedSchedule, setDraggedSchedule] = useState<Schedule | null>(null);
  const { userData } = useAuth();

  // 상수 정의
  const ROW_HEIGHT = 36; // 스케줄 바 하나의 높이
  const ROW_MARGIN = 4;  // 스케줄 바 사이의 간격
  const HEADER_HEIGHT = 40; // 날짜 헤더 높이

  const fetchSchedules = useCallback(async () => {
    if (!userData) return;

    try {
      setLoading(true);
      const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
      const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });

      const q = query(
        collection(db, 'schedules'),
        where('userId', '==', userData.uid)
      );

      const querySnapshot = await getDocs(q);
      const schedulesList: Schedule[] = [];
      querySnapshot.forEach((docSnapshot) => {
        schedulesList.push({ id: docSnapshot.id, ...docSnapshot.data() } as Schedule);
      });

      // 휴가(vacations) 조회 - 본인 휴가만
      const vQuery = query(
        collection(db, 'vacations'),
        where('userId', '==', userData.uid),
        orderBy('date', 'desc')
      );
      const vacationSnapshot = await getDocs(vQuery);
      const vacationDocs: Vacation[] = [];
      vacationSnapshot.forEach((docSnapshot) => {
        const data = docSnapshot.data() as any;
        vacationDocs.push({
          id: docSnapshot.id,
          userId: data.userId,
          date: data.date,
          days: data.days,
          reason: data.reason,
          createdByUid: data.createdByUid,
          createdByName: data.createdByName,
          createdAt: data.createdAt,
        } as Vacation);
      });

      // 휴가를 스케줄 형태로 변환
      const vacationSchedules: Schedule[] = vacationDocs.map((v) => {
        const dateStr = v.date;
        const isoDate = dateStr.includes('T') ? dateStr : `${dateStr}T00:00:00.000Z`;
        const createdAt =
          (v.createdAt as any)?.toDate?.()?.toISOString?.() ??
          (typeof v.createdAt === 'string' ? v.createdAt : new Date().toISOString());

        return {
          id: `vacation_${v.id}`,
          taskId: `vacation_${v.id}`,
          taskName: '휴가',
          level: '휴가',
          description: v.reason || '휴가',
          status: '완료',
          startDate: isoDate,
          endDate: isoDate,
          deadline: isoDate,
          isPublic: false,
          note: undefined,
          userId: v.userId,
          userName: userData.name,
          createdAt,
          updatedAt: undefined,
          history: [],
          comments: [],
        } as Schedule;
      });

      // 업무 스케줄 + 휴가 스케줄 합치기
      const allSchedules = [...schedulesList, ...vacationSchedules];

      // 이번 주 범위와 겹치는 스케줄만 필터링
      const weekSchedules = allSchedules.filter((schedule) => {
        const startDate = schedule.startDate ? parseISO(schedule.startDate) : schedule.deadline ? parseISO(schedule.deadline) : null;
        const endDate = schedule.endDate ? parseISO(schedule.endDate) : schedule.deadline ? parseISO(schedule.deadline) : null;
        
        if (!startDate || !endDate) return false;
        
        const scheduleStart = startOfDay(startDate);
        const scheduleEnd = endOfDay(endDate);
        const weekStartDay = startOfDay(weekStart);
        const weekEndDay = endOfDay(weekEnd);
        
        return scheduleStart <= weekEndDay && scheduleEnd >= weekStartDay;
      });

      setSchedules(weekSchedules);
    } catch (error) {
      console.error('스케줄 가져오기 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [currentWeek, userData]);

  useEffect(() => {
    fetchSchedules();
  }, [fetchSchedules]);

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  // [핵심 로직] 스케줄 위치 및 겹침 계산 (Row Packing Algorithm)
  const getLayoutSchedules = () => {
    // 1. 시각적 속성 계산 (시작점, 길이 등)
    const visualItems = schedules.map(schedule => {
      const startDate = schedule.startDate ? parseISO(schedule.startDate) : parseISO(schedule.deadline!);
      const endDate = schedule.endDate ? parseISO(schedule.endDate) : parseISO(schedule.deadline!);
      
      // 이번 주 뷰포트 내로 날짜 제한 (Clamping)
      const viewStart = max([startDate, weekStart]);
      const viewEnd = min([endDate, weekEnd]);
      
      // 시작 요일 인덱스 (0: 월, 1: 화 ...)
      const startDayIndex = differenceInCalendarDays(viewStart, weekStart);
      // 기간 (일수)
      const duration = differenceInCalendarDays(viewEnd, viewStart) + 1;

      return {
        ...schedule,
        _viewStart: viewStart,
        _viewEnd: viewEnd,
        _startDayIndex: startDayIndex,
        _duration: duration,
        _originalStart: startDate,
      };
    });

    // 2. 정렬: 시작일이 빠른 순 -> 기간이 긴 순 (계단식 정렬을 위해)
    visualItems.sort((a, b) => {
      const diffStart = a._originalStart.getTime() - b._originalStart.getTime();
      if (diffStart !== 0) return diffStart;
      return b._duration - a._duration;
    });

    // 3. 수직 겹침 계산 (몇 번째 줄에 그릴지 결정)
    const rows: Date[] = []; // 각 행(Row)의 '마지막 종료일'을 저장
    
    const layoutItems = visualItems.map(item => {
      let rowIndex = -1;
      
      // 들어갈 수 있는 빈 행 찾기
      for (let i = 0; i < rows.length; i++) {
        // 해당 행의 마지막 일정보다 내 시작일이 뒤라면 배정 가능
        if (isBefore(rows[i], item._viewStart)) {
          rowIndex = i;
          break;
        }
      }

      // 들어갈 자리가 없으면 새로운 행 추가
      if (rowIndex === -1) {
        rowIndex = rows.length;
        rows.push(item._viewEnd);
      } else {
        // 해당 행의 마지막 종료일 업데이트
        rows[rowIndex] = item._viewEnd;
      }

      return { ...item, _rowIndex: rowIndex };
    });

    return { layoutItems, totalRows: rows.length };
  };

  const { layoutItems, totalRows } = getLayoutSchedules();

  const handleDragStart = (e: React.DragEvent, schedule: Schedule) => {
    // 레벨 배지에서 드래그가 시작되면 드래그를 취소
    const target = e.target as HTMLElement;
    if (target.closest('[data-level-badge]')) {
      e.preventDefault();
      return;
    }
    setDraggedSchedule(schedule);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetDay: Date) => {
    e.preventDefault();
    if (!draggedSchedule || !userData) return;

    try {
      const newDate = format(targetDay, 'yyyy-MM-dd') + 'T00:00:00.000Z';
      const scheduleRef = doc(db, 'schedules', draggedSchedule.id);
      
      const scheduleDoc = await getDoc(scheduleRef);
      if (!scheduleDoc.exists()) throw new Error('스케줄 없음');
      
      const currentSchedule = scheduleDoc.data() as Schedule;
      const oldStartDate = currentSchedule.startDate || currentSchedule.deadline || '';
      const oldEndDate = currentSchedule.endDate || currentSchedule.deadline || '';
      
      const startDateObj = oldStartDate ? parseISO(oldStartDate) : parseISO(oldEndDate);
      const endDateObj = oldEndDate ? parseISO(oldEndDate) : parseISO(oldStartDate);
      
      // 기존 기간(일수) 유지
      const durationDays = Math.round((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
      
      const newStartDate = newDate;
      const newEndDateObj = new Date(parseISO(newDate));
      newEndDateObj.setDate(newEndDateObj.getDate() + durationDays);
      const newEndDate = format(newEndDateObj, 'yyyy-MM-dd') + 'T00:00:00.000Z';
      
      // 이력 관리 및 업데이트 (기존 로직 유지)
      const formatDateForDisplay = (d: string) => new Date(d).toLocaleDateString('ko-KR');
      let changeHistory = currentSchedule.history || [];
      const now = new Date();
      
      if (oldStartDate !== newStartDate) {
        changeHistory.push({
          field: '이동',
          oldValue: `${formatDateForDisplay(oldStartDate)}~${formatDateForDisplay(oldEndDate)}`,
          newValue: `${formatDateForDisplay(newStartDate)}~${formatDateForDisplay(newEndDate)}`,
          changedBy: userData.name,
          changedAt: now as any,
        });
      }
      
      const updateData: any = {
        startDate: newStartDate,
        endDate: newEndDate,
        deadline: newEndDate,
        updatedAt: serverTimestamp(),
        history: changeHistory
      };
      
      await updateDoc(scheduleRef, updateData);
      
      // 즉시 반영을 위해 로컬 상태 업데이트
      setSchedules(prev => prev.map(s => 
        s.id === draggedSchedule.id ? { ...s, ...updateData } : s
      ));

      setDraggedSchedule(null);
    } catch (error) {
      console.error('업데이트 실패:', error);
      alert('스케줄 이동 실패');
      setDraggedSchedule(null);
    }
  };

  const handleDragEnd = () => setDraggedSchedule(null);
  
  // 네비게이션 함수들
  const goToPreviousWeek = () => setCurrentWeek(addWeeks(currentWeek, -1));
  const goToNextWeek = () => setCurrentWeek(addWeeks(currentWeek, 1));
  const goToCurrentWeek = () => setCurrentWeek(new Date());

  const getWeekNumber = (date: Date) => {
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const firstWeekStart = startOfWeek(firstDayOfMonth, { weekStartsOn: 1 });
    const weekStartDate = startOfWeek(date, { weekStartsOn: 1 });
    return Math.ceil(((weekStartDate.getTime() - firstWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
  };

  if (loading) return <div style={styles.loading}>데이터 로딩 중...</div>;

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <div style={{ marginLeft: '250px', width: 'calc(100% - 250px)', padding: '2rem' }}>
        <div style={styles.container}>
          <div style={styles.header}>
            <h1 style={styles.title}>주간 스케줄</h1>
            <div style={styles.weekControls}>
              <button onClick={goToPreviousWeek} style={styles.navButton}>←</button>
              <button onClick={goToCurrentWeek} style={styles.currentButton}>오늘</button>
              <button onClick={goToNextWeek} style={styles.navButton}>→</button>
            </div>
          </div>

          <div style={styles.weekInfo}>
            <div style={styles.weekLabel}>
              {currentWeek.getFullYear()}년 {currentWeek.getMonth() + 1}월 {getWeekNumber(currentWeek)}주차
            </div>
            <div style={styles.weekRange}>
              {format(weekStart, 'yyyy.MM.dd')} ~ {format(weekEnd, 'yyyy.MM.dd')}
            </div>
          </div>

          {/* 캘린더 메인 영역 */}
          <div style={styles.calendarContainer}>
            
            {/* 레이어 1: 배경 그리드 (요일 컬럼 & 드롭 타겟) */}
            <div style={styles.gridBackground}>
              {weekDays.map((day) => {
                const isToday = isSameDay(day, new Date());
                return (
                  <div
                    key={day.toISOString()}
                    style={{
                      ...styles.dayColumnBase,
                      ...(isToday ? styles.todayColumn : {}),
                    }}
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e, day)}
                  >
                    <div style={styles.dayHeader}>
                      <div style={styles.dayName}>
                        {format(day, 'E', { locale: ko })}
                      </div>
                      <div style={{...styles.dayDate, ...(isToday && styles.todayDateText)}}>
                        {format(day, 'd')}
                      </div>
                    </div>
                    {/* 최소 높이 확보 및 줄 그리기용 */}
                    <div style={{ flex: 1, minHeight: `${Math.max(500, (totalRows + 1) * (ROW_HEIGHT + ROW_MARGIN) + 50)}px` }} />
                  </div>
                );
              })}
            </div>

            {/* 레이어 2: 스케줄 바 (절대 위치) */}
            <div style={styles.scheduleLayer}>
              {layoutItems.map((schedule) => (
                <div
                  key={schedule.id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, schedule)}
                  onDragEnd={handleDragEnd}
                  title={`${schedule.taskName} (${format(schedule._originalStart, 'MM/dd')} ~ ${format(schedule._viewEnd, 'MM/dd')})`}
                  style={{
                    ...styles.scheduleBar,
                    ...styles[`status${schedule.status}` as keyof typeof styles],
                    // 위치 및 크기 계산 (Grid Spanning)
                    left: `calc(${(schedule._startDayIndex * 100) / 7}% + 4px)`,
                    width: `calc(${(schedule._duration * 100) / 7}% - 8px)`,
                    top: `${HEADER_HEIGHT + (schedule._rowIndex * (ROW_HEIGHT + ROW_MARGIN)) + 10}px`,
                    height: `${ROW_HEIGHT}px`,
                    opacity: draggedSchedule?.id === schedule.id ? 0.5 : 1,
                    zIndex: draggedSchedule?.id === schedule.id ? 100 : 10,
                  }}
                >
                  <div style={styles.barContent}>
                    <span style={styles.scheduleTaskId}>[{schedule.userName}]</span>
                    <span style={styles.scheduleTitle}>{schedule.taskName}</span>
                  </div>
                  <LevelTooltip level={schedule.level}>
                    <span 
                      data-level-badge
                      style={styles.scheduleLevelBadge}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        e.preventDefault();
                      }}
                    >
                      {schedule.level}
                    </span>
                  </LevelTooltip>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: { maxWidth: '1400px', margin: '0 auto' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' },
  title: { fontSize: '1.5rem', fontWeight: 'bold', color: '#333' },
  weekControls: { display: 'flex', gap: '0.5rem' },
  navButton: { padding: '0.5rem 1rem', background: 'white', border: '1px solid #ddd', borderRadius: '4px', cursor: 'pointer' },
  currentButton: { padding: '0.5rem 1rem', background: '#007bff', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer' },
  weekInfo: { textAlign: 'center', marginBottom: '1.5rem' },
  weekLabel: { fontSize: '1.25rem', fontWeight: 'bold', color: '#333' },
  weekRange: { color: '#666', fontSize: '0.9rem', marginTop: '0.25rem' },
  
  // 캘린더 스타일
  calendarContainer: {
    position: 'relative', // 겹침의 기준
    border: '1px solid #ddd',
    borderTop: 'none', // 헤더 디자인에 따라 조정
    backgroundColor: 'white',
    borderRadius: '8px',
    overflow: 'hidden',
  },
  gridBackground: {
    display: 'flex',
    width: '100%',
  },
  dayColumnBase: {
    flex: 1,
    borderRight: '1px solid #eee',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
  },
  todayColumn: {
    backgroundColor: '#f8faff',
  },
  dayHeader: {
    height: '40px', // HEADER_HEIGHT와 일치
    padding: '8px 0',
    textAlign: 'center',
    borderBottom: '1px solid #eee',
    borderTop: '1px solid #ddd',
    backgroundColor: '#f8f9fa',
  },
  dayName: { fontSize: '0.85rem', color: '#666', marginBottom: '2px' },
  dayDate: { fontSize: '1rem', fontWeight: 'bold', color: '#333' },
  todayDateText: { color: '#007bff' },
  
  // 스케줄 레이어
  scheduleLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    pointerEvents: 'none', // 빈 공간 클릭 시 배경으로 이벤트 전달
  },
  scheduleBar: {
    position: 'absolute',
    borderRadius: '6px',
    padding: '0 8px',
    boxSizing: 'border-box',
    boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    cursor: 'grab',
    pointerEvents: 'auto', // 스케줄은 클릭 가능
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    transition: 'top 0.3s ease, left 0.3s ease, width 0.3s ease',
    border: '1px solid rgba(0,0,0,0.05)',
  },
  barContent: {
    display: 'flex',
    alignItems: 'center',
    overflow: 'hidden',
  },
  scheduleTaskId: {
    fontSize: '0.7rem',
    marginRight: '6px',
    opacity: 0.7,
    fontWeight: 'bold',
  },
  scheduleTitle: {
    fontSize: '0.85rem',
    fontWeight: '600',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  scheduleLevelBadge: {
    fontSize: '0.7rem',
    backgroundColor: 'rgba(255,255,255,0.5)',
    padding: '1px 4px',
    borderRadius: '3px',
    marginLeft: '4px',
  },
  
  // 상태별 색상
  status진행중: { backgroundColor: '#fff8e1', borderLeft: '4px solid #ffc107', color: '#856404' },
  status완료: { backgroundColor: '#e8f5e9', borderLeft: '4px solid #28a745', color: '#155724' },
  status연기: { backgroundColor: '#ffebee', borderLeft: '4px solid #dc3545', color: '#721c24' },
  status대기: { backgroundColor: '#e3f2fd', borderLeft: '4px solid #007bff', color: '#004085' },
  
  loading: { textAlign: 'center', padding: '3rem', color: '#666' },
};

export default WeeklySchedule;