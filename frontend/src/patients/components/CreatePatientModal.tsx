import React, { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import type { PatientDetailsDto } from '../types/patient';
import PatientService from '../services/PatientService';
import SupabaseProfileField, { type SupabaseLinkValue } from './SupabaseProfileField';

interface CreatePatientModalProps {
  show: boolean;
  onHide: () => void;
  onCreated: (created: PatientDetailsDto) => void;
}

/**
 * Modal form for registering a new patient: contact details plus the optional
 * Supabase link that connects them to the TV app. The new patient is added to
 * the logged-in nurse's patient list by the backend.
 */
const CreatePatientModal: React.FC<CreatePatientModalProps> = ({ show, onHide, onCreated }) => {
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [supabaseLink, setSupabaseLink] = useState<SupabaseLinkValue | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Start from a blank form every time the modal is opened.
  useEffect(() => {
    if (show) {
      setFullName('');
      setEmail('');
      setPhoneNumber('');
      setAddress('');
      setSupabaseLink(null);
      setError('');
    }
  }, [show]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim() || !email.trim()) {
      setError('Navn og e-post er påkrevd.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const created = await PatientService.create({
        fullName: fullName.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber.trim() || null,
        address: address.trim(),
        supabaseProfileId: supabaseLink?.supabaseProfileId ?? null,
      });
      onCreated(created);
      onHide();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke opprette pasienten. Prøv igjen.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>Ny pasient</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}

          <Form.Group className="mb-3" controlId="createPatientName">
            <Form.Label>Fullt navn</Form.Label>
            <Form.Control
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="createPatientEmail">
            <Form.Label>E-post</Form.Label>
            <Form.Control
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="createPatientPhone">
            <Form.Label>Telefon</Form.Label>
            <Form.Control
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="createPatientAddress">
            <Form.Label>Adresse</Form.Label>
            <Form.Control
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </Form.Group>

          <SupabaseProfileField value={supabaseLink} onChange={setSupabaseLink} />
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={onHide} disabled={saving}>
            Avbryt
          </Button>
          <Button variant="primary" type="submit" disabled={saving}>
            {saving ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Oppretter...
              </>
            ) : (
              'Opprett pasient'
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default CreatePatientModal;
