import React, { useState } from 'react';
import { Navbar, Container, Nav, NavDropdown } from 'react-bootstrap';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import * as AuthService from '../auth/AuthService';
import './NavBar.css';

const NavBar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isAuthenticated = AuthService.isAuthenticated();
  const userInfo = AuthService.getUserInfo();
  const role = userInfo?.role;
  const [showMobileMenu, setShowMobileMenu] = useState(false);

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
                    Oversikt
                  </Nav.Link>

                  {role === 'Personnel' && (
                    <>
                      <Nav.Link 
                        as={Link} 
                        to="/availability" 
                        onClick={closeMobileMenu}
                        className={isActive('/availability') ? 'active' : ''}
                      >
                        Min kalender
                      </Nav.Link>
                      <Nav.Link 
                        as={Link} 
                        to="/patients" 
                        onClick={closeMobileMenu}
                        className={isActive('/patients') ? 'active' : ''}
                      >
                        Mine pasienter
                      </Nav.Link>
                    </>
                  )}
                </div>

                {/* Desktop: User dropdown with fullName */}
                <div className="user-dropdown-wrapper d-none d-lg-flex">
                  <NavDropdown 
                    title={<><p className="user-dropdown-title"><i className="bi bi-person-circle"></i> {userInfo.fullName}</p></>} 
                    id="account-dropdown" 
                    align="end"
                    className="user-dropdown"
                  >
                    
                    <NavDropdown.Item onClick={handleLogout} className="dropdown-logout">
                      Logg ut
                    </NavDropdown.Item>
                  </NavDropdown>
                </div>

                {/* Mobile: Direct logout button without dropdown */}
                <div className="d-lg-none mobile-logout-wrapper">
                  <Nav.Link onClick={handleLogout} className="mobile-logout-btn">
                    Logg ut
                  </Nav.Link>
                </div>
              </>
            ) : (
              // displays login and register buttons when not authenticated
              <div className="auth-buttons-wrapper">
                <Nav.Link as={Link} to="/login" className="auth-btn-login">
                  Logg inn
                </Nav.Link>
                <Nav.Link as={Link} to="/register" className="auth-btn-register">
                  Registrer
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
