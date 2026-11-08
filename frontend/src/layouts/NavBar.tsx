import React, { useState } from 'react';
import { Navbar, Container, Nav, NavDropdown } from 'react-bootstrap';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as AuthService from '../auth/AuthService';
import type { SupportedLanguage } from '../i18n';
import { isHeadNurseRole, isPortalRole } from '../auth/roles';
import './NavBar.css';

const languageOptions: ReadonlyArray<{
  code: SupportedLanguage;
  labelKey: 'Norsk' | 'Engelsk' | 'Tysk' | 'Finsk' | 'Svensk' | 'Fransk' | 'Nederlandsk';
}> = [
  { code: 'no', labelKey: 'Norsk' },
  { code: 'en', labelKey: 'Engelsk' },
  { code: 'de', labelKey: 'Tysk' },
  { code: 'fi', labelKey: 'Finsk' },
  { code: 'sv', labelKey: 'Svensk' },
  { code: 'fr', labelKey: 'Fransk' },
  { code: 'nl', labelKey: 'Nederlandsk' },
];

const NavBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { t, i18n } = useTranslation();
  const isAuthenticated = AuthService.isAuthenticated();
  const userInfo = AuthService.getUserInfo();
  const role = userInfo?.role;
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showLanguageMenu, setShowLanguageMenu] = useState(false);

  // handles logout action
  const handleLogout = () => {
    AuthService.logout();
    navigate('/login');
  };

  // toggles mobile menu visibility
  const toggleMobileMenu = () => {
    setShowMobileMenu(!showMobileMenu);
  };

  // closes mobile menu when a link is clicked
  const closeMobileMenu = () => {
    setShowMobileMenu(false);
  };

  // checks if current route matches the given path
  const isActive = (path: string) => location.pathname === path;

  // determines if logo should be shown in navbar (only when not authenticated)
  const showLogoInNavbar = !isAuthenticated;

  const changeLanguage = (language: SupportedLanguage) => {
    void i18n.changeLanguage(language);
  };

  const currentLanguage = i18n.resolvedLanguage?.split('-')[0];
  const translatedRole = isHeadNurseRole(role) ? t('Ledende sykepleier') : t('Sykepleier');

  return (
    <Navbar expand="lg" className={`navbar-container ${isAuthenticated ? 'navbar-with-sidebar' : ''}`}>
      <Container fluid>
        {/* Conditionally renders logo only when user is not authenticated */}
        {showLogoInNavbar && (
          <Navbar.Brand as={Link} to="/">
            <img 
              src="/logo-placeholder-transparent-2.png" 
              alt="Vikom Logo" 
              className="navbar-logo d-inline-block align-top"
            />
          </Navbar.Brand>
        )}
        
        <Navbar.Toggle 
          aria-controls="navbar-nav" 
          onClick={toggleMobileMenu}
          className="ms-auto"
        />
        
        <Navbar.Collapse id="navbar-nav" in={showMobileMenu}>
          <Nav className="ms-auto">
            {isAuthenticated && userInfo ? (
              <>
                {/* Mobile menu - shows sidebar items in dropdown on mobile */}
                <div className="mobile-sidebar-menu d-lg-none">
                  <Nav.Link 
                    as={Link} 
                    to="/dashboard" 
                    onClick={closeMobileMenu}
                    className={isActive('/dashboard') ? 'active' : ''}
                  >
                    {t('Oversikt')}
                  </Nav.Link>

                  {isPortalRole(role) && (
                    <>
                      <Nav.Link 
                        as={Link} 
                        to="/availability" 
                        onClick={closeMobileMenu}
                        className={isActive('/availability') ? 'active' : ''}
                      >
                        {t('Min kalender')}
                      </Nav.Link>
                      <Nav.Link 
                        as={Link} 
                        to="/patients" 
                        onClick={closeMobileMenu}
                        className={isActive('/patients') ? 'active' : ''}
                      >
                        {t('Mine pasienter')}
                      </Nav.Link>
                      <Nav.Link
                        as={Link}
                        to="/appointments"
                        onClick={closeMobileMenu}
                        className={isActive('/appointments') ? 'active' : ''}
                      >
                        {t('Avtaler')}
                      </Nav.Link>
                      {isHeadNurseRole(role) && (
                        <Nav.Link
                          as={Link}
                          to="/appointments/create"
                          onClick={closeMobileMenu}
                          className={`nav-link-create-appointment ${isActive('/appointments/create') ? 'active' : ''}`}
                        >
                          <i className="bi bi-calendar-plus me-2" aria-hidden="true"></i>
                          {t('Opprett avtale')}
                        </Nav.Link>
                      )}
                      {isHeadNurseRole(role) && (
                        <Nav.Link
                          as={Link}
                          to="/appointments/cancelled"
                          onClick={closeMobileMenu}
                          className={isActive('/appointments/cancelled') ? 'active' : ''}
                        >
                          {t('Patient declined')}
                        </Nav.Link>
                      )}
                      <Nav.Link
                        as={Link}
                        to="/planning"
                        onClick={closeMobileMenu}
                        className={isActive('/planning') ? 'active' : ''}
                      >
                        {t('Daily route')}
                      </Nav.Link>
                      {isPortalRole(role) && (
                        <Nav.Link
                          as={Link}
                          to="/nurses"
                          onClick={closeMobileMenu}
                          className={isActive('/nurses') ? 'active' : ''}
                        >
                          {t('Sykepleiere')}
                        </Nav.Link>
                      )}
                    </>
                  )}
                </div>

                {/* Desktop: User dropdown with fullName */}
                <div className="user-dropdown-wrapper d-none d-lg-flex">
                  <NavDropdown 
                    title={(
                      <span className="user-dropdown-title">
                        <i className="bi bi-person-circle" aria-hidden="true"></i>
                        <span className="user-dropdown-identity">
                          <span>{userInfo.fullName}</span>
                          {isPortalRole(role) && <small>{translatedRole}</small>}
                        </span>
                      </span>
                    )}
                    id="account-dropdown" 
                    align="end"
                    className="user-dropdown"
                    onToggle={(isOpen) => {
                      if (!isOpen) setShowLanguageMenu(false);
                    }}
                  >
                    <button
                      type="button"
                      className="dropdown-item language-menu-toggle"
                      aria-expanded={showLanguageMenu}
                      aria-controls="account-language-options"
                      onClick={(event) => {
                        event.stopPropagation();
                        setShowLanguageMenu((isOpen) => !isOpen);
                      }}
                    >
                      <span className="language-menu-label">
                        <i className="bi bi-globe2" aria-hidden="true"></i>
                        {t('Språk')}
                      </span>
                      <i
                        className={`bi ${showLanguageMenu ? 'bi-chevron-up' : 'bi-chevron-down'}`}
                        aria-hidden="true"
                      ></i>
                    </button>
                    {showLanguageMenu && (
                      <div
                        id="account-language-options"
                        className="language-options"
                        role="group"
                        aria-label={t('Språk')}
                      >
                        {languageOptions.map(({ code, labelKey }) => {
                          const isSelected = currentLanguage === code;

                          return (
                            <button
                              type="button"
                              className={`dropdown-item language-option ${isSelected ? 'active' : ''}`}
                              key={code}
                              aria-pressed={isSelected}
                              onClick={(event) => {
                                event.stopPropagation();
                                changeLanguage(code);
                              }}
                            >
                              <span>{t(labelKey)}</span>
                              {isSelected && (
                                <i className="bi bi-check2" aria-hidden="true"></i>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <NavDropdown.Divider />
                    <NavDropdown.Item onClick={handleLogout} className="dropdown-logout">
                      {t('Logg ut')}
                    </NavDropdown.Item>
                  </NavDropdown>
                </div>

                <div className="d-lg-none mobile-account-tools">
                  <div className="mobile-account-summary">
                    <i className="bi bi-person-circle" aria-hidden="true"></i>
                    <span className="user-dropdown-identity">
                      <span>{userInfo.fullName}</span>
                      {isPortalRole(role) && <small>{translatedRole}</small>}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="mobile-language-toggle"
                    aria-expanded={showLanguageMenu}
                    aria-controls="mobile-language-options"
                    onClick={() => setShowLanguageMenu((isOpen) => !isOpen)}
                  >
                    <span className="language-menu-label">
                      <i className="bi bi-globe2" aria-hidden="true"></i>
                      {t('Språk')}
                    </span>
                    <i
                      className={`bi ${showLanguageMenu ? 'bi-chevron-up' : 'bi-chevron-down'}`}
                      aria-hidden="true"
                    ></i>
                  </button>
                  {showLanguageMenu && (
                    <div
                      id="mobile-language-options"
                      className="mobile-language-options"
                      role="group"
                      aria-label={t('Språk')}
                    >
                      {languageOptions.map(({ code, labelKey }) => {
                        const isSelected = currentLanguage === code;

                        return (
                          <button
                            type="button"
                            className={`mobile-language-option ${isSelected ? 'active' : ''}`}
                            key={code}
                            aria-pressed={isSelected}
                            onClick={() => changeLanguage(code)}
                          >
                            <span>{t(labelKey)}</span>
                            {isSelected && <i className="bi bi-check2" aria-hidden="true"></i>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  <Nav.Link onClick={handleLogout} className="mobile-logout-btn">
                    {t('Logg ut')}
                  </Nav.Link>
                </div>
              </>
            ) : (
              // displays login and register buttons when not authenticated
              <div className="auth-buttons-wrapper">
                <Nav.Link as={Link} to="/login" className="auth-btn-login">
                  {t('Logg inn')}
                </Nav.Link>
                <Nav.Link as={Link} to="/register" className="auth-btn-register">
                  {t('Registrer')}
                </Nav.Link>
              </div>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default NavBar;
