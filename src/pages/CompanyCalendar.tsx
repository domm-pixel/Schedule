import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Schedule, User, LEVEL_DESCRIPTIONS, Vacation } from '../types';
import { format, parseISO } from 'date-fns';
import Sidebar from '../components/Sidebar';
import ScheduleDetailModal from '../components/ScheduleDetailModal';
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
  const [selectedScheduleId, setSelectedScheduleId] = useState<string | null>(null); // 선택된 특정 스케줄 ID
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<string>('전체');
  const [usersMap, setUsersMap] = useState<{ [key: string]: User }>({});

  const fetchUsers = useCallback(async () => {
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
  }, []);

  const fetchSchedules = useCallback(async () => {
    try {
      setLoading(true);
      // 1) 스케줄(업무) 조회
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
        const data = { id: docSnapshot.id, ...docSnapshot.data() } as Schedule;
        // comments 필드가 없을 경우 빈 배열로 초기화
        if (!data.comments) {
          data.comments = [];
        }
        schedulesList.push(data);
      });

      // isPublic이 true인 스케줄만 필터링
      const publicSchedules = schedulesList.filter(schedule => schedule.isPublic === true);

      // 2) 휴가(vacations) 조회
      let vQuery: any = collection(db, 'vacations');
      if (selectedUser !== '전체') {
        vQuery = query(vQuery, where('userId', '==', selectedUser));
      }
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

      // 휴가를 스케줄 형태로 매핑해서 전사 캘린더에 함께 표시
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
          isPublic: true,
          note: undefined,
          userId: v.userId,
          userName: '', // 실제 표시는 usersMap을 통해 이름을 가져옴
          createdAt,
          updatedAt: undefined,
          history: [],
          comments: [],
        } as Schedule;
      });

      // 3) 업무 + 휴가 합쳐서 상태에 저장
      setSchedules([...publicSchedules, ...vacationSchedules]);
    } catch (error) {
      console.error('스케줄 가져오기 실패:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedUser]);

  useEffect(() => {
    fetchUsers();
    fetchSchedules();
  }, [fetchUsers, fetchSchedules]);

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
        // 다중 날짜 스케줄인 경우: FullCalendar의 end는 exclusive이므로 endDate까지 표시하려면 endDate + 1일이 필요
        // 하지만 현재 endDate + 1일을 하면 하루 더 그려지므로, endDate의 날짜만 사용하고 시간을 23:59:59로 설정
        // 이렇게 하면 endDate까지만 표시됨
        let endDateForCalendar: string | undefined;
        if (startDateStr && endDateStr && startDateStr !== endDateStr) {
          // 시작일과 종료일이 다른 경우
          // endDate의 날짜에 23:59:59를 설정하여 해당 날짜의 끝까지 표시
          const endDateObj = new Date(endDateStr);
          endDateObj.setHours(23, 59, 59, 999);
          endDateForCalendar = endDateObj.toISOString();
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
          // 다중 날짜 스케줄인 경우 endDate까지만 표시 (endDate + 1일이 아닌 endDate의 끝 시간 사용)
          end: endDateForCalendar,
          extendedProps: {
            schedule,
          },
          backgroundColor: colors.bg,
          borderColor: colors.border,
        };
      });
  }, [schedules, usersMap]);

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

  // 모든 사용자 목록 가져오기 (usersMap에서 가져와서 항상 모든 사용자 표시)
  const getAllUsers = () => {
    return Object.keys(usersMap);
  };

  const getUserName = (userId: string) => {
    const user = usersMap[userId];
    if (!user) return userId;
    return `${user.name}/${user.username}${user.team ? ` [${user.team}]` : ''}`;
  };

  const handleDateClick = (arg: any) => {
    // 날짜의 빈공간 클릭 시: 날짜만 설정하고 스케줄 ID는 null (전체 스케줄 표시)
    setSelectedDate(arg.date);
    setSelectedScheduleId(null);
  };

  const handleEventClick = (arg: any) => {
    // 특정 이벤트 클릭 시: 날짜와 스케줄 ID 모두 설정 (해당 스케줄만 표시)
    const schedule = arg.event.extendedProps.schedule;
    const startDate = schedule.startDate ? parseISO(schedule.startDate) : schedule.deadline ? parseISO(schedule.deadline) : null;
    if (startDate) {
      setSelectedDate(startDate);
      setSelectedScheduleId(schedule.id); // 특정 스케줄 ID 설정
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
            eventDidMount={(arg) => {
              // 각 이벤트에 레벨 설명을 툴팁으로 추가
              const schedule = arg.event.extendedProps.schedule;
              const level = schedule?.level;
              const description = level ? LEVEL_DESCRIPTIONS[level] : '';
              if (description) {
                arg.el.setAttribute('title', `${level}: ${description}`);
              }
            }}
          />
        </div>

        {selectedDate && (
          <ScheduleDetailModal
            date={selectedDate}
            schedules={
              selectedScheduleId
                ? getSchedulesForDay(selectedDate).filter(s => s.id === selectedScheduleId)
                : getSchedulesForDay(selectedDate)
            }
            usersMap={usersMap}
            onClose={() => {
              setSelectedDate(null);
              setSelectedScheduleId(null);
            }}
            onScheduleUpdate={fetchSchedules}
          />
        )}
      </div>
    </div>
  );
};

export default CompanyCalendar;
