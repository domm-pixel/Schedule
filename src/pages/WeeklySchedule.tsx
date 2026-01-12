import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, where, orderBy, doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Schedule, ScheduleHistory } from '../types';
import { useAuth } from '../context/AuthContext';
import { startOfWeek, endOfWeek, addWeeks, format, eachDayOfInterval, parseISO, isSameDay, startOfDay, endOfDay } from 'date-fns';
import Sidebar from '../components/Sidebar';

const WeeklySchedule: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [currentWeek, setCurrentWeek] = useState<Date>(new Date());
  const [loading, setLoading] = useState(true);
  const [draggedSchedule, setDraggedSchedule] = useState<Schedule | null>(null);
  const { userData } = useAuth();

  useEffect(() => {
    fetchSchedules();
  }, [currentWeek, userData]);

  const fetchSchedules = async () => {
    if (!userData) return;

    try {
      setLoading(true);
      const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 }); // 월요일 시작
      const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 }); // 일요일 종료

      // 모든 스케줄을 가져온 후 클라이언트에서 필터링 (인덱스 문제 회피)
      const q = query(
        collection(db, 'schedules'),
        where('userId', '==', userData.uid)
      );

      const querySnapshot = await getDocs(q);
      const schedulesList: Schedule[] = [];
      querySnapshot.forEach((docSnapshot) => {
        schedulesList.push({ id: docSnapshot.id, ...docSnapshot.data() } as Schedule);
      });

      // 날짜 기준으로 정렬 (startDate 우선, 없으면 deadline 사용)
      schedulesList.sort((a, b) => {
        const dateA = a.startDate ? parseISO(a.startDate).getTime() : a.deadline ? parseISO(a.deadline).getTime() : 0;
        const dateB = b.startDate ? parseISO(b.startDate).getTime() : b.deadline ? parseISO(b.deadline).getTime() : 0;
        return dateA - dateB;
      });

      // 현재 주의 스케줄만 필터링 (기간 스케줄 고려)
      const weekSchedules = schedulesList.filter((schedule) => {
        const startDate = schedule.startDate ? parseISO(schedule.startDate) : schedule.deadline ? parseISO(schedule.deadline) : null;
        const endDate = schedule.endDate ? parseISO(schedule.endDate) : schedule.deadline ? parseISO(schedule.deadline) : null;
        
        if (!startDate || !endDate) return false;
        
        // 스케줄 기간이 주간 범위와 겹치는지 확인
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
  };

  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekEnd = endOfWeek(currentWeek, { weekStartsOn: 1 });
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const getSchedulesForDay = (day: Date) => {
    return schedules.filter((schedule) => {
      const startDate = schedule.startDate ? parseISO(schedule.startDate) : schedule.deadline ? parseISO(schedule.deadline) : null;
      const endDate = schedule.endDate ? parseISO(schedule.endDate) : schedule.deadline ? parseISO(schedule.deadline) : null;
      
      if (!startDate || !endDate) return false;
      
      const dayStart = startOfDay(day);
      const dayEnd = endOfDay(day);
      const scheduleStart = startOfDay(startDate);
      const scheduleEnd = endOfDay(endDate);
      
      // 날짜가 스케줄 기간 내에 있는지 확인
      return scheduleStart <= dayEnd && scheduleEnd >= dayStart;
    });
  };

  const handleDragStart = (e: React.DragEvent, schedule: Schedule) => {
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
      
      // 기존 스케줄 데이터 가져오기
      const scheduleDoc = await getDoc(scheduleRef);
      if (!scheduleDoc.exists()) {
        throw new Error('스케줄을 찾을 수 없습니다.');
      }
      
      const currentSchedule = scheduleDoc.data() as Schedule;
      
      // 기존 시작일/종료일 가져오기 (없으면 deadline 사용)
      const oldStartDate = currentSchedule.startDate || currentSchedule.deadline || '';
      const oldEndDate = currentSchedule.endDate || currentSchedule.deadline || '';
      
      // 기간 길이 계산
      const startDateObj = oldStartDate ? parseISO(oldStartDate) : parseISO(oldEndDate);
      const endDateObj = oldEndDate ? parseISO(oldEndDate) : parseISO(oldStartDate);
      const durationDays = Math.round((endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24));
      
      // 새로운 시작일과 종료일 계산
      const newStartDate = newDate;
      const newEndDateObj = new Date(parseISO(newDate));
      newEndDateObj.setDate(newEndDateObj.getDate() + durationDays);
      const newEndDate = format(newEndDateObj, 'yyyy-MM-dd') + 'T00:00:00.000Z';
      
      // 날짜 형식화 함수
      const formatDateForDisplay = (dateString: string): string => {
        return new Date(dateString).toLocaleDateString('ko-KR');
      };
      
      // 변경 이력 생성
      let changeHistory: ScheduleHistory[] = [];
      const existingHistory = currentSchedule.history || [];
      const now = new Date();
      
      // 시작일이 변경된 경우
      if (oldStartDate !== newStartDate) {
        changeHistory.push({
          field: '시작일',
          oldValue: formatDateForDisplay(oldStartDate),
          newValue: formatDateForDisplay(newStartDate),
          changedBy: userData.name,
          changedAt: now as any,
        });
      }
      
      // 종료일이 변경된 경우
      if (oldEndDate !== newEndDate) {
        changeHistory.push({
          field: '종료일',
          oldValue: formatDateForDisplay(oldEndDate),
          newValue: formatDateForDisplay(newEndDate),
          changedBy: userData.name,
          changedAt: now as any,
        });
      }
      
      // 기존 이력과 합치기
      if (changeHistory.length > 0) {
        changeHistory = [...existingHistory, ...changeHistory];
      } else {
        changeHistory = existingHistory;
      }
      
      // 업데이트 데이터 준비
      const updateData: any = {
        startDate: newStartDate,
        endDate: newEndDate,
        deadline: newEndDate, // 하위 호환성을 위해
        updatedAt: serverTimestamp(),
      };
      
      // 변경 이력 추가
      updateData.history = changeHistory;
      
      await updateDoc(scheduleRef, updateData);

      // 로컬 상태 업데이트
      setSchedules(prevSchedules =>
        prevSchedules.map(schedule =>
          schedule.id === draggedSchedule.id
            ? { ...schedule, startDate: newStartDate, endDate: newEndDate, deadline: newEndDate, history: changeHistory }
            : schedule
        )
      );

      setDraggedSchedule(null);
    } catch (error) {
      console.error('스케줄 날짜 변경 실패:', error);
      alert('스케줄 날짜 변경에 실패했습니다.');
      setDraggedSchedule(null);
    }
  };

  const handleDragEnd = () => {
    setDraggedSchedule(null);
  };

  const goToPreviousWeek = () => {
    setCurrentWeek(addWeeks(currentWeek, -1));
  };

  const goToNextWeek = () => {
    setCurrentWeek(addWeeks(currentWeek, 1));
  };

  const goToCurrentWeek = () => {
    setCurrentWeek(new Date());
  };

  const getWeekNumber = (date: Date) => {
    const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
    const firstWeekStart = startOfWeek(firstDayOfMonth, { weekStartsOn: 1 });
    const weekStartDate = startOfWeek(date, { weekStartsOn: 1 });
    const weekNumber = Math.ceil(((weekStartDate.getTime() - firstWeekStart.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1);
    return weekNumber;
  };

  if (loading) {
    return <div style={styles.loading}>로딩 중...</div>;
  }

  const weekLabel = `${currentWeek.getFullYear()}년 ${currentWeek.getMonth() + 1}월 ${getWeekNumber(currentWeek)}주차`;

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <div style={{ marginLeft: '250px', width: 'calc(100% - 250px)', padding: '2rem' }}>
        <div style={styles.container}>
          <div style={styles.header}>
            <h1 style={styles.title}>주간 스케줄 관리</h1>
            <div style={styles.weekControls}>
          <button onClick={goToPreviousWeek} style={styles.navButton}>
            ← 이전 주
          </button>
          <button onClick={goToCurrentWeek} style={styles.currentButton}>
            오늘
          </button>
          <button onClick={goToNextWeek} style={styles.navButton}>
            다음 주 →
          </button>
            </div>
          </div>

          <div style={styles.weekLabel}>{weekLabel}</div>
          <div style={styles.weekRange}>
            {format(weekStart, 'yyyy년 MM월 dd일')} ~ {format(weekEnd, 'yyyy년 MM월 dd일')}
          </div>

          <div style={styles.calendar}>
        {weekDays.map((day) => {
          const daySchedules = getSchedulesForDay(day);
          const isToday = isSameDay(day, new Date());

          return (
            <div
              key={day.toISOString()}
              style={{
                ...styles.dayColumn,
                ...(isToday ? styles.todayColumn : {}),
              }}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, day)}
            >
              <div style={styles.dayHeader}>
                <div style={styles.dayName}>
                  {['일', '월', '화', '수', '목', '금', '토'][day.getDay()]}
                </div>
                <div style={{
                  ...styles.dayDate,
                  ...(isToday ? styles.todayDate : {}),
                }}>
                  {format(day, 'MM/dd')}
                </div>
              </div>
              <div style={styles.scheduleList}>
                {daySchedules.length === 0 ? (
                  <div style={styles.emptyDay}>업무 없음</div>
                ) : (
                  <>
                    {daySchedules.slice(0, 5).map((schedule) => (
                      <div
                        key={schedule.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, schedule)}
                        onDragEnd={handleDragEnd}
                        style={{
                          ...styles.scheduleItem,
                          ...styles[`status${schedule.status}` as keyof typeof styles],
                          ...(draggedSchedule?.id === schedule.id ? styles.dragging : {}),
                          cursor: 'move',
                        }}
                      >
                        <div style={styles.scheduleTaskId}>[{schedule.userName}]</div>
                        <div style={styles.scheduleTaskName}>{schedule.taskName}</div>
                        <div style={styles.scheduleMeta}>
                          <span style={styles.scheduleLevel}>{schedule.level}</span>
                          <span style={styles.scheduleStatus}>{schedule.status}</span>
                        </div>
                      </div>
                    ))}
                    {daySchedules.length > 5 && (
                      <div style={styles.moreSchedules}>
                        +{daySchedules.length - 5} more
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '1400px',
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
  weekControls: {
    display: 'flex',
    gap: '0.5rem',
  },
  navButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#f8f9fa',
    border: '1px solid #ddd',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  currentButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
  weekLabel: {
    fontSize: '1.5rem',
    fontWeight: '600',
    color: '#333',
    marginBottom: '0.5rem',
    textAlign: 'center',
  },
  weekRange: {
    textAlign: 'center',
    color: '#666',
    marginBottom: '2rem',
  },
  calendar: {
    display: 'grid',
    gridTemplateColumns: 'repeat(7, 1fr)',
    gap: '1rem',
  },
  dayColumn: {
    backgroundColor: 'white',
    border: '1px solid #ddd',
    borderRadius: '8px',
    minHeight: '500px',
    display: 'flex',
    flexDirection: 'column',
  },
  todayColumn: {
    border: '2px solid #007bff',
    backgroundColor: '#f0f8ff',
  },
  dayHeader: {
    padding: '1rem',
    borderBottom: '1px solid #eee',
    textAlign: 'center',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px 8px 0 0',
  },
  dayName: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#333',
    marginBottom: '0.25rem',
  },
  dayDate: {
    fontSize: '0.875rem',
    color: '#666',
  },
  todayDate: {
    color: '#007bff',
    fontWeight: '600',
  },
  scheduleList: {
    flex: 1,
    padding: '0.5rem',
    overflowY: 'auto',
  },
  emptyDay: {
    textAlign: 'center',
    color: '#999',
    padding: '2rem 0',
    fontSize: '0.875rem',
  },
  scheduleItem: {
    padding: '0.75rem',
    marginBottom: '0.5rem',
    borderRadius: '4px',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    cursor: 'move',
    userSelect: 'none',
    transition: 'opacity 0.2s, transform 0.2s',
  },
  dragging: {
    opacity: 0.5,
    transform: 'scale(0.95)',
  },
  scheduleTaskId: {
    fontSize: '0.75rem',
    color: '#666',
    marginBottom: '0.25rem',
  },
  scheduleTaskName: {
    fontSize: '0.9rem',
    fontWeight: '600',
    marginBottom: '0.5rem',
    color: '#333',
  },
  scheduleMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.75rem',
  },
  scheduleLevel: {
    padding: '0.125rem 0.375rem',
    backgroundColor: '#e3f2fd',
    color: '#1976d2',
    borderRadius: '3px',
    fontWeight: '600',
  },
  scheduleStatus: {
    padding: '0.125rem 0.375rem',
    borderRadius: '3px',
    fontWeight: '500',
  },
  status진행중: {
    backgroundColor: '#fff3cd',
    borderColor: '#ffc107',
  },
  status완료: {
    backgroundColor: '#d4edda',
    borderColor: '#28a745',
  },
  status연기: {
    backgroundColor: '#f8d7da',
    borderColor: '#dc3545',
  },
  moreSchedules: {
    padding: '0.5rem',
    textAlign: 'center',
    fontSize: '0.75rem',
    color: '#007bff',
    fontWeight: '600',
    cursor: 'pointer',
    backgroundColor: '#f8f9fa',
    borderRadius: '4px',
    marginTop: '0.25rem',
  },
  loading: {
    textAlign: 'center',
    padding: '3rem',
  },
};

export default WeeklySchedule;
