import React from 'react';
import { Nav } from 'react-bootstrap';
import { Link, useLocation } from 'react-router-dom';
import { getUserInfo } from '../auth/AuthService';
import './Sidebar.css';

const Sidebar: React.FC = () => {
  const location = useLocation();
  const userInfo = getUserInfo();
  const role = userInfo?.role;

  // checks if current route matches the given path
  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="sidebar border-end">
      {/* Brand logo at the top of sidebar */}
      <div className="sidebar-brand">
        <Link to="/dashboard">
          <img 
            src="/logo-placeholder-transparent.png" 
            alt="Vikom Logo" 
            className="sidebar-logo"
          />
        </Link>
      </div>

      {/* Navigation links */}
      <Nav className="flex-column sidebar-nav">
        {/* Dashboard - available to all roles */}
        <Nav.Link 
          as={Link} 
          to="/dashboard" 
          className={isActive('/dashboard') ? 'active' : ''}
        >
          <i className="bi bi-grid" aria-hidden="true"></i>
          Oversikt
        </Nav.Link>

        {/* Personnel navigation */}
        {role === 'Personnel' && (
          <>
            <Nav.Link 
              as={Link} 
              to="/availability" 
              className={isActive('/availability') ? 'active' : ''}
            >
              <i className="bi bi-calendar4" aria-hidden="true"></i>
              Kalender
            </Nav.Link>
            <Nav.Link 
              as={Link} 
              to="/appointments" 
              className={isActive('/appointments') ? 'active' : ''}
            >
              <i className="bi bi-briefcase" aria-hidden="true"></i>
              Avtaler
            </Nav.Link>
            <Nav.Link 
              as={Link} 
              to="/patients" 
              className={isActive('/patients') ? 'active' : ''}
            >
              <i className="bi bi-people" aria-hidden="true"></i>
              Pasienter
            </Nav.Link>
            <Nav.Link 
              as={Link} 
              to="/planning" 
              className={isActive('/planning') ? 'active' : ''}
            >
              <i className="bi bi-list-ul" aria-hidden="true"></i>
              Planlegging
            </Nav.Link>
          </>
        )}
      </Nav>
    </div>
  );
};

export default Sidebar;
