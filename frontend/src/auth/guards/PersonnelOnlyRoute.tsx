import React, { useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import * as AuthService from '../AuthService';

interface PersonnelOnlyRouteProps {
  children: React.ReactElement;
}

// protects routes that only personnel can access
const PersonnelOnlyRoute: React.FC<PersonnelOnlyRouteProps> = ({ children }) => {
  const isAuthenticated = AuthService.isAuthenticated();
  const userInfo = AuthService.getUserInfo();
  const isPersonnel = userInfo?.role === 'Personnel';

  // The backend only issues portal tokens to personnel, so a stored non-personnel
  // session can only be a stale one from before the portal became personnel-only.
  // Its token is rejected by every endpoint, so clear it instead of redirecting to
  // another guarded route - that would bounce between guards forever.
  useEffect(() => {
    if (isAuthenticated && !isPersonnel) {
      AuthService.logout();
    }
  }, [isAuthenticated, isPersonnel]);

  if (!isAuthenticated || !isPersonnel) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default PersonnelOnlyRoute;
