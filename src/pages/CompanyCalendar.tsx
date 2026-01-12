import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, query, orderBy, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Schedule, User } from '../types';
import { format, parseISO } from 'date-fns';
import Sidebar from '../components/Sidebar';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end?: string;
  extendedProps: {
    schedule: Schedule;
  };
  backgroundColor?: string;
  borderColor?: string;
};

const CompanyCalendar: React.FC = () => {
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string>('전체');
  const [usersMap, setUsersMap] = useState<{ [key: string]: User }>({});

  useEffect(() => {
    fetchUsers();
    fetchSchedules();
  }, [selectedUser]);

  const fetchUsers = async () => {
    try {
      const usersSnapshot = await getDocs(collection(db, 'users'));
      const users: { [key: string]: User } = {};
      usersSnapshot.forEach((docSnapshot) => {
        const userData = { id: docSnapshot.id, ...docSnapshot.data() } as User;
        users[userData.uid] = userData;
      });
      setUsersMap(users);
    } catch (error) {
      console.error('사용자 정보 가져오기 실패:', error);
    }
  };

  const fetchSchedules = async () => {
    try {
      setLoading(true);
      let q = query(collection(db, 'schedules'));

      // 특정 사용자 필터링
      if (selectedUser !== '전체') {
        q = query(
          collection(db, 'schedules'),
          where('userId', '==', selectedUser)
        );
      }

      const querySnapshot = await getDocs(q);
      const schedulesList: Schedule[] = [];
      querySnapshot.forEach((docSnapshot) => {
        schedulesList.push({ id: docSnapshot.id, ...docSnapshot.data() } as Schedule);
      });

      // isPublic이 true인 스케줄만 필터링
      const publicSchedules = schedulesList.filter(schedule => schedule.isPublic === true);
      setSchedules(publicSchedules);
    } catch (error) {
      console.error('스케줄 가져오기 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  // Schedule을 FullCalendar Event로 변환
  const events = useMemo<CalendarEvent[]>(() => {
    return schedules
      .filter(schedule => {
        const startDate = schedule.startDate || schedule.deadline;
        return !!startDate;
      })
      .map((schedule): CalendarEvent => {
        const startDate = schedule.startDate || schedule.deadline;
        const endDate = schedule.endDate || schedule.deadline;
        
        // 날짜 문자열로 비교 (시간 제거)
        const startDateStr = startDate ? new Date(startDate).toISOString().split('T')[0] : undefined;
        const endDateStr = endDate ? new Date(endDate).toISOString().split('T')[0] : undefined;
        
        // 단일 날짜 스케줄인 경우 end를 설정하지 않음 (FullCalendar가 자동으로 1일로 표시)
        // 다중 날짜 스케줄인 경우에만 end를 설정 (exclusive이므로 +1일)
        let endDatePlusOne: Date | undefined;
        if (startDateStr && endDateStr && startDateStr !== endDateStr) {
          // 시작일과 종료일이 다른 경우에만 end 설정
          endDatePlusOne = new Date(endDateStr);
          endDatePlusOne.setDate(endDatePlusOne.getDate() + 1);
        }

        // 상태별 색상
        const statusColors: { [key: string]: { bg: string; border: string } } = {
          '진행중': { bg: '#ffc107', border: '#ffc107' },
          '완료': { bg: '#28a745', border: '#28a745' },
          '연기': { bg: '#dc3545', border: '#dc3545' },
          '대기중': { bg: '#6c757d', border: '#6c757d' },
        };

        const colors = statusColors[schedule.status] || statusColors['대기중'];

        const userName = usersMap[schedule.userId]?.name || schedule.userName;

        return {
          id: schedule.id,
          title: `[${userName}] ${schedule.taskName}`,
          start: startDate!,
          // 단일 날짜 스케줄인 경우 end를 설정하지 않음
          end: endDatePlusOne?.toISOString(),
          extendedProps: {
            schedule,
          },
          backgroundColor: colors.bg,
          borderColor: colors.border,
        };
      });
  }, [schedules]);

  const getSchedulesForDay = (day: Date) => {
    const dayStr = format(day, 'yyyy-MM-dd');
    return schedules.filter((schedule) => {
      const startDate = schedule.startDate ? parseISO(schedule.startDate) : schedule.deadline ? parseISO(schedule.deadline) : null;
      const endDate = schedule.endDate ? parseISO(schedule.endDate) : schedule.deadline ? parseISO(schedule.deadline) : null;
      
      if (!startDate || !endDate) return false;
      
      const startStr = format(startDate, 'yyyy-MM-dd');
      const endStr = format(endDate, 'yyyy-MM-dd');
      
      return dayStr >= startStr && dayStr <= endStr;
    });
  };

  // 모든 사용자 목록 가져오기
  const getAllUsers = () => {
    const users = new Set<string>();
    schedules.forEach((schedule) => {
      users.add(schedule.userId);
    });
    return Array.from(users);
  };

  const getUserName = (userId: string) => {
    const user = usersMap[userId];
    if (!user) return userId;
    return `${user.name}/${user.username}${user.team ? ` [${user.team}]` : ''}`;
  };

  const handleDateClick = (arg: any) => {
    setSelectedDate(arg.date);
  };

  const handleEventClick = (arg: any) => {
    const schedule = arg.event.extendedProps.schedule;
    const startDate = schedule.startDate ? parseISO(schedule.startDate) : schedule.deadline ? parseISO(schedule.deadline) : null;
    if (startDate) {
      setSelectedDate(startDate);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex' }}>
        <Sidebar />
        <div style={{ marginLeft: '250px', width: 'calc(100% - 250px)', padding: '2rem' }}>
          <div>로딩 중...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <div style={{ marginLeft: '250px', width: 'calc(100% - 250px)', padding: '2rem' }}>
        <div style={{ marginBottom: '2rem' }}>
          <h1 style={{ marginBottom: '1rem' }}>전사 스케줄 열람</h1>
          
          <div style={{ marginBottom: '1rem' }}>
            <label style={{ marginRight: '0.5rem' }}>사용자 필터:</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              style={{
                padding: '0.5rem 1rem',
                border: '1px solid #ddd',
                borderRadius: '4px',
                fontSize: '0.9rem',
              }}
            >
              <option value="전체">전체</option>
              {getAllUsers().map((userId) => (
                <option key={userId} value={userId}>
                  {getUserName(userId)}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ backgroundColor: 'white', padding: '1rem', borderRadius: '8px' }}>
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            events={events}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            headerToolbar={{
              left: 'prevYear,prev,next,nextYear today',
              center: 'title',
              right: 'dayGridMonth,dayGridWeek,dayGridDay',
            }}
            locale="ko"
            height="auto"
            dayMaxEvents={5}
            moreLinkClick="popover"
            navLinks={true}
            editable={false}
            eventDisplay="block"
            displayEventTime={false}
          />
        </div>

        {selectedDate && (
          <div style={{ marginTop: '2rem', backgroundColor: 'white', border: '1px solid #ddd', borderRadius: '8px', padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>
              {format(selectedDate, 'yyyy년 MM월 dd일')} 업무
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {getSchedulesForDay(selectedDate).length === 0 ? (
                <div style={{ textAlign: 'center', color: '#666', padding: '2rem' }}>
                  해당 날짜에 등록된 업무가 없습니다.
                </div>
              ) : (
                getSchedulesForDay(selectedDate).map((schedule) => (
                  <div key={schedule.id} style={{ padding: '1rem', border: '1px solid #eee', borderRadius: '4px', backgroundColor: '#f8f9fa' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.75rem', color: '#666' }}>[{usersMap[schedule.userId]?.name || schedule.userName}]</span>
                      <span style={{ fontWeight: '600' }}>{schedule.taskName}</span>
                      <span style={{
                        padding: '0.125rem 0.375rem',
                        backgroundColor: '#e3f2fd',
                        color: '#1976d2',
                        borderRadius: '3px',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                      }}>
                        {schedule.level}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                      <span style={{ fontSize: '0.875rem', color: '#666' }}>
                        {usersMap[schedule.userId]?.name || schedule.userName}
                        {usersMap[schedule.userId]?.username && `/${usersMap[schedule.userId].username}`}
                        {usersMap[schedule.userId]?.team && ` [${usersMap[schedule.userId].team}]`}
                      </span>
                      <span style={{
                        padding: '0.125rem 0.375rem',
                        borderRadius: '3px',
                        fontSize: '0.75rem',
                        fontWeight: '500',
                        backgroundColor: schedule.status === '진행중' ? '#fff3cd' : schedule.status === '완료' ? '#d4edda' : schedule.status === '연기' ? '#f8d7da' : '#e2e3e5',
                        color: schedule.status === '진행중' ? '#856404' : schedule.status === '완료' ? '#155724' : schedule.status === '연기' ? '#721c24' : '#383d41',
                      }}>
                        {schedule.status}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#555' }}>{schedule.description}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CompanyCalendar;
