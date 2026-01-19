import React, { useState, useEffect } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import { doc, getDoc, setDoc, collection, query, getDocs, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Schedule, ScheduleHistory, LEVEL_DESCRIPTIONS } from '../types';
import { useAuth } from '../context/AuthContext';
import Sidebar from '../components/Sidebar';
import DatePicker from 'react-datepicker';
import { ko } from 'date-fns/locale';
import 'react-datepicker/dist/react-datepicker.css';

const ScheduleForm: React.FC = () => {
  const { id } = useParams<{ id?: string }>();
  const isEdit = !!id;
  const history = useHistory();
  const { userData } = useAuth();

  const [formData, setFormData] = useState({
    taskId: '',
    taskName: '',
    level: 'L1' as Schedule['level'],
    description: '',
    status: '대기중' as Schedule['status'],
    startDate: '',
    endDate: '',
    startTime: '',
    endTime: '',
    isPublic: false,
    note: '',
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatingTaskId, setGeneratingTaskId] = useState(false);
  const [originalData, setOriginalData] = useState<Schedule | null>(null);

  useEffect(() => {
    if (isEdit && id) {
      fetchSchedule(id);
    } else {
      // 새 업무 등록 시 자동으로 업무 아이디 생성
      generateTaskId();
    }
  }, [isEdit, id]);

  const generateTaskId = async () => {
    try {
      setGeneratingTaskId(true);
      const currentYear = new Date().getFullYear();
      const prefix = `doldol-${currentYear}-`;

      // 현재 년도의 모든 업무 아이디 조회
      const q = query(collection(db, 'schedules'));
      const querySnapshot = await getDocs(q);
      
      let maxNumber = 0;
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        const taskId = data.taskId || '';
        if (taskId.startsWith(prefix)) {
          const numberPart = taskId.replace(prefix, '');
          const number = parseInt(numberPart, 10);
          if (!isNaN(number) && number > maxNumber) {
            maxNumber = number;
          }
        }
      });

      const newTaskId = `${prefix}${maxNumber + 1}`;
      setFormData(prev => ({ ...prev, taskId: newTaskId }));
    } catch (error) {
      console.error('업무 아이디 생성 실패:', error);
      setError('업무 아이디 생성에 실패했습니다.');
    } finally {
      setGeneratingTaskId(false);
    }
  };

  const fetchSchedule = async (scheduleId: string) => {
    try {
      const docRef = doc(db, 'schedules', scheduleId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data() as Schedule;
        setOriginalData(data); // 원본 데이터 저장
        
        // startDate/endDate가 있으면 사용, 없으면 deadline을 사용 (하위 호환성)
        const startDate = data.startDate 
          ? new Date(data.startDate).toISOString().split('T')[0]
          : data.deadline 
          ? new Date(data.deadline).toISOString().split('T')[0]
          : '';
        const endDate = data.endDate
          ? new Date(data.endDate).toISOString().split('T')[0]
          : data.deadline
          ? new Date(data.deadline).toISOString().split('T')[0]
          : '';
        
        setFormData({
          taskId: data.taskId,
          taskName: data.taskName,
          level: data.level,
          description: data.description,
          status: data.status,
          startDate,
          endDate,
          startTime: data.startTime || '',
          endTime: data.endTime || '',
          isPublic: data.isPublic ?? false,
          note: data.note || '',
        });
      }
    } catch (error) {
      console.error('스케줄 가져오기 실패:', error);
      alert('스케줄 정보를 불러오는데 실패했습니다.');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!userData) {
      setError('로그인이 필요합니다.');
      return;
    }

    if (!formData.taskId || !formData.taskName || !formData.startDate || !formData.endDate) {
      setError('필수 항목을 모두 입력해주세요.');
      return;
    }

    // 미팅인 경우 시작일과 종료일이 같아야 함
    if (formData.level === '미팅' && formData.startDate !== formData.endDate) {
      setError('미팅은 당일에 진행되므로 시작일과 종료일이 같아야 합니다.');
      return;
    }

    if (new Date(formData.startDate) > new Date(formData.endDate)) {
      setError('시작일은 종료일보다 늦을 수 없습니다.');
      return;
    }

    setLoading(true);

      try {
        let changeHistory: ScheduleHistory[] = [];
        
        if (isEdit && id && originalData) {
          // 변경 사항 감지 및 이력 기록
          const formatValue = (field: string, value: any): string => {
            if (field === 'deadline') {
              return value ? new Date(value).toLocaleDateString('ko-KR') : '';
            }
            return String(value || '');
          };

          // 각 필드 비교 (현재 시간을 Date 객체로 사용 - Firestore는 자동으로 Timestamp로 변환)
          const now = new Date();
          
          // taskName
          if (originalData.taskName !== formData.taskName) {
            changeHistory.push({
              field: '업무명',
              oldValue: originalData.taskName,
              newValue: formData.taskName,
              changedBy: userData.name,
              changedAt: now as any,
            });
          }
          
          // level
          if (originalData.level !== formData.level) {
            changeHistory.push({
              field: '레벨',
              oldValue: originalData.level,
              newValue: formData.level,
              changedBy: userData.name,
              changedAt: now as any,
            });
          }
          
          // description
          if (originalData.description !== formData.description) {
            changeHistory.push({
              field: '업무 내용',
              oldValue: originalData.description,
              newValue: formData.description,
              changedBy: userData.name,
              changedAt: now as any,
            });
          }
          
          // status
          if (originalData.status !== formData.status) {
            changeHistory.push({
              field: '업무 상태',
              oldValue: originalData.status,
              newValue: formData.status,
              changedBy: userData.name,
              changedAt: now as any,
            });
          }
          
          // startDate
          const oldStartDate = originalData.startDate 
            ? new Date(originalData.startDate).toISOString().split('T')[0]
            : originalData.deadline
            ? new Date(originalData.deadline).toISOString().split('T')[0]
            : '';
          if (oldStartDate !== formData.startDate) {
            changeHistory.push({
              field: '시작일',
              oldValue: oldStartDate ? formatValue('deadline', originalData.startDate || originalData.deadline) : '',
              newValue: formatValue('deadline', new Date(formData.startDate).toISOString()),
              changedBy: userData.name,
              changedAt: now as any,
            });
          }

          // endDate
          const oldEndDate = originalData.endDate
            ? new Date(originalData.endDate).toISOString().split('T')[0]
            : originalData.deadline
            ? new Date(originalData.deadline).toISOString().split('T')[0]
            : '';
          if (oldEndDate !== formData.endDate) {
            changeHistory.push({
              field: '종료일',
              oldValue: oldEndDate ? formatValue('deadline', originalData.endDate || originalData.deadline) : '',
              newValue: formatValue('deadline', new Date(formData.endDate).toISOString()),
              changedBy: userData.name,
              changedAt: now as any,
            });
          }

          // isPublic
          if ((originalData.isPublic ?? false) !== formData.isPublic) {
            changeHistory.push({
              field: '전사 스케줄 노출',
              oldValue: originalData.isPublic ? '예' : '아니오',
              newValue: formData.isPublic ? '예' : '아니오',
              changedBy: userData.name,
              changedAt: now as any,
            });
          }
          
          // note
          if ((originalData.note || '') !== (formData.note || '')) {
            changeHistory.push({
              field: '비고',
              oldValue: originalData.note || '',
              newValue: formData.note || '',
              changedBy: userData.name,
              changedAt: now as any,
            });
          }

          // 기존 이력 가져오기
          const existingHistory = originalData.history || [];
          changeHistory = [...existingHistory, ...changeHistory];
        }

        const scheduleData: Omit<Schedule, 'id'> = {
          taskId: formData.taskId,
          taskName: formData.taskName,
          level: formData.level,
          description: formData.description,
          status: formData.status,
          startDate: new Date(formData.startDate).toISOString(),
          endDate: new Date(formData.endDate).toISOString(),
          deadline: new Date(formData.endDate).toISOString(), // 하위 호환성을 위해 endDate와 동일하게 설정
          startTime: formData.startTime || undefined,
          endTime: formData.endTime || undefined,
          isPublic: formData.isPublic,
          note: formData.note || '',
          userId: userData.uid,
          userName: userData.name,
          createdAt: isEdit ? (await getDoc(doc(db, 'schedules', id!))).data()?.createdAt : serverTimestamp() as any,
          updatedAt: serverTimestamp() as any,
          ...(changeHistory.length > 0 && { history: changeHistory }),
        };

        if (isEdit && id) {
          await setDoc(doc(db, 'schedules', id), scheduleData, { merge: true });
        } else {
          await addDoc(collection(db, 'schedules'), scheduleData);
        }

      history.push('/schedule');
    } catch (error) {
      console.error('스케줄 저장 실패:', error);
      setError('스케줄 저장에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex' }}>
      <Sidebar />
      <div style={{ marginLeft: '250px', width: 'calc(100% - 250px)', padding: '2rem' }}>
        <div style={styles.container}>
          <h1 style={styles.title}>{isEdit ? '업무 수정' : '새 업무 등록'}</h1>
          {error && <div style={styles.error}>{error}</div>}
          {generatingTaskId && !isEdit && (
            <div style={styles.info}>업무 아이디를 생성하는 중...</div>
          )}
          <form onSubmit={handleSubmit} style={styles.form}>
        <div style={styles.formGroup}>
          <label style={styles.label}>
            업무 아이디 *
          </label>
          <input
            type="text"
            value={formData.taskId}
            onChange={(e) => {}}
            required
            disabled
            style={{...styles.input, ...styles.disabledInput}}
            placeholder="자동 생성"
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>업무명 *</label>
          <input
            type="text"
            value={formData.taskName}
            onChange={(e) => setFormData({ ...formData, taskName: e.target.value })}
            required
            style={styles.input}
            placeholder="업무명을 입력하세요"
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>레벨 *</label>
          <select
            value={formData.level}
            onChange={(e) => {
              const newLevel = e.target.value as Schedule['level'];
              // 미팅으로 변경하면 종료일을 시작일과 동일하게 설정
              if (newLevel === '미팅' && formData.startDate) {
                setFormData({ ...formData, level: newLevel, endDate: formData.startDate });
              } else {
                setFormData({ ...formData, level: newLevel });
              }
            }}
            required
            style={styles.select}
          >
            <option value="L1" title={LEVEL_DESCRIPTIONS['L1']}>L1</option>
            <option value="L2" title={LEVEL_DESCRIPTIONS['L2']}>L2</option>
            <option value="L3" title={LEVEL_DESCRIPTIONS['L3']}>L3</option>
            <option value="L4" title={LEVEL_DESCRIPTIONS['L4']}>L4</option>
            <option value="L5" title={LEVEL_DESCRIPTIONS['L5']}>L5</option>
            <option value="L6" title={LEVEL_DESCRIPTIONS['L6']}>L6</option>
            {/* 휴가는 별도 휴가 관리 화면에서만 사용 */}
            <option value="재택" title={LEVEL_DESCRIPTIONS['재택']}>재택</option>
            <option value="미팅" title={LEVEL_DESCRIPTIONS['미팅']}>미팅</option>
          </select>
          {LEVEL_DESCRIPTIONS[formData.level] && (
            <div style={styles.levelDescription}>
              <strong>{formData.level}:</strong> {LEVEL_DESCRIPTIONS[formData.level]}
            </div>
          )}
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>업무 내용 *</label>
          <textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            required
            style={styles.textarea}
            placeholder="업무 내용을 입력하세요"
            rows={5}
          />
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>업무 상태 *</label>
          <select
            value={formData.status}
            onChange={(e) => setFormData({ ...formData, status: e.target.value as Schedule['status'] })}
            required
            style={styles.select}
          >
            <option value="대기중">대기중</option>
            <option value="진행중">진행중</option>
            <option value="완료">완료</option>
            <option value="연기">연기</option>
          </select>
        </div>

        {formData.level === '미팅' ? (
          <div style={styles.formGroup}>
            <label style={styles.label}>날짜 *</label>
            <DatePicker
              selected={formData.startDate ? new Date(formData.startDate) : null}
              onChange={(date: Date | null) => {
                if (date) {
                  const dateStr = date.toISOString().split('T')[0];
                  setFormData({ ...formData, startDate: dateStr, endDate: dateStr });
                }
              }}
              dateFormat="yyyy-MM-dd"
              locale={ko}
              placeholderText="날짜를 선택하세요"
              showYearDropdown
              showMonthDropdown
              yearDropdownItemNumber={100}
              scrollableYearDropdown
              required
              className="date-picker-input"
            />
            <small style={styles.helpText}>
              미팅은 당일에 진행됩니다
            </small>
          </div>
        ) : (
          <>
            <div style={styles.formGroup}>
              <label style={styles.label}>시작일 *</label>
              <DatePicker
                selected={formData.startDate ? new Date(formData.startDate) : null}
                onChange={(date: Date | null) => {
                  if (date) {
                    const dateStr = date.toISOString().split('T')[0];
                    setFormData({ ...formData, startDate: dateStr });
                  }
                }}
                dateFormat="yyyy-MM-dd"
                locale={ko}
                placeholderText="시작일을 선택하세요"
                showYearDropdown
                showMonthDropdown
                yearDropdownItemNumber={100}
                scrollableYearDropdown
                required
                className="date-picker-input"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>종료일 *</label>
              <DatePicker
                selected={formData.endDate ? new Date(formData.endDate) : null}
                onChange={(date: Date | null) => {
                  if (date) {
                    const dateStr = date.toISOString().split('T')[0];
                    setFormData({ ...formData, endDate: dateStr });
                  }
                }}
                dateFormat="yyyy-MM-dd"
                locale={ko}
                placeholderText="종료일을 선택하세요"
                minDate={formData.startDate ? new Date(formData.startDate) : undefined}
                showYearDropdown
                showMonthDropdown
                yearDropdownItemNumber={100}
                scrollableYearDropdown
                required
                className="date-picker-input"
              />
              <small style={styles.helpText}>
                하루만인 경우 시작일과 종료일을 동일하게 설정하세요
              </small>
            </div>
          </>
        )}

        {formData.level === '미팅' && (
          <>
            <div style={styles.formGroup}>
              <label style={styles.label}>시작 시간</label>
              <input
                type="time"
                value={formData.startTime}
                onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                style={styles.input}
              />
              <small style={styles.helpText}>
                미팅 시작 시간을 입력하세요 (예: 14:30)
              </small>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>종료 시간</label>
              <input
                type="time"
                value={formData.endTime}
                onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                style={styles.input}
              />
              <small style={styles.helpText}>
                미팅 종료 시간을 입력하세요 (예: 16:00)
              </small>
            </div>
          </>
        )}

        <div style={styles.formGroup}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={formData.isPublic}
              onChange={(e) => setFormData({ ...formData, isPublic: e.target.checked })}
              style={styles.checkbox}
            />
            전사 스케줄에 노출
          </label>
          <small style={styles.helpText}>
            체크하면 전사 스케줄 열람 페이지에 표시됩니다
          </small>
        </div>

        <div style={styles.formGroup}>
          <label style={styles.label}>비고</label>
          <textarea
            value={formData.note}
            onChange={(e) => setFormData({ ...formData, note: e.target.value })}
            style={styles.textarea}
            placeholder="비고를 입력하세요 (선택사항)"
            rows={3}
          />
        </div>

              <div style={styles.buttonGroup}>
                <button
                  type="button"
                  onClick={() => history.goBack()}
                  style={styles.cancelButton}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={loading || generatingTaskId}
                  style={{
                    ...styles.submitButton,
                    ...(loading || generatingTaskId ? styles.buttonDisabled : {}),
                  }}
                >
                  {loading ? '저장 중...' : isEdit ? '수정' : '등록'}
                </button>
              </div>
            </form>

            {/* 변경 이력 표시 (수정 모드일 때만) */}
            {isEdit && originalData && originalData.history && originalData.history.length > 0 && (
              <div style={styles.historySection}>
                <h3 style={styles.historyTitle}>변경 이력</h3>
                <div style={styles.historyList}>
                  {[...originalData.history].reverse().map((item, index) => {
                    const changedAt = item.changedAt?.toDate
                      ? item.changedAt.toDate()
                      : item.changedAt
                      ? new Date(item.changedAt)
                      : null;
                    return (
                      <div key={index} style={styles.historyItem}>
                        <div style={styles.historyHeader}>
                          <span style={styles.historyField}>{item.field}</span>
                          <span style={styles.historyUser}>{item.changedBy}</span>
                          {changedAt && (
                            <span style={styles.historyDate}>
                              {changedAt.toLocaleString('ko-KR')}
                            </span>
                          )}
                        </div>
                        <div style={styles.historyChange}>
                          <span style={styles.historyOldValue}>이전: {item.oldValue}</span>
                          <span style={styles.historyArrow}>→</span>
                          <span style={styles.historyNewValue}>변경: {item.newValue}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    maxWidth: '800px',
    margin: '0 auto',
  },
  title: {
    marginBottom: '2rem',
    color: '#333',
  },
  form: {
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
  },
  formGroup: {
    marginBottom: '1.5rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#555',
    fontWeight: '500',
  },
  required: {
    color: '#dc3545',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '1rem',
    boxSizing: 'border-box',
  },
  inputError: {
    borderColor: '#dc3545',
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '1rem',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '4px',
    fontSize: '1rem',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    resize: 'vertical',
  },
  helpText: {
    display: 'block',
    marginTop: '0.25rem',
    color: '#666',
    fontSize: '0.875rem',
  },
  levelDescription: {
    marginTop: '0.75rem',
    padding: '0.75rem',
    backgroundColor: '#f8f9fa',
    border: '1px solid #dee2e6',
    borderRadius: '4px',
    fontSize: '0.875rem',
    lineHeight: '1.6',
    color: '#495057',
  },
  error: {
    color: '#dc3545',
    marginBottom: '1rem',
    padding: '0.75rem',
    backgroundColor: '#f8d7da',
    borderRadius: '4px',
    fontSize: '0.9rem',
  },
  info: {
    color: '#0c5460',
    marginBottom: '1rem',
    padding: '0.75rem',
    backgroundColor: '#d1ecf1',
    borderRadius: '4px',
    fontSize: '0.9rem',
  },
  disabledInput: {
    backgroundColor: '#e9ecef',
    cursor: 'not-allowed',
    color: '#6c757d',
  },
  warning: {
    color: '#856404',
    marginBottom: '1rem',
    padding: '0.75rem',
    backgroundColor: '#fff3cd',
    borderRadius: '4px',
    fontSize: '0.9rem',
  },
  buttonGroup: {
    display: 'flex',
    gap: '1rem',
    justifyContent: 'flex-end',
    marginTop: '2rem',
  },
  submitButton: {
    padding: '0.75rem 2rem',
    backgroundColor: '#007bff',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  cancelButton: {
    padding: '0.75rem 2rem',
    backgroundColor: '#6c757d',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
  },
    buttonDisabled: {
      backgroundColor: '#ccc',
      cursor: 'not-allowed',
    },
    historySection: {
      marginTop: '2rem',
      padding: '1.5rem',
      backgroundColor: '#f8f9fa',
      borderRadius: '8px',
      border: '1px solid #dee2e6',
    },
    historyTitle: {
      margin: '0 0 1rem 0',
      fontSize: '1.25rem',
      fontWeight: '600',
      color: '#333',
    },
    historyList: {
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
    },
    historyItem: {
      padding: '1rem',
      backgroundColor: 'white',
      borderRadius: '4px',
      border: '1px solid #dee2e6',
    },
    historyHeader: {
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      marginBottom: '0.5rem',
    },
    historyField: {
      fontWeight: '600',
      color: '#495057',
      fontSize: '0.95rem',
    },
    historyUser: {
      color: '#6c757d',
      fontSize: '0.875rem',
    },
    historyDate: {
      color: '#6c757d',
      fontSize: '0.875rem',
      marginLeft: 'auto',
    },
    historyChange: {
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      fontSize: '0.9rem',
    },
    historyOldValue: {
      color: '#dc3545',
      textDecoration: 'line-through',
    },
    historyArrow: {
      color: '#6c757d',
    },
    historyNewValue: {
      color: '#28a745',
      fontWeight: '500',
    },
  };

  export default ScheduleForm;
