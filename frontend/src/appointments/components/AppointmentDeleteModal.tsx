import React, { useState } from 'react';
import { Modal, Button, Alert } from 'react-bootstrap';

interface AppointmentDeleteModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  appointmentDescription?: string;
}

const AppointmentDeleteModal: React.FC<AppointmentDeleteModalProps> = ({
  show,
  onClose,
  onConfirm,
  appointmentDescription,
}) => {
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirm = async () => {
    try {
      setError(null);
      setIsDeleting(true);
      await onConfirm();
      onClose();
    } catch (error: any) {
      console.error('Error deleting appointment:', error);
      
      // Extract error message from response
      let errorMessage = 'Kunne ikke avbryte avtalen. Vennligst prøv igjen.';
      if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleClose = () => {
    setError(null);
    onClose();
  };

  return (
    <Modal show={show} onHide={handleClose}>
      <Modal.Header closeButton>
        <Modal.Title>Avbryt avtale</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        <p>Er du sikker på at du vil avbryte denne avtalen?</p>
        {appointmentDescription && (
          <p className="text-muted">
            <strong>Oppgave:</strong> {appointmentDescription}
          </p>
        )}
        <div className="alert alert-warning">
          <i className="bi bi-exclamation-triangle me-2"></i>
          <strong>Merk:</strong> Avtaler kan kun avbestilles minst 24 timer før avtalt tid.
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={handleClose} disabled={isDeleting}>
          Nei, behold
        </Button>
        <Button variant="danger" onClick={handleConfirm} disabled={isDeleting}>
          {isDeleting ? 'Avbryter...' : 'Ja, avbryt avtalen'}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default AppointmentDeleteModal;
