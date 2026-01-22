import React, { useEffect, useState } from 'react';
import { collection, addDoc, getDocs, query, orderBy, deleteDoc, doc, serverTimestamp } from 'firebase/firestore';
import { format } from 'date-fns';
import { db } from '../firebase/config';
import Sidebar from '../components/Sidebar';
import { useAuth } from '../context/AuthContext';
import { Post } from '../types';
import Toast from '../components/Toast';

const CATEGORY_LABELS: { [key: string]: string } = {
  'notice': '📢 공지',
  'bug': '🐛 버그리포트',
  'general': '💬 일반',
};

const CATEGORY_COLORS: { [key: string]: string } = {
  'notice': '#e74c3c',
  'bug': '#f39c12',
  'general': '#3498db',
};

const Board: React.FC = () => {
  const { userData } = useAuth();
  const [posts, setPosts] = useState<Post[]>([]);
  const [filteredPosts, setFilteredPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'notice' | 'bug' | 'general'>('all');

  // 새 글 작성 폼 상태
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newCategory, setNewCategory] = useState<'notice' | 'bug' | 'general'>('general');

  useEffect(() => {
    fetchPosts();
  }, []);

  // 검색 및 카테고리 필터링
  useEffect(() => {
    let filtered = posts;

    // 카테고리 필터링
    if (filterCategory !== 'all') {
      filtered = filtered.filter(p => p.category === filterCategory);
    }

    // 검색어 필터링
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      filtered = filtered.filter(p =>
        p.title.toLowerCase().includes(term) ||
        p.content.toLowerCase().includes(term) ||
        p.authorName.toLowerCase().includes(term)
      );
    }

    setFilteredPosts(filtered);
  }, [posts, searchTerm, filterCategory]);

  const fetchPosts = async () => {
    try {
      setLoading(true);
      const postsQuery = query(
        collection(db, 'posts'),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(postsQuery);
      const postsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      })) as Post[];
      setPosts(postsData);
    } catch (error) {
      console.error('게시글 로딩 실패:', error);
      setToast({ message: '게시글을 불러오는데 실패했습니다.', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userData) return;

    if (!newTitle.trim() || !newContent.trim()) {
      setToast({ message: '제목과 내용을 모두 입력해주세요.', type: 'error' });
      return;
    }

    try {
      await addDoc(collection(db, 'posts'), {
        title: newTitle.trim(),
        content: newContent.trim(),
        category: newCategory,
        authorUid: userData.uid,
        authorName: userData.name,
        createdAt: serverTimestamp(),
      });

      setNewTitle('');
      setNewContent('');
      setNewCategory('general');
      setShowForm(false);
      fetchPosts();
      setToast({ message: '글이 등록되었습니다.', type: 'success' });
    } catch (error) {
      console.error('글 등록 실패:', error);
      setToast({ message: '글 등록에 실패했습니다.', type: 'error' });
    }
  };

  const handleDelete = async (postId: string) => {
    if (!window.confirm('정말 삭제하시겠습니까?')) return;

    try {
      await deleteDoc(doc(db, 'posts', postId));
      fetchPosts();
      setSelectedPost(null);
      setToast({ message: '글이 삭제되었습니다.', type: 'success' });
    } catch (error) {
      console.error('글 삭제 실패:', error);
      setToast({ message: '글 삭제에 실패했습니다.', type: 'error' });
    }
  };

  const canDelete = (post: Post) => {
    if (!userData) return false;
    // 관리자는 모든 글 삭제 가능, 일반 유저는 본인 글만 삭제 가능
    return userData.role === 'admin' || post.authorUid === userData.uid;
  };

  const formatDate = (timestamp: any) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return format(date, 'yyyy-MM-dd HH:mm');
  };

  return (
    <div style={styles.container}>
      <Sidebar />
      <main style={styles.main}>
        <div style={styles.header}>
          <h1 style={styles.pageTitle}>📋 게시판</h1>
          <button
            style={styles.newButton}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? '취소' : '✏️ 새 글 작성'}
          </button>
        </div>

        {/* 새 글 작성 폼 */}
        {showForm && (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>새 글 작성</h2>
            <form onSubmit={handleSubmit}>
              <div style={styles.formGroup}>
                <label style={styles.label}>카테고리</label>
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as 'notice' | 'bug' | 'general')}
                  style={styles.select}
                >
                  <option value="general">💬 일반</option>
                  <option value="bug">🐛 버그리포트</option>
                  {userData?.role === 'admin' && (
                    <option value="notice">📢 공지</option>
                  )}
                </select>
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>제목</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={styles.input}
                  placeholder="제목을 입력하세요"
                  maxLength={100}
                />
              </div>
              <div style={styles.formGroup}>
                <label style={styles.label}>내용</label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  style={styles.textarea}
                  placeholder="내용을 입력하세요"
                  rows={6}
                />
              </div>
              <div style={{ textAlign: 'right' }}>
                <button type="submit" style={styles.submitButton}>
                  등록
                </button>
              </div>
            </form>
          </div>
        )}

        {/* 검색 및 필터 */}
        <div style={styles.card}>
          <div style={styles.searchFilterContainer}>
            <div style={styles.searchBox}>
              <input
                type="text"
                placeholder="🔍 제목, 내용, 작성자 검색..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={styles.searchInput}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  style={styles.clearButton}
                  title="검색어 지우기"
                >
                  ✕
                </button>
              )}
            </div>
            <div style={styles.categoryFilters}>
              <button
                onClick={() => setFilterCategory('all')}
                style={{
                  ...styles.categoryFilterButton,
                  ...(filterCategory === 'all' ? styles.categoryFilterButtonActive : {}),
                }}
              >
                전체
              </button>
              <button
                onClick={() => setFilterCategory('notice')}
                style={{
                  ...styles.categoryFilterButton,
                  ...(filterCategory === 'notice' ? { ...styles.categoryFilterButtonActive, backgroundColor: '#e74c3c' } : {}),
                }}
              >
                📢 공지
              </button>
              <button
                onClick={() => setFilterCategory('bug')}
                style={{
                  ...styles.categoryFilterButton,
                  ...(filterCategory === 'bug' ? { ...styles.categoryFilterButtonActive, backgroundColor: '#f39c12' } : {}),
                }}
              >
                🐛 버그
              </button>
              <button
                onClick={() => setFilterCategory('general')}
                style={{
                  ...styles.categoryFilterButton,
                  ...(filterCategory === 'general' ? { ...styles.categoryFilterButtonActive, backgroundColor: '#3498db' } : {}),
                }}
              >
                💬 일반
              </button>
            </div>
          </div>
        </div>

        {/* 게시글 목록 */}
        <div style={styles.card}>
          <h2 style={styles.cardTitle}>게시글 목록 ({filteredPosts.length}건)</h2>
          {loading ? (
            <div style={styles.loading}>로딩 중...</div>
          ) : filteredPosts.length === 0 ? (
            <div style={styles.empty}>{searchTerm || filterCategory !== 'all' ? '검색 결과가 없습니다.' : '등록된 글이 없습니다.'}</div>
          ) : (
            <div style={styles.postList}>
              {filteredPosts.map((post) => (
                <div
                  key={post.id}
                  style={{
                    ...styles.postItem,
                    ...(selectedPost?.id === post.id ? styles.postItemSelected : {}),
                  }}
                  onClick={() => setSelectedPost(selectedPost?.id === post.id ? null : post)}
                >
                  <div style={styles.postHeader}>
                    <span
                      style={{
                        ...styles.categoryBadge,
                        backgroundColor: CATEGORY_COLORS[post.category],
                      }}
                    >
                      {CATEGORY_LABELS[post.category]}
                    </span>
                    <span style={styles.postTitle}>{post.title}</span>
                  </div>
                  <div style={styles.postMeta}>
                    <span style={styles.postAuthor}>{post.authorName}</span>
                    <span style={styles.postDate}>{formatDate(post.createdAt)}</span>
                  </div>

                  {/* 선택된 글의 상세 내용 */}
                  {selectedPost?.id === post.id && (
                    <div style={styles.postDetail}>
                      <div style={styles.postContent}>{post.content}</div>
                      {canDelete(post) && (
                        <div style={styles.postActions}>
                          <button
                            style={styles.deleteButton}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(post.id);
                            }}
                          >
                            🗑️ 삭제
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

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
    display: 'flex',
    minHeight: '100vh',
    backgroundColor: '#f5f6fa',
  },
  main: {
    flex: 1,
    marginLeft: '250px',
    padding: '2rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
  },
  pageTitle: {
    margin: 0,
    fontSize: '1.8rem',
    color: '#2c3e50',
  },
  newButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#3498db',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  card: {
    backgroundColor: 'white',
    borderRadius: '12px',
    padding: '1.5rem',
    marginBottom: '1.5rem',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  searchFilterContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  searchBox: {
    position: 'relative',
  },
  searchInput: {
    width: '100%',
    padding: '0.75rem 2.5rem 0.75rem 1rem',
    border: '1px solid #ddd',
    borderRadius: '8px',
    fontSize: '0.95rem',
    boxSizing: 'border-box',
  },
  clearButton: {
    position: 'absolute',
    right: '10px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    color: '#999',
    fontSize: '1rem',
    padding: '0.25rem',
  },
  categoryFilters: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap',
  },
  categoryFilterButton: {
    padding: '0.5rem 1rem',
    border: '1px solid #ddd',
    backgroundColor: 'white',
    borderRadius: '20px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    transition: 'all 0.2s',
  },
  categoryFilterButtonActive: {
    backgroundColor: '#3498db',
    color: 'white',
    borderColor: 'transparent',
  },
  cardTitle: {
    margin: '0 0 1.5rem 0',
    fontSize: '1.2rem',
    color: '#2c3e50',
    borderBottom: '2px solid #3498db',
    paddingBottom: '0.5rem',
  },
  formGroup: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: '500',
    color: '#34495e',
  },
  select: {
    width: '200px',
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '1rem',
    backgroundColor: 'white',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '1rem',
    boxSizing: 'border-box',
  },
  textarea: {
    width: '100%',
    padding: '0.75rem',
    border: '1px solid #ddd',
    borderRadius: '6px',
    fontSize: '1rem',
    boxSizing: 'border-box',
    resize: 'vertical',
    fontFamily: 'inherit',
  },
  submitButton: {
    padding: '0.75rem 2rem',
    backgroundColor: '#27ae60',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '500',
  },
  loading: {
    textAlign: 'center',
    padding: '2rem',
    color: '#666',
  },
  empty: {
    textAlign: 'center',
    padding: '2rem',
    color: '#999',
  },
  postList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  postItem: {
    padding: '1rem 1.25rem',
    border: '1px solid #eee',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s',
    backgroundColor: '#fafafa',
  },
  postItemSelected: {
    borderColor: '#3498db',
    backgroundColor: '#f8fafc',
    boxShadow: '0 2px 8px rgba(52, 152, 219, 0.15)',
  },
  postHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.5rem',
  },
  categoryBadge: {
    padding: '0.25rem 0.6rem',
    borderRadius: '12px',
    color: 'white',
    fontSize: '0.75rem',
    fontWeight: '500',
    whiteSpace: 'nowrap',
  },
  postTitle: {
    fontSize: '1rem',
    fontWeight: '500',
    color: '#2c3e50',
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  postMeta: {
    display: 'flex',
    gap: '1rem',
    fontSize: '0.85rem',
    color: '#7f8c8d',
  },
  postAuthor: {
    fontWeight: '500',
  },
  postDate: {},
  postDetail: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px dashed #ddd',
  },
  postContent: {
    whiteSpace: 'pre-wrap',
    lineHeight: '1.6',
    color: '#34495e',
    fontSize: '0.95rem',
  },
  postActions: {
    marginTop: '1rem',
    textAlign: 'right',
  },
  deleteButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#e74c3c',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.9rem',
  },
};

export default Board;
