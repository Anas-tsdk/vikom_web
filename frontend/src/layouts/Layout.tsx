import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import NavBar from './NavBar';
import Sidebar from './Sidebar';
import * as AuthService from '../auth/AuthService';
import './Layout.css';

/**
 * Main layout component that wraps all pages in the application.
 * Conditionally renders NavBar and Sidebar based on route and authentication status.
 */
const Layout: React.FC = () => {
  // checks if user is currently authenticated
  const isAuthenticated = AuthService.isAuthenticated();
  
  // gets current route location
  const location = useLocation();
  
  // defines routes where sidebar should not be displayed
  const noSidebarRoutes = ['/login', '/register', '/'];
  
  // defines routes where navbar should not be displayed
  const noNavBarRoutes = ['/login', '/register'];
  
  // determines if sidebar should be shown (only for authenticated users on specific routes)
  const showSidebar = isAuthenticated && !noSidebarRoutes.includes(location.pathname);
  
  // determines if navbar should be shown (hidden on login and register pages)
  const showNavBar = !noNavBarRoutes.includes(location.pathname);

  return (
    <>
      {/* conditionally renders navbar based on current route */}
      {showNavBar && <NavBar />}
      
      {/* renders sidebar with content or content alone based on authentication and route */}
      {showSidebar ? (
        <div className="layout-with-sidebar">
          <Sidebar />
          <div className="content-with-sidebar">
            <Outlet />
          </div>
        </div>
      ) : (
        <div className={showNavBar ? "content-with-navbar" : ""}>
          <Outlet />
        </div>
      )}
    </>
  );
};

export default Layout;
