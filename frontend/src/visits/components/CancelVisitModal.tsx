import React, { useState } from 'react';
import { Modal, Button, Form, Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [reason, setReason] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  const resetForm = () => {
    setReason('');
    setNotes('');
    setError('');
    setSubmitting(false);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleConfirm = async () => {
    if (!reason) {
      setError(t('Velg en årsak før du avslutter besøket.'));
      return;
    }
    try {
      setSubmitting(true);
      await onConfirm(reason, notes);
    } catch {
      setError(t('Kunne ikke lagre. Prøv igjen.'));
      setSubmitting(false);
    }
  };

  return (
    <Modal show={show} onHide={handleClose} onShow={resetForm} centered>
      <Modal.Header closeButton>
        <Modal.Title>{t('Avbryt besøk')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}</Alert>}
        <p className="fw-semibold">{t('Hvorfor kunne ikke besøket gjennomføres?')}</p>
        <Form>
          {REASONS.map((r) => (
            <Form.Check
              key={r}
              type="radio"
              name="cancel-reason"
              id={`cancel-reason-${r}`}
              label={t(r)}
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
            />
          ))}
          <Form.Group className="mt-3">
            <Form.Label>{t('Notat (valgfritt)')}</Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('Utfyllende informasjon...')}
            />
          </Form.Group>
        </Form>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={handleClose} disabled={submitting}>
          {t('Avbryt')}
        </Button>
        <Button variant="danger" onClick={handleConfirm} disabled={submitting}>
          {submitting ? t('Lagrer...') : t('Lagre og avslutt besøk')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default CancelVisitModal;
