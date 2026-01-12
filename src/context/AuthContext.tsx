import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { 
  User as FirebaseUser,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  deleteUser
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { User } from '../types';

interface AuthContextType {
  currentUser: FirebaseUser | null;
  userData: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, username: string, team: string) => Promise<void>;
  logout: () => Promise<void>;
  isAdmin: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(null);
  const [userData, setUserData] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        // Firestore에서 사용자 데이터 가져오기
        try {
          const userDoc = await getDoc(doc(db, 'users', user.uid));
          if (userDoc.exists()) {
            setUserData(userDoc.data() as User);
          } else {
            // 사용자 데이터가 없으면 null로 설정
            // (회원가입 시 Firestore 저장이 실패한 경우 - UserDataForm에서 처리)
            console.warn('Firestore에 사용자 데이터가 없습니다.');
            setUserData(null);
          }
        } catch (error) {
          console.error('사용자 데이터 가져오기 실패:', error);
          setUserData(null);
        }
      } else {
        setUserData(null);
      }
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password);
  };

  const signup = async (
    email: string, 
    password: string,
    name: string, 
    username: string, 
    team: string
  ) => {
    // 사용자를 먼저 생성 (인증된 상태에서 중복 체크를 하기 위해)
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    try {
      // 아이디 중복 체크 (인증된 상태이므로 가능)
      const q = query(collection(db, 'users'), where('username', '==', username.trim()));
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        // 중복이면 사용자 계정 삭제
        await deleteUser(user);
        const error: any = new Error('이미 사용 중인 아이디입니다.');
        error.code = 'auth/username-already-in-use';
        throw error;
      }

      // Firestore에 사용자 정보 저장 (기본적으로 일반 사용자)
      const userData: Omit<User, 'id'> = {
        uid: user.uid,
        name,
        username,
        team,
        role: 'user',
        createdAt: serverTimestamp() as any,
      };

      await setDoc(doc(db, 'users', user.uid), userData);
    } catch (error: any) {
      console.error('회원가입 실패:', error);
      // 사용자 계정이 생성되었는데 다른 오류가 발생한 경우, 계정 삭제 시도
      if (error.code !== 'auth/username-already-in-use') {
        try {
          await deleteUser(user);
        } catch (deleteError) {
          console.error('사용자 계정 삭제 실패:', deleteError);
        }
      }
      throw error;
    }
  };

  const logout = async () => {
    await signOut(auth);
  };

  const value: AuthContextType = {
    currentUser,
    userData,
    loading,
    login,
    signup,
    logout,
    isAdmin: userData?.role === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
