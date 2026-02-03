import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { User } from '../types';
import { useAuth } from './AuthContext';

interface UsersContextType {
  users: User[];
  usersLoading: boolean;
  refreshUsers: () => Promise<void>;
  getUserByUid: (uid: string) => User | undefined;
}

const UsersContext = createContext<UsersContextType | undefined>(undefined);

export const useUsers = () => {
  const context = useContext(UsersContext);
  if (context === undefined) {
    throw new Error('useUsers must be used within a UsersProvider');
  }
  return context;
};

interface UsersProviderProps {
  children: ReactNode;
}

export const UsersProvider: React.FC<UsersProviderProps> = ({ children }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);
  const { currentUser } = useAuth();

  // 캐시 유효 시간: 5분 (300000ms)
  const CACHE_DURATION = 5 * 60 * 1000;

  const fetchUsers = useCallback(async (forceRefresh = false) => {
    // 캐시가 유효하고 강제 새로고침이 아니면 스킵
    const now = Date.now();
    if (!forceRefresh && users.length > 0 && (now - lastFetchTime) < CACHE_DURATION) {
      return;
    }

    setUsersLoading(true);
    try {
      const q = query(collection(db, 'users'), orderBy('name', 'asc'));
      const snapshot = await getDocs(q);
      const usersList: User[] = [];
      snapshot.forEach((doc) => {
        usersList.push({ id: doc.id, ...doc.data() } as User);
      });
      setUsers(usersList);
      setLastFetchTime(now);
    } catch (error) {
      console.error('사용자 목록 가져오기 실패:', error);
    } finally {
      setUsersLoading(false);
    }
  }, [users.length, lastFetchTime, CACHE_DURATION]);

  // 로그인 시 한 번만 사용자 목록 로드
  useEffect(() => {
    if (currentUser && users.length === 0) {
      fetchUsers(true);
    }
  }, [currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshUsers = useCallback(async () => {
    await fetchUsers(true);
  }, [fetchUsers]);

  const getUserByUid = useCallback((uid: string) => {
    return users.find(u => u.uid === uid);
  }, [users]);

  const value: UsersContextType = {
    users,
    usersLoading,
    refreshUsers,
    getUserByUid,
  };

  return <UsersContext.Provider value={value}>{children}</UsersContext.Provider>;
};
