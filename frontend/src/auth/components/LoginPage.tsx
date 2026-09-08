import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, Form, Button, Alert, Card } from 'react-bootstrap';
import * as AuthService from '../AuthService';
import '../../css/Forms.css';

/**
 * Login page component that handles user authentication.
 * Provides a form for users to enter credentials and access the system.
 */
const LoginPage: React.FC = () => {
  // stores username input value
  const [userName, setUserName] = useState('');
  
  // stores password input value
  const [password, setPassword] = useState('');
  
  // stores error message to display to user
  const [error, setError] = useState('');
  
  // provides navigation function for redirecting after successful login
  const navigate = useNavigate();

  /**
   * Handles login form submission.
   * Validates credentials and redirects to dashboard on success.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    // prevents default form submission behavior
    e.preventDefault();
    
    // clears any previous error messages
    setError('');

    // attempts to authenticate user with provided credentials
    const result = await AuthService.login({ userName, password });

    // redirects to dashboard if login successful
    if (result.success) {
      navigate('/dashboard');
    } else {
      // displays the specific failure reason (bad credentials vs. server unreachable)
      setError(result.message ?? 'Feil brukernavn eller passord');
    }
  };

  return (
    // centers login form on page with max width constraint
    <Container className="auth-container">

      {/* ViKom Logo */}
      <div className="login-logo">
        <Link to="/">
          <img src="/logo-placeholder-transparent-2.png" alt="ViKom Logo" />
        </Link>
      </div>
      
      <Card className="auth-card">
        <Card.Body className="auth-card-body">
          {/* Header */}
        <div className="auth-header">
          <h2 className="auth-title">Velkommen tilbake</h2>
          <p className="auth-subtitle">Logg inn for å fortsette til ViKom</p>
        </div>
          
          {/* conditionally displays error alert if error exists */}
          {error && <Alert variant="danger">{error}</Alert>}
          
          {/* login form with submit handler */}
          <Form onSubmit={handleSubmit} className="auth-form">
            {/* username input field */}
            <Form.Group className="mb-3">
              <Form.Label>Brukernavn</Form.Label>
              <Form.Control
                type="text"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                required
              />
            </Form.Group>
            
            {/* password input field */}
            <Form.Group className="mb-3">
              <Form.Label>Passord</Form.Label>
              <Form.Control
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </Form.Group>
            
            {/* submit button */}
            <Button variant="secondary" type="submit" className="w-100">
              Logg inn
            </Button>
          </Form>

          {/* Footer */}
          <div className="auth-footer">
            <p className="mb-0">
              Har du ikke en konto? <Link to="/register">Registrer deg her</Link>
            </p>
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default LoginPage;
