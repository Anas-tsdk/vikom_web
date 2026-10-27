import React from 'react';
import { Nav } from 'react-bootstrap';
import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getUserInfo } from '../auth/AuthService';
import { isHeadNurseRole, isPortalRole } from '../auth/roles';
import './Sidebar.css';
import useDailyCheckInAlertCount from '../checkins/hooks/useDailyCheckInAlertCount';

const Sidebar: React.FC = () => {
  const location = useLocation();
  const { t } = useTranslation();
  const userInfo = getUserInfo();
  const role = userInfo?.role;
  const checkInAlertCount = useDailyCheckInAlertCount();

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
          {t('Oversikt')}
        </Nav.Link>

        {/* Personnel navigation */}
        {isPortalRole(role) && (
          <>
            <Nav.Link 
              as={Link} 
              to="/availability" 
              className={isActive('/availability') ? 'active' : ''}
            >
              <i className="bi bi-calendar4" aria-hidden="true"></i>
              {t('Tilgjengelighet')}
            </Nav.Link>
            <Nav.Link 
              as={Link} 
              to="/appointments" 
              className={isActive('/appointments') ? 'active' : ''}
            >
              <i className="bi bi-briefcase" aria-hidden="true"></i>
              {t('Avtaler')}
            </Nav.Link>
            {isHeadNurseRole(role) && (
              <Nav.Link
                as={Link}
                to="/alerts"
                className={isActive('/alerts') ? 'active' : ''}
              >
                <i className="bi bi-shield-exclamation" aria-hidden="true"></i>
                {t('Trygghetsvarsler')}
                {checkInAlertCount > 0 && (
                  <span className="badge rounded-pill text-bg-danger ms-auto">{checkInAlertCount}</span>
                )}
              </Nav.Link>
            )}
            {isHeadNurseRole(role) && (
              <Nav.Link
                as={Link}
                to="/appointments/cancelled"
                className={isActive('/appointments/cancelled') ? 'active' : ''}
              >
                <i className="bi bi-calendar-x" aria-hidden="true"></i>
                {t('Patient declined')}
              </Nav.Link>
            )}
            <Nav.Link 
              as={Link} 
              to="/patients" 
              className={isActive('/patients') ? 'active' : ''}
            >
              <i className="bi bi-people" aria-hidden="true"></i>
              {t('Pasienter')}
            </Nav.Link>
            <Nav.Link 
              as={Link} 
              to="/planning" 
              className={isActive('/planning') ? 'active' : ''}
            >
              <i className="bi bi-list-ul" aria-hidden="true"></i>
              {t('Planlegging')}
            </Nav.Link>
            {isHeadNurseRole(role) && (
              <Nav.Link
                as={Link}
                to="/nurses"
                className={isActive('/nurses') ? 'active' : ''}
              >
                <i className="bi bi-person-badge" aria-hidden="true"></i>
                {t('Sykepleiere')}
              </Nav.Link>
            )}
          </>
        )}
      </Nav>
    </div>
  );
};

export default Sidebar;
