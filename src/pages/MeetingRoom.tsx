import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, getDocs, query, where, addDoc, updateDoc, deleteDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Schedule } from '../types';
import { useAuth } from '../context/AuthContext';
import { useUsers } from '../context/UsersContext';
import Sidebar from '../components/Sidebar';
import MeetingReservationModal from '../components/MeetingReservationModal';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { format } from 'date-fns';

type CalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor?: string;
  borderColor?: string;
  extendedProps: {
    schedule: Schedule;
  };
};

const MeetingRoom: React.FC = () => {
  const { userData, currentUser } = useAuth();
  const { users } = useUsers();
  const [meetings, setMeetings] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'room' | 'external'>('all');
  
  // 모달 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedStart, setSelectedStart] = useState<Date>(new Date());
  const [selectedEnd, setSelectedEnd] = useState<Date>(new Date());
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  const fetchMeetings = useCallback(async () => {
    try {
      setLoading(true);
      const q = query(
        collection(db, 'schedules'),
        where('level', '==', '미팅')
      );
      const snapshot = await getDocs(q);
      const list: Schedule[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Schedule);
      });
      setMeetings(list);
    } catch (error) {
      console.error('미팅 목록 조회 실패:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  // 필터링된 미팅 목록
  const filteredMeetings = useMemo(() => {
    if (filter === 'all') return meetings;
    if (filter === 'room') return meetings.filter((m) => m.location === '회의실');
    if (filter === 'external') return meetings.filter((m) => m.location === '외부');
    return meetings;
  }, [meetings, filter]);

  // 사용자 이름 매핑
  const usersMap = useMemo(() => {
    const map: { [key: string]: string } = {};
    users.forEach((u) => {
      map[u.uid] = u.name;
    });
    return map;
  }, [users]);

  // FullCalendar 이벤트 변환
  const events = useMemo<CalendarEvent[]>(() => {
    return filteredMeetings
      .filter((meeting) => meeting.startDate && meeting.startTime && meeting.endTime)
      .map((meeting) => {
        const dateStr = meeting.startDate!.split('T')[0];
        const startDateTime = `${dateStr}T${meeting.startTime}:00`;
        const endDateTime = `${dateStr}T${meeting.endTime}:00`;

        const isRoom = meeting.location === '회의실';
        const userName = usersMap[meeting.userId] || meeting.userName || '';

        return {
          id: meeting.id,
          title: `${userName ? `[${userName}] ` : ''}${meeting.taskName}`,
          start: startDateTime,
          end: endDateTime,
          backgroundColor: isRoom ? '#3498db' : '#27ae60',
          borderColor: isRoom ? '#2980b9' : '#219a52',
          extendedProps: {
            schedule: meeting,
          },
        };
      });
  }, [filteredMeetings, usersMap]);

  // 드래그로 시간 선택
  const handleSelect = (selectInfo: any) => {
    setSelectedStart(selectInfo.start);
    setSelectedEnd(selectInfo.end);
    setEditingSchedule(null);
    setModalOpen(true);
    // 선택 해제
    selectInfo.view.calendar.unselect();
  };

  // 빈 셀 클릭으로 예약 (드래그 대안)
  const handleDateClick = (clickInfo: any) => {
    const clickedDate = clickInfo.date;
    // 30분 후를 종료 시간으로 설정
    const endDate = new Date(clickedDate.getTime() + 30 * 60 * 1000);
    setSelectedStart(clickedDate);
    setSelectedEnd(endDate);
    setEditingSchedule(null);
    setModalOpen(true);
  };

  // 이벤트 클릭 (수정/삭제)
  const handleEventClick = (clickInfo: any) => {
    const schedule = clickInfo.event.extendedProps.schedule as Schedule;
    
    // 본인 또는 관리자만 수정 가능
    if (schedule.userId !== currentUser?.uid && userData?.role !== 'admin') {
      alert('본인이 등록한 회의만 수정할 수 있습니다.');
      return;
    }

    const dateStr = schedule.startDate!.split('T')[0];
    setSelectedStart(new Date(`${dateStr}T${schedule.startTime}:00`));
    setSelectedEnd(new Date(`${dateStr}T${schedule.endTime}:00`));
    setEditingSchedule(schedule);
    setModalOpen(true);
  };

  // 저장 (생성/수정)
  const handleSave = async (data: {
    taskName: string;
    location: '회의실' | '외부';
    description: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
  }) => {
    if (!userData || !currentUser) throw new Error('로그인이 필요합니다.');

    const isoDate = `${data.startDate}T00:00:00.000Z`;

    if (editingSchedule) {
      // 수정
      await updateDoc(doc(db, 'schedules', editingSchedule.id), {
        taskName: data.taskName,
        location: data.location,
        description: data.description,
        startDate: isoDate,
        endDate: isoDate,
        startTime: data.startTime,
        endTime: data.endTime,
        updatedAt: new Date().toISOString(),
      });
    } else {
      // 생성
      const currentYear = new Date().getFullYear();
      const prefix = `meeting-${currentYear}-`;

      // 미팅 ID 생성
      const existingMeetings = meetings.filter((m) => m.taskId?.startsWith(prefix));
      let maxNumber = 0;
      existingMeetings.forEach((m) => {
        const num = parseInt(m.taskId?.replace(prefix, '') || '0', 10);
        if (num > maxNumber) maxNumber = num;
      });

      await addDoc(collection(db, 'schedules'), {
        taskId: `${prefix}${maxNumber + 1}`,
        taskName: data.taskName,
        level: '미팅',
        location: data.location,
        description: data.description,
        status: '진행중',
        startDate: isoDate,
        endDate: isoDate,
        startTime: data.startTime,
        endTime: data.endTime,
        isPublic: true,
        userId: currentUser.uid,
        userName: userData.name,
        createdAt: new Date().toISOString(),
      });
    }

    fetchMeetings();
  };

  // 삭제
  const handleDelete = async () => {
    if (!editingSchedule) return;
    
    if (!window.confirm('이 회의를 삭제하시겠습니까?')) return;

    try {
      await deleteDoc(doc(db, 'schedules', editingSchedule.id));
      setModalOpen(false);
      setEditingSchedule(null);
      fetchMeetings();
    } catch (error) {
      console.error('삭제 실패:', error);
      alert('삭제에 실패했습니다.');
    }
  };

  if (loading && meetings.length === 0) {
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
        <div style={styles.header}>
          <h1 style={styles.title}>회의실 예약</h1>
          <div style={styles.filterContainer}>
            <button
              style={{
                ...styles.filterButton,
                ...(filter === 'all' ? styles.filterButtonActive : {}),
              }}
              onClick={() => setFilter('all')}
            >
              전체
            </button>
            <button
              style={{
                ...styles.filterButton,
                ...(filter === 'room' ? styles.filterButtonActiveBlue : {}),
              }}
              onClick={() => setFilter('room')}
            >
              🏢 회의실
            </button>
            <button
              style={{
                ...styles.filterButton,
                ...(filter === 'external' ? styles.filterButtonActiveGreen : {}),
              }}
              onClick={() => setFilter('external')}
            >
              ☕ 외부
            </button>
          </div>
        </div>

        <div style={styles.legend}>
          <span style={styles.legendItem}>
            <span style={{ ...styles.legendDot, backgroundColor: '#3498db' }} />
            회의실
          </span>
          <span style={styles.legendItem}>
            <span style={{ ...styles.legendDot, backgroundColor: '#27ae60' }} />
            외부 (카페 등)
          </span>
          <span style={styles.legendTip}>
            💡 시간을 클릭하거나 드래그하면 예약할 수 있습니다
          </span>
        </div>

        <div style={styles.calendarContainer}>
          <FullCalendar
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView="timeGridWeek"
            locale="ko"
            headerToolbar={{
              left: 'prev,next today',
              center: 'title',
              right: 'timeGridWeek,timeGridDay',
            }}
            events={events}
            // 드래그 선택 설정
            selectable={true}
            selectMirror={true}
            select={handleSelect}
            selectOverlap={true}
            unselectAuto={true}
            selectMinDistance={5}
            // 클릭으로도 예약 가능
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            slotDuration="00:30:00"
            slotMinTime="08:00:00"
            slotMaxTime="20:00:00"
            allDaySlot={false}
            weekends={true}
            nowIndicator={true}
            height="auto"
            slotLabelFormat={{
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }}
            eventTimeFormat={{
              hour: '2-digit',
              minute: '2-digit',
              hour12: false,
            }}
            dayHeaderFormat={{
              weekday: 'short',
              month: 'numeric',
              day: 'numeric',
            }}
            businessHours={{
              daysOfWeek: [1, 2, 3, 4, 5],
              startTime: '09:00',
              endTime: '18:00',
            }}
            eventDidMount={(arg) => {
              const schedule = arg.event.extendedProps?.schedule as Schedule | undefined;
              if (schedule) {
                const locationText = schedule.location === '회의실' ? '회의실' : '외부';
                arg.el.setAttribute(
                  'title',
                  `${schedule.taskName}\n장소: ${locationText}\n${schedule.description || ''}`
                );
              }
            }}
          />
        </div>

        {/* 예약 모달 */}
        <MeetingReservationModal
          isOpen={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditingSchedule(null);
          }}
          onSave={handleSave}
          startDate={selectedStart}
          endDate={selectedEnd}
          existingMeetings={meetings}
          editingSchedule={editingSchedule}
        />

        {/* 수정 모드에서 삭제 버튼 */}
        {modalOpen && editingSchedule && (
          <div style={styles.deleteOverlay}>
            <button style={styles.deleteButton} onClick={handleDelete}>
              🗑️ 이 회의 삭제
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
  },
  title: {
    margin: 0,
    color: '#333',
  },
  filterContainer: {
    display: 'flex',
    gap: '0.5rem',
  },
  filterButton: {
    padding: '0.5rem 1rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '0.9rem',
    fontWeight: '500',
    color: '#666',
    transition: 'all 0.2s',
  },
  filterButtonActive: {
    borderColor: '#333',
    backgroundColor: '#333',
    color: 'white',
  },
  filterButtonActiveBlue: {
    borderColor: '#3498db',
    backgroundColor: '#3498db',
    color: 'white',
  },
  filterButtonActiveGreen: {
    borderColor: '#27ae60',
    backgroundColor: '#27ae60',
    color: 'white',
  },
  legend: {
    display: 'flex',
    alignItems: 'center',
    gap: '1.5rem',
    marginBottom: '1rem',
    padding: '0.75rem 1rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    fontSize: '0.9rem',
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#555',
  },
  legendDot: {
    width: '12px',
    height: '12px',
    borderRadius: '3px',
  },
  legendTip: {
    marginLeft: 'auto',
    color: '#888',
    fontSize: '0.85rem',
  },
  calendarContainer: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '1rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  deleteOverlay: {
    position: 'fixed',
    bottom: '2rem',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 1001,
  },
  deleteButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#e74c3c',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: '600',
    boxShadow: '0 4px 12px rgba(231, 76, 60, 0.3)',
  },
};

export default MeetingRoom;
