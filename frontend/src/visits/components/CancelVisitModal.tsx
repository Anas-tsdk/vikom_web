import React, { useEffect, useState } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';

interface CancelVisitModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: (reason: string, notes: string) => Promise<void> | void;
}

// Suggested reasons a homecare visit could not be completed.
const REASONS = [
  'Pasienten svarte ikke',
  'Pasienten avviste samtalen',
  'Pasienten var ikke tilgjengelig',
  'Teknisk problem',
  'Feil avtale / feil pasient',
  'Besøket ble avbrutt',
  'Annet',
];

/**
 * Reason modal shown when a nurse marks a visit as not completed. Captures a
 * required reason and an optional note so another staff member can later
 * understand what happened.
 */
const CancelVisitModal: React.FC<CancelVisitModalProps> = ({ show, onClose, onConfirm }) => {
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Reset the form each time the modal opens.
  useEffect(() => {
    if (show) {
      setReason('');
      setNotes('');
      setError('');
      setSubmitting(false);
    }
  }, [show]);

  const handleConfirm = async () => {
    if (!reason) {
      setError('Velg en årsak før du avslutter besøket.');
      return;
    }
    try {
      setSubmitting(true);
      await onConfirm(reason, notes);
    } catch {
      setError('Kunne ikke lagre. Prøv igjen.');
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Avbryt besøk</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        <p className="fw-semibold">Hvorfor kunne ikke besøket gjennomføres?</p>
        <Form>
          {REASONS.map((r) => (
            <Form.Check
              key={r}
              type="radio"
              name="cancel-reason"
              id={`cancel-reason-${r}`}
              label={r}
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
            />
          ))}
          <Form.Group className="mt-3">
            <Form.Label>Notat (valgfritt)</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Utfyllende informasjon..."
            />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose} disabled={submitting}>
          Avbryt
        </Button>
        <Button variant="danger" onClick={handleConfirm} disabled={submitting}>
          {submitting ? 'Lagrer...' : 'Lagre og avslutt besøk'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default CancelVisitModal;
