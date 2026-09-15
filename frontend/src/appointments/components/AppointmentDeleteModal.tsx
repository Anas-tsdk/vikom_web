import React, { useState } from 'react';
import { Modal, Button, Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const translatedDescription = appointmentDescription
    ?.split(',')
    .map((task) => t(task.trim()))
    .join(', ');

  const handleConfirm = async () => {
    try {
      setError(null);
      setIsDeleting(true);
      await onConfirm();
      onClose();
    } catch (error: unknown) {
      console.error('Error deleting appointment:', error);
      
      // Extract error message from response
      let errorMessage = t('Kunne ikke avbryte avtalen. Vennligst prøv igjen.');
      if (error instanceof Error && error.message) {
        errorMessage = t(error.message);
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
        <Modal.Title>{t('Avbryt avtale')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && (
          <Alert variant="danger" dismissible onClose={() => setError(null)}>
            {error}
          </Alert>
        )}
        <p>{t('Er du sikker på at du vil avbryte denne avtalen?')}</p>
        {appointmentDescription && (
          <p className="text-muted">
            <strong>{t('Oppgave:')}</strong> {translatedDescription}
          </p>
        )}
        <div className="alert alert-warning">
          <i className="bi bi-exclamation-triangle me-2"></i>
          <strong>{t('Merk:')}</strong> {t('Avtaler kan kun avbestilles minst 24 timer før avtalt tid.')}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={handleClose} disabled={isDeleting}>
          {t('Nei, behold')}
        </Button>
        <Button variant="danger" onClick={handleConfirm} disabled={isDeleting}>
          {isDeleting ? t('Avbryter...') : t('Ja, avbryt avtalen')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default AppointmentDeleteModal;
