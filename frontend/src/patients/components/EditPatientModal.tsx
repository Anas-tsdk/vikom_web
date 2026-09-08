import React, { useEffect, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import type { PatientDetailsDto } from '../types/patient';
import PatientService from '../services/PatientService';
import SupabaseProfileField, { type SupabaseLinkValue } from './SupabaseProfileField';

// The link carries only the Supabase profile id. The display name is resolved
// from Supabase by SupabaseProfileField — deliberately NOT from patient.username,
// which is this patient's local URL handle and a different thing entirely.
const toLinkValue = (patient: PatientDetailsDto): SupabaseLinkValue | null =>
  patient.supabaseProfileId
    ? { supabaseProfileId: patient.supabaseProfileId, username: null }
    : null;

interface EditPatientModalProps {
  show: boolean;
  onHide: () => void;
  patient: PatientDetailsDto;
  onSaved: (updated: PatientDetailsDto) => void;
}

/**
 * Modal form for editing a patient's contact details
 * (name, email, phone, address).
 */
const EditPatientModal: React.FC<EditPatientModalProps> = ({ show, onHide, patient, onSaved }) => {
  const [fullName, setFullName] = useState<string>(patient.fullName);
  const [email, setEmail] = useState<string>(patient.email);
  const [phoneNumber, setPhoneNumber] = useState<string>(patient.phoneNumber);
  const [address, setAddress] = useState<string>(patient.address ?? '');
  const [supabaseLink, setSupabaseLink] = useState<SupabaseLinkValue | null>(toLinkValue(patient));
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Reset the form to the current patient whenever the modal is (re)opened.
  useEffect(() => {
    if (show) {
      setFullName(patient.fullName);
      setEmail(patient.email);
      setPhoneNumber(patient.phoneNumber);
      setAddress(patient.address ?? '');
      setSupabaseLink(toLinkValue(patient));
      setError('');
    }
  }, [show, patient]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!fullName.trim() || !email.trim()) {
      setError('Navn og e-post er påkrevd.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      const updated = await PatientService.update(patient.id, {
        fullName: fullName.trim(),
        email: email.trim(),
        phoneNumber: phoneNumber.trim() || null,
        address: address.trim(),
        supabaseProfileId: supabaseLink?.supabaseProfileId ?? null,
      });
      onSaved(updated);
      onHide();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kunne ikke lagre endringene. Prøv igjen.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered>
      <Form onSubmit={handleSubmit}>
        <Modal.Header closeButton>
          <Modal.Title>Rediger pasientinformasjon</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error && <Alert variant="danger">{error}</Alert>}

          <Form.Group className="mb-3" controlId="editPatientName">
            <Form.Label>Fullt navn</Form.Label>
            <Form.Control
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="editPatientEmail">
            <Form.Label>E-post</Form.Label>
            <Form.Control
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="editPatientPhone">
            <Form.Label>Telefon</Form.Label>
            <Form.Control
              type="tel"
              value={phoneNumber}
              onChange={(e) => setPhoneNumber(e.target.value)}
            />
          </Form.Group>

          <Form.Group className="mb-3" controlId="editPatientAddress">
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
                Lagrer...
              </>
            ) : (
              'Lagre endringer'
            )}
          </Button>
        </Modal.Footer>
      </Form>
    </Modal>
  );
};

export default EditPatientModal;
