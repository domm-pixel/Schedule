import React, { useState, useEffect, useRef } from 'react';
import { doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Schedule, ScheduleComment, User } from '../types';
import { format } from 'date-fns';
import { useAuth } from '../context/AuthContext';
import LevelTooltip from './LevelTooltip';

interface ScheduleDetailModalProps {
  date: Date;
  schedules: Schedule[];
  usersMap: { [key: string]: User };
  onClose: () => void;
  onScheduleUpdate?: () => void; // 스케줄 업데이트 후 콜백
}

const ScheduleDetailModal: React.FC<ScheduleDetailModalProps> = ({
  date,
  schedules,
  usersMap,
  onClose,
  onScheduleUpdate,
}) => {
  const { userData } = useAuth();
  const [comments, setComments] = useState<{ [scheduleId: string]: ScheduleComment[] }>({});
  const [newComment, setNewComment] = useState<{ [scheduleId: string]: string }>({});
  const [loadingComments, setLoadingComments] = useState<{ [scheduleId: string]: boolean }>({});
  const [closeHover, setCloseHover] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // ESC 키로 닫기
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  useEffect(() => {
    // 모달 외부 클릭 시 닫기
    const handleClickOutside = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  useEffect(() => {
    // 각 스케줄의 의견 가져오기 - 모달이 열릴 때 초기화
    const initialComments: { [scheduleId: string]: ScheduleComment[] } = {};
    schedules.forEach((schedule) => {
      const scheduleComments = schedule.comments || [];
      console.log(`스케줄 ${schedule.id}의 초기 comments:`, scheduleComments);
      initialComments[schedule.id] = scheduleComments;
    });
    console.log('모달 열릴 때 초기 comments 상태:', initialComments);
    setComments(initialComments);
  }, [schedules]);

  const handleAddComment = async (scheduleId: string) => {
    if (!userData || !newComment[scheduleId]?.trim()) return;

    const commentText = newComment[scheduleId].trim();
    setLoadingComments((prev) => ({ ...prev, [scheduleId]: true }));

    try {
      const scheduleRef = doc(db, 'schedules', scheduleId);
      const scheduleDoc = await getDoc(scheduleRef);

      if (!scheduleDoc.exists()) {
        throw new Error('스케줄을 찾을 수 없습니다.');
      }

      const currentSchedule = scheduleDoc.data() as Schedule;
      const existingComments = currentSchedule.comments || [];

      // serverTimestamp()는 배열 안에서 사용할 수 없으므로 클라이언트 시간 사용
      // 업데이트 후 다시 읽어서 최신 데이터 가져오기
      const newCommentObj: ScheduleComment = {
        text: commentText,
        createdBy: userData.name,
        createdByUid: userData.uid,
        createdAt: new Date(), // 클라이언트 시간 사용
      };

      const updatedComments = [...existingComments, newCommentObj];

      await updateDoc(scheduleRef, {
        comments: updatedComments,
        updatedAt: serverTimestamp(),
      });

      // 업데이트 후 다시 읽어서 Firestore에 저장된 실제 데이터 가져오기
      const updatedDoc = await getDoc(scheduleRef);
      if (updatedDoc.exists()) {
        const updatedSchedule = updatedDoc.data() as Schedule;
        const savedComments = updatedSchedule.comments || [];
        console.log('의견 추가 후 Firestore에서 읽은 comments:', savedComments);
        setComments((prev) => ({
          ...prev,
          [scheduleId]: savedComments,
        }));
      } else {
        // 만약 읽기 실패 시 로컬 상태 업데이트
        console.log('Firestore 읽기 실패, 로컬 상태 업데이트:', updatedComments);
        setComments((prev) => ({
          ...prev,
          [scheduleId]: updatedComments,
        }));
      }

      setNewComment((prev) => ({
        ...prev,
        [scheduleId]: '',
      }));

      // 부모 컴포넌트에 업데이트 알림
      if (onScheduleUpdate) {
        onScheduleUpdate();
      }
    } catch (error) {
      console.error('의견 추가 실패:', error);
      alert('의견 추가에 실패했습니다.');
    } finally {
      setLoadingComments((prev) => ({ ...prev, [scheduleId]: false }));
    }
  };

  const formatCommentDate = (timestamp: any) => {
    if (!timestamp) return '';
    try {
      // Firestore Timestamp인 경우 toDate() 사용
      if (timestamp && typeof timestamp.toDate === 'function') {
        const date = timestamp.toDate();
        return format(date, 'yyyy-MM-dd HH:mm');
      }
      // Date 객체인 경우
      if (timestamp instanceof Date) {
        return format(timestamp, 'yyyy-MM-dd HH:mm');
      }
      // 문자열인 경우
      if (typeof timestamp === 'string') {
        return format(new Date(timestamp), 'yyyy-MM-dd HH:mm');
      }
      // 숫자 타임스탬프인 경우
      if (typeof timestamp === 'number') {
        return format(new Date(timestamp), 'yyyy-MM-dd HH:mm');
      }
      return '';
    } catch {
      return '';
    }
  };

  return (
    <div style={modalOverlayStyles}>
      <div ref={modalRef} style={modalStyles}>
        <div style={modalHeaderStyles}>
          <h2 style={modalTitleStyles}>
            {format(date, 'yyyy년 MM월 dd일')} 업무
          </h2>
          <button
            onClick={onClose}
            onMouseEnter={() => setCloseHover(true)}
            onMouseLeave={() => setCloseHover(false)}
            style={{
              ...closeButtonStyles,
              backgroundColor: closeHover ? '#f0f0f0' : 'transparent',
              color: closeHover ? '#333' : '#666',
            }}
          >
            ×
          </button>
        </div>

        <div style={modalContentStyles}>
          {schedules.length === 0 ? (
            <div style={emptyStyles}>해당 날짜에 등록된 업무가 없습니다.</div>
          ) : (
            schedules.map((schedule) => {
              const scheduleComments = comments[schedule.id] || [];
              console.log(`스케줄 ${schedule.id} 렌더링 시 comments:`, scheduleComments);
              return (
                <div key={schedule.id} style={scheduleCardStyles}>
                  <div style={scheduleHeaderStyles}>
                    <div style={scheduleTitleRowStyles}>
                      <span style={userNameStyles}>
                        [{usersMap[schedule.userId]?.name || schedule.userName}]
                      </span>
                      <span style={taskNameStyles}>{schedule.taskName}</span>
                      <LevelTooltip level={schedule.level}>
                        <span style={levelBadgeStyles}>{schedule.level}</span>
                      </LevelTooltip>
                    </div>
                    <span style={{
                      ...statusBadgeStyles,
                      backgroundColor: schedule.status === '진행중' ? '#fff3cd' : schedule.status === '완료' ? '#d4edda' : schedule.status === '연기' ? '#f8d7da' : '#e2e3e5',
                      color: schedule.status === '진행중' ? '#856404' : schedule.status === '완료' ? '#155724' : schedule.status === '연기' ? '#721c24' : '#383d41',
                    }}>
                      {schedule.status}
                    </span>
                  </div>

                  <div style={scheduleInfoStyles}>
                    <div style={infoRowStyles}>
                      <span style={infoLabelStyles}>담당자:</span>
                      <span>
                        {usersMap[schedule.userId]?.name || schedule.userName}
                        {usersMap[schedule.userId]?.username && `/${usersMap[schedule.userId].username}`}
                        {usersMap[schedule.userId]?.team && ` [${usersMap[schedule.userId].team}]`}
                      </span>
                    </div>
                    {schedule.startTime && schedule.endTime && (
                      <div style={infoRowStyles}>
                        <span style={infoLabelStyles}>시간:</span>
                        <span>{schedule.startTime} ~ {schedule.endTime}</span>
                      </div>
                    )}
                    {schedule.level === '휴가' && schedule.note && (
                      <div style={infoRowStyles}>
                        <span style={infoLabelStyles}>대직자:</span>
                        <span>{schedule.note.replace('대직자: ', '')}</span>
                      </div>
                    )}
                    <div style={infoRowStyles}>
                      <span style={infoLabelStyles}>{schedule.level === '휴가' ? '사유' : '업무 내용'}:</span>
                      <span>{schedule.description}</span>
                    </div>
                  </div>

                  {/* 의견 섹션 */}
                  <div style={commentsSectionStyles}>
                    <h4 style={commentsTitleStyles}>의견 ({scheduleComments.length})</h4>
                    
                    <div style={commentsListStyles}>
                      {scheduleComments.length === 0 ? (
                        <div style={noCommentsStyles}>의견이 없습니다.</div>
                      ) : (
                        scheduleComments.map((comment, index) => (
                          <div key={index} style={commentItemStyles}>
                            <div style={commentHeaderStyles}>
                              <span style={commentAuthorStyles}>{comment.createdBy}</span>
                              <span style={commentDateStyles}>{formatCommentDate(comment.createdAt)}</span>
                            </div>
                            <div style={commentTextStyles}>{comment.text}</div>
                          </div>
                        ))
                      )}
                    </div>

                    {userData && (
                      <div style={commentInputStyles}>
                        <textarea
                          value={newComment[schedule.id] || ''}
                          onChange={(e) => setNewComment((prev) => ({
                            ...prev,
                            [schedule.id]: e.target.value,
                          }))}
                          placeholder="의견을 입력하세요..."
                          style={commentTextareaStyles}
                          rows={3}
                        />
                        <button
                          onClick={() => handleAddComment(schedule.id)}
                          disabled={loadingComments[schedule.id] || !newComment[schedule.id]?.trim()}
                          style={{
                            ...commentSubmitButtonStyles,
                            ...(loadingComments[schedule.id] || !newComment[schedule.id]?.trim() ? commentSubmitButtonDisabledStyles : {}),
                          }}
                        >
                          {loadingComments[schedule.id] ? '등록 중...' : '의견 등록'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

const modalOverlayStyles: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
  padding: '2rem',
};

const modalStyles: React.CSSProperties = {
  backgroundColor: 'white',
  borderRadius: '8px',
  width: '100%',
  maxWidth: '800px',
  maxHeight: '90vh',
  display: 'flex',
  flexDirection: 'column',
  boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
};

const modalHeaderStyles: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: '1.5rem',
  borderBottom: '1px solid #eee',
};

const modalTitleStyles: React.CSSProperties = {
  margin: 0,
  fontSize: '1.5rem',
  fontWeight: '600',
  color: '#333',
};

const closeButtonStyles: React.CSSProperties = {
  background: 'none',
  border: 'none',
  fontSize: '2rem',
  color: '#666',
  cursor: 'pointer',
  padding: 0,
  width: '32px',
  height: '32px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  lineHeight: 1,
  borderRadius: '4px',
  transition: 'background-color 0.2s, color 0.2s',
};

// CSS에서 hover 효과는 inline style로 처리할 수 없으므로, useState로 hover 상태 관리

const modalContentStyles: React.CSSProperties = {
  padding: '1.5rem',
  overflowY: 'auto',
  flex: 1,
};

const emptyStyles: React.CSSProperties = {
  textAlign: 'center',
  color: '#666',
  padding: '3rem',
};

const scheduleCardStyles: React.CSSProperties = {
  padding: '1.5rem',
  border: '1px solid #eee',
  borderRadius: '8px',
  backgroundColor: '#f8f9fa',
  marginBottom: '1rem',
};

const scheduleHeaderStyles: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: '1rem',
};

const scheduleTitleRowStyles: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '0.5rem',
  flex: 1,
};

const userNameStyles: React.CSSProperties = {
  fontSize: '0.875rem',
  color: '#666',
};

const taskNameStyles: React.CSSProperties = {
  fontSize: '1.125rem',
  fontWeight: '600',
  color: '#333',
};

const levelBadgeStyles: React.CSSProperties = {
  padding: '0.125rem 0.375rem',
  backgroundColor: '#e3f2fd',
  color: '#1976d2',
  borderRadius: '3px',
  fontSize: '0.75rem',
  fontWeight: '600',
};

const statusBadgeStyles: React.CSSProperties = {
  padding: '0.25rem 0.5rem',
  borderRadius: '4px',
  fontSize: '0.75rem',
  fontWeight: '500',
};

const scheduleInfoStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
  marginBottom: '1rem',
  padding: '1rem',
  backgroundColor: 'white',
  borderRadius: '4px',
};

const infoRowStyles: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
};

const infoLabelStyles: React.CSSProperties = {
  fontWeight: '600',
  color: '#666',
  minWidth: '80px',
};

const commentsSectionStyles: React.CSSProperties = {
  marginTop: '1rem',
  paddingTop: '1rem',
  borderTop: '1px solid #ddd',
};

const commentsTitleStyles: React.CSSProperties = {
  margin: '0 0 1rem 0',
  fontSize: '1rem',
  fontWeight: '600',
  color: '#333',
};

const commentsListStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  marginBottom: '1rem',
  maxHeight: '200px',
  overflowY: 'auto',
};

const noCommentsStyles: React.CSSProperties = {
  textAlign: 'center',
  color: '#999',
  padding: '1rem',
  fontSize: '0.875rem',
};

const commentItemStyles: React.CSSProperties = {
  padding: '0.75rem',
  backgroundColor: 'white',
  borderRadius: '4px',
  border: '1px solid #eee',
};

const commentHeaderStyles: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.5rem',
};

const commentAuthorStyles: React.CSSProperties = {
  fontWeight: '600',
  color: '#333',
  fontSize: '0.875rem',
};

const commentDateStyles: React.CSSProperties = {
  color: '#999',
  fontSize: '0.75rem',
};

const commentTextStyles: React.CSSProperties = {
  color: '#555',
  fontSize: '0.875rem',
  lineHeight: '1.5',
  whiteSpace: 'pre-wrap',
};

const commentInputStyles: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const commentTextareaStyles: React.CSSProperties = {
  width: '100%',
  padding: '0.75rem',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '0.875rem',
  fontFamily: 'inherit',
  resize: 'vertical',
  boxSizing: 'border-box',
};

const commentSubmitButtonStyles: React.CSSProperties = {
  padding: '0.5rem 1rem',
  backgroundColor: '#007bff',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  fontSize: '0.875rem',
  cursor: 'pointer',
  fontWeight: '500',
  alignSelf: 'flex-end',
};

const commentSubmitButtonDisabledStyles: React.CSSProperties = {
  backgroundColor: '#ccc',
  cursor: 'not-allowed',
};

export default ScheduleDetailModal;
