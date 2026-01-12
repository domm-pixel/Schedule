import React from 'react';
import { Redirect, Route, RouteProps } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

interface PrivateRouteProps extends RouteProps {
  adminOnly?: boolean;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ 
  children, 
  adminOnly = false, 
  ...rest 
}) => {
  const { currentUser, userData, loading } = useAuth();

  if (loading) {
    return <div>로딩 중...</div>;
  }

  if (!currentUser) {
    return <Redirect to="/login" />;
  }

  if (adminOnly && userData?.role !== 'admin') {
    return <Redirect to="/" />;
  }

  return <Route {...rest}>{children}</Route>;
};

export default PrivateRoute;
