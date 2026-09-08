import React from 'react';
import { Navigate } from 'react-router-dom';
import * as AuthService from '../AuthService';

interface PublicOnlyRouteProps {
  children: React.ReactElement;
}

/**
 * Protects routes that should only be accessible to non-authenticated users.
 * Redirects authenticated users to the dashboard.
 * Used for login and register pages.
 */
const PublicOnlyRoute: React.FC<PublicOnlyRouteProps> = ({ children }) => {
  const isAuthenticated = AuthService.isAuthenticated();
  
  // If user is already logged in, redirect to dashboard
  return isAuthenticated ? <Navigate to="/dashboard" replace /> : children;
};

export default PublicOnlyRoute;
