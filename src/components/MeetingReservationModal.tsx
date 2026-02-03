import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import { Schedule } from '../types';
import DatePicker from 'react-datepicker';
import 'react-datepicker/dist/react-datepicker.css';

interface MeetingReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: {
    taskName: string;
    location: '회의실' | '외부';
    description: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
  }) => Promise<void>;
  startDate: Date;
  endDate: Date;
  existingMeetings: Schedule[];
  editingSchedule?: Schedule | null;
}

const MeetingReservationModal: React.FC<MeetingReservationModalProps> = ({
  isOpen,
  onClose,
  onSave,
  startDate,
  endDate,
  existingMeetings,
  editingSchedule,
}) => {
  const [taskName, setTaskName] = useState('');
  const [location, setLocation] = useState<'회의실' | '외부'>('회의실');
  const [description, setDescription] = useState('');
  const [loading, setSaving] = useState(false);
  const [error, setError] = useState('');

  // 시작/종료 시간 상태
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');

  useEffect(() => {
    if (isOpen) {
      // 드래그로 선택된 시간 설정
      setStartTime(format(startDate, 'HH:mm'));
      setEndTime(format(endDate, 'HH:mm'));
      
      // 수정 모드인 경우 기존 데이터 로드
      if (editingSchedule) {
        setTaskName(editingSchedule.taskName || '');
        setLocation((editingSchedule.location as '회의실' | '외부') || '회의실');
        setDescription(editingSchedule.description || '');
      } else {
        setTaskName('');
        setLocation('회의실');
        setDescription('');
      }
      setError('');
    }
  }, [isOpen, startDate, endDate, editingSchedule]);

  const getConflictingMeeting = (): Schedule | null => {
    if (location !== '회의실') return null;
    
    const selectedDateStr = format(startDate, 'yyyy-MM-dd');
    const selectedStartTime = startTime;
    const selectedEndTime = endTime;

    const conflict = existingMeetings.find((meeting) => {
      // 수정 중인 스케줄은 제외
      if (editingSchedule && meeting.id === editingSchedule.id) return false;
      
      // 회의실 예약만 체크
      if (meeting.location !== '회의실') return false;

      // 같은 날짜인지 확인
      const meetingDateStr = meeting.startDate ? format(new Date(meeting.startDate), 'yyyy-MM-dd') : '';
      if (meetingDateStr !== selectedDateStr) return false;

      // 시간 충돌 체크
      const meetingStart = meeting.startTime || '00:00';
      const meetingEnd = meeting.endTime || '23:59';

      // 시간이 겹치는지 확인
      return (
        (selectedStartTime >= meetingStart && selectedStartTime < meetingEnd) ||
        (selectedEndTime > meetingStart && selectedEndTime <= meetingEnd) ||
        (selectedStartTime <= meetingStart && selectedEndTime >= meetingEnd)
      );
    });

    return conflict || null;
  };

  const handleSave = async () => {
    if (!taskName.trim()) {
      setError('회의명을 입력해주세요.');
      return;
    }

    // 회의실 충돌 체크 - alert으로 표시
    const conflictingMeeting = getConflictingMeeting();
    if (conflictingMeeting) {
      alert(
        `해당 시간에 이미 회의실 예약이 있습니다!\n\n` +
        `기존 예약: ${conflictingMeeting.taskName}\n` +
        `시간: ${conflictingMeeting.startTime} ~ ${conflictingMeeting.endTime}\n` +
        `예약자: ${conflictingMeeting.userName || '알 수 없음'}`
      );
      return;
    }

    setSaving(true);
    setError('');

    try {
      await onSave({
        taskName: taskName.trim(),
        location,
        description: description.trim(),
        startDate: format(startDate, 'yyyy-MM-dd'),
        endDate: format(startDate, 'yyyy-MM-dd'), // 같은 날
        startTime,
        endTime,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || '저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>
            {editingSchedule ? '회의 수정' : '회의 예약'}
          </h2>
          <button style={styles.closeButton} onClick={onClose}>
            ×
          </button>
        </div>

        <div style={styles.body}>
          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.dateInfo}>
            <span style={styles.dateIcon}>📅</span>
            <span>
              {format(startDate, 'M월 d일 (EEEE)', { locale: ko })}
            </span>
            <span style={styles.timeRange}>
              {startTime} - {endTime}
            </span>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>회의명 *</label>
            <input
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              placeholder="회의명을 입력하세요"
              style={styles.input}
              autoFocus
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>장소 *</label>
            <div style={styles.locationButtons}>
              <button
                type="button"
                style={{
                  ...styles.locationButton,
                  ...(location === '회의실' ? styles.locationButtonActive : {}),
                }}
                onClick={() => setLocation('회의실')}
              >
                🏢 회의실
              </button>
              <button
                type="button"
                style={{
                  ...styles.locationButton,
                  ...(location === '외부' ? styles.locationButtonActiveGreen : {}),
                }}
                onClick={() => setLocation('외부')}
              >
                ☕ 외부 (카페 등)
              </button>
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>시간</label>
            <div style={styles.timeInputs}>
              <DatePicker
                selected={startTime ? (() => {
                  const [hours, minutes] = startTime.split(':').map(Number);
                  const date = new Date(startDate);
                  date.setHours(hours || 9, minutes || 0, 0, 0);
                  return date;
                })() : null}
                onChange={(date: Date | null) => {
                  if (date) {
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    setStartTime(`${hours}:${minutes}`);
                  }
                }}
                showTimeSelect
                showTimeSelectOnly
                timeIntervals={30}
                timeCaption="시작"
                dateFormat="HH:mm"
                locale={ko}
                placeholderText="시작 시간"
                className="time-picker-input"
              />
              <span style={styles.timeSeparator}>~</span>
              <DatePicker
                selected={endTime ? (() => {
                  const [hours, minutes] = endTime.split(':').map(Number);
                  const date = new Date(startDate);
                  date.setHours(hours || 18, minutes || 0, 0, 0);
                  return date;
                })() : null}
                onChange={(date: Date | null) => {
                  if (date) {
                    const hours = String(date.getHours()).padStart(2, '0');
                    const minutes = String(date.getMinutes()).padStart(2, '0');
                    setEndTime(`${hours}:${minutes}`);
                  }
                }}
                showTimeSelect
                showTimeSelectOnly
                timeIntervals={30}
                timeCaption="종료"
                dateFormat="HH:mm"
                locale={ko}
                placeholderText="종료 시간"
                className="time-picker-input"
              />
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>메모 (선택)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="참석자, 회의 내용 등"
              style={styles.textarea}
              rows={3}
            />
          </div>
        </div>

        <div style={styles.footer}>
          <button style={styles.cancelButton} onClick={onClose} disabled={loading}>
            취소
          </button>
          <button style={styles.saveButton} onClick={handleSave} disabled={loading}>
            {loading ? '저장 중...' : editingSchedule ? '수정' : '예약'}
          </button>
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
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
  modal: {
    backgroundColor: 'white',
    borderRadius: '12px',
    width: '100%',
    maxWidth: '480px',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.25rem 1.5rem',
    borderBottom: '1px solid #eee',
  },
  title: {
    margin: 0,
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '1.5rem',
    color: '#999',
    cursor: 'pointer',
    padding: '0.25rem',
    lineHeight: 1,
  },
  body: {
    padding: '1.5rem',
  },
  error: {
    backgroundColor: '#f8d7da',
    color: '#721c24',
    padding: '0.75rem 1rem',
    borderRadius: '6px',
    marginBottom: '1rem',
    fontSize: '0.9rem',
  },
  dateInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '1rem',
    backgroundColor: '#f8f9fa',
    borderRadius: '8px',
    marginBottom: '1.5rem',
    fontSize: '1rem',
    fontWeight: '500',
  },
  dateIcon: {
    fontSize: '1.25rem',
  },
  timeRange: {
    marginLeft: 'auto',
    color: '#3498db',
    fontWeight: '600',
  },
  formGroup: {
    marginBottom: '1.25rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontSize: '0.9rem',
    fontWeight: '600',
    color: '#495057',
  },
  input: {
    width: '100%',
    padding: '0.75rem 1rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '1rem',
    boxSizing: 'border-box',
    transition: 'border-color 0.2s',
  },
  locationButtons: {
    display: 'flex',
    gap: '0.75rem',
  },
  locationButton: {
    flex: 1,
    padding: '0.875rem 1rem',
    border: '2px solid #ddd',
    borderRadius: '8px',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: '500',
    transition: 'all 0.2s',
    color: '#666',
  },
  locationButtonActive: {
    borderColor: '#3498db',
    backgroundColor: '#ebf5ff',
    color: '#3498db',
  },
  locationButtonActiveGreen: {
    borderColor: '#27ae60',
    backgroundColor: '#e8f8f0',
    color: '#27ae60',
  },
  timeInputs: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  timeInput: {
    flex: 1,
    padding: '0.75rem 1rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '1rem',
  },
  timeSeparator: {
    color: '#999',
    fontSize: '1rem',
  },
  textarea: {
    width: '100%',
    padding: '0.75rem 1rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '1rem',
    resize: 'vertical',
    boxSizing: 'border-box',
    fontFamily: 'inherit',
  },
  footer: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
    padding: '1rem 1.5rem',
    borderTop: '1px solid #eee',
    backgroundColor: '#f8f9fa',
  },
  cancelButton: {
    padding: '0.75rem 1.5rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    backgroundColor: 'white',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: '500',
    color: '#666',
  },
  saveButton: {
    padding: '0.75rem 1.5rem',
    border: 'none',
    borderRadius: '6px',
    backgroundColor: '#3498db',
    color: 'white',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: '600',
  },
};

export default MeetingReservationModal;
