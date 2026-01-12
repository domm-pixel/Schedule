import React from 'react';
import { BrowserRouter as Router, Route, Switch, Redirect } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Signup from './pages/Signup';
import UserManagement from './pages/UserManagement';
import ScheduleList from './pages/ScheduleList';
import ScheduleForm from './pages/ScheduleForm';
import WeeklySchedule from './pages/WeeklySchedule';
import CompanyCalendar from './pages/CompanyCalendar';
import PrivateRoute from './components/PrivateRoute';

// 로그인된 사용자만 접근 가능한 라우트 래퍼
const ProtectedRoute: React.FC<{ path: string; component: React.ComponentType<any>; exact?: boolean }> = ({ 
  component: Component, 
  ...rest 
}) => {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '3rem' }}>로딩 중...</div>;
  }

  return (
    <Route
      {...rest}
      render={(props) =>
        currentUser ? <Component {...props} /> : <Redirect to="/login" />
      }
    />
  );
};

// 관리자만 접근 가능한 라우트 래퍼
const AdminRoute: React.FC<{ path: string; component: React.ComponentType<any>; exact?: boolean }> = ({ 
  component: Component, 
  ...rest 
}) => {
  const { currentUser, userData, loading } = useAuth();

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '3rem' }}>로딩 중...</div>;
  }

  if (!currentUser) {
    return <Redirect to="/login" />;
  }

  if (userData?.role !== 'admin') {
    return <Redirect to="/" />;
  }

  return <Route {...rest} render={(props) => <Component {...props} />} />;
};

const AppContent: React.FC = () => {
  return (
    <Router>
      <Switch>
        {/* 공개 페이지 */}
        <Route path="/login" exact component={Login} />
        <Route path="/signup" exact component={Signup} />

        {/* 보호된 페이지 */}
        <ProtectedRoute path="/" exact component={Home} />
        <ProtectedRoute path="/schedule" exact component={ScheduleList} />
        <ProtectedRoute path="/schedule/new" exact component={ScheduleForm} />
        <ProtectedRoute path="/schedule/edit/:id" exact component={ScheduleForm} />
        <ProtectedRoute path="/schedule/weekly" exact component={WeeklySchedule} />
        <ProtectedRoute path="/calendar" exact component={CompanyCalendar} />

        {/* 관리자 전용 페이지 */}
        <AdminRoute path="/users" exact component={UserManagement} />

        {/* 기본 리다이렉트 */}
        <Route path="*">
          <Redirect to="/" />
        </Route>
      </Switch>
    </Router>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
