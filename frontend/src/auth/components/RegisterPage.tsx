import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Container, Form, Button, Alert, Card } from 'react-bootstrap';
import * as AuthService from '../AuthService';
import '../../css/Forms.css';

/**
 * Registration page component that allows new users to create an account.
 * Includes form validation and error handling. Accounts are always created as
 * personnel; patients use the TV app and authenticate through Supabase.
 * Integrates with AuthService for API communication.
 */
const RegisterPage: React.FC = () => {
  // stores all registration form field values in a single state object
  const [formData, setFormData] = useState({
    fullName: '',
    email: '',
    phoneNumber: '',
    address: '',
    userName: '',
    password: '',
    confirmPassword: ''
  });
  
  // stores error message to display to user
  const [error, setError] = useState('');
  
  // stores success message to display to user
  const [success, setSuccess] = useState('');
  
  // tracks whether registration request is in progress
  const [isLoading, setIsLoading] = useState(false);
  
  // provides navigation function for redirecting after successful registration
  const navigate = useNavigate();

  /**
   * Handles changes to any form input or select field.
   * Updates the corresponding field in formData state.
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  /**
   * Handles registration form submission.
   * Validates input and attempts to create new user account via AuthService.
   * Redirects to login page on success.
   */
  const handleSubmit = async (e: React.FormEvent) => {
    // prevents default form submission behavior
    e.preventDefault();
    
    // clears any previous messages
    setError('');
    setSuccess('');

    // validates that password and confirm password match
    if (formData.password !== formData.confirmPassword) {
      setError('Passordene stemmer ikke overens');
      return;
    }

    // validates password meets minimum length requirement
    if (formData.password.length < 6) {
      setError('Passordet må være minst 6 tegn langt');
      return;
    }

    // validates email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Vennligst oppgi en gyldig e-postadresse');
      return;
    }

    // sets loading state to disable form during submission
    setIsLoading(true);

    try {
      // prepares registration data matching backend RegisterDto structure
      const registerDto = {
        userName: formData.userName,
        email: formData.email,
        password: formData.password,
        fullName: formData.fullName,
        phoneNumber: formData.phoneNumber || undefined,
        address: formData.address || undefined
      };

      // calls AuthService to register new user
      const result = await AuthService.register(registerDto);

      // handles successful registration
      if (result.success) {
        setSuccess('Registrering fullført! Sender deg til innlogging...');
        // redirects to login page after 2 seconds
        setTimeout(() => navigate('/login'), 2000);
      } else {
        // displays error message from backend
        setError(result.message || 'Registrering mislyktes. Prøv igjen.');
        setIsLoading(false);
      }
    } catch {
      // handles any unexpected errors during registration process
      setError('Det oppstod en feil under registrering. Prøv igjen.');
      setIsLoading(false);
    }
  };

  return (
    // centers registration form on page with max width constraint
    <Container className="auth-container">
      <Card className="auth-card">
        <Card.Body className="auth-card-body">
          {/* Header */}
          <div className="auth-header">
            <h2 className="auth-title">Opprett konto</h2>
            <p className="auth-subtitle">Opprett konto for helsepersonell</p>
          </div>
          
          {/* conditionally displays error alert if error exists */}
          {error && <Alert variant="danger">{error}</Alert>}
          
          {/* conditionally displays success alert if success message exists */}
          {success && <Alert variant="success">{success}</Alert>}
          
          {/* registration form with submit handler */}
          <Form onSubmit={handleSubmit} className="auth-form">
            {/* full name input field */}
            <Form.Group className="mb-3">
              <Form.Label>Fullt navn</Form.Label>
              <Form.Control
                type="text"
                name="fullName"
                value={formData.fullName}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
            </Form.Group>

            {/* email input field */}
            <Form.Group className="mb-3">
              <Form.Label>E-post</Form.Label>
              <Form.Control
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
            </Form.Group>

            {/* phone number input field - optional */}
            <Form.Group className="mb-3">
              <Form.Label>Telefonnummer (valgfritt)</Form.Label>
              <Form.Control
                type="tel"
                name="phoneNumber"
                value={formData.phoneNumber}
                onChange={handleChange}
                disabled={isLoading}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Adresse (valgfritt)</Form.Label>
              <Form.Control
                type="text"
                name="address"
                value={formData.address}
                onChange={handleChange}
                disabled={isLoading}
              />
            </Form.Group>

            {/* username input field */}
            <Form.Group className="mb-3">
              <Form.Label>Brukernavn</Form.Label>
              <Form.Control
                type="text"
                name="userName"
                value={formData.userName}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
            </Form.Group>

            {/* password input field */}
            <Form.Group className="mb-3">
              <Form.Label>Passord</Form.Label>
              <Form.Control
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
              <Form.Text className="text-muted">
                Må være minst 6 tegn langt
              </Form.Text>
            </Form.Group>

            {/* confirm password input field for validation */}
            <Form.Group className="mb-3">
              <Form.Label>Bekreft passord</Form.Label>
              <Form.Control
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                disabled={isLoading}
              />
            </Form.Group>

            {/* submit button - disabled during loading with spinner */}
            <Button variant="secondary" type="submit" className="w-100" disabled={isLoading}>
              {isLoading ? 'Registrerer...' : 'Registrer'}
            </Button>
          </Form>

          {/* Footer */}
          <div className="auth-footer">
            <p className="mb-0">
              Har du allerede en konto? <Link to="/login">Logg inn her</Link>
            </p>
          </div>
        </Card.Body>
      </Card>
    </Container>
  );
};

export default RegisterPage;
