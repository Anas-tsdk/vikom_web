import React, { useState } from 'react';
import { Modal, Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import AppointmentForm from './AppointmentForm';
import type { Appointment } from '../types/appointment';
import { translateApiMessage } from '../../i18n';

interface AppointmentModalProps {
  show: boolean;
  onClose: () => void;
  initialData?: Appointment;
  defaultPersonnelId?: string;
  onSubmit: (data: Appointment) => Promise<void>;
}

const AppointmentModal: React.FC<AppointmentModalProps> = ({
  show,
  onClose,
  initialData,
  defaultPersonnelId,
  onSubmit,
}) => {
  const { t } = useTranslation();
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const handleSubmit = async (data: Appointment) => {
    try {
      setSubmitError(null);
      await onSubmit(data);
      onClose();
    } catch (error: unknown) {
      // Extract error message from response
      let errorMessage = t('Kunne ikke sende inn avtalen. Vennligst prøv igjen.');
      if (error && typeof error === 'object' && 'response' in error) {
        const response = (error as { response?: { data?: unknown } }).response;
        if (typeof response?.data === 'string') {
          errorMessage = translateApiMessage(t, response.data);
        } else if (response?.data && typeof response.data === 'object' && 'message' in response.data) {
          const message = (response.data as { message?: unknown }).message;
          if (typeof message === 'string') errorMessage = translateApiMessage(t, message);
        }
      } else if (error instanceof Error && error.message) {
        errorMessage = translateApiMessage(t, error.message);
      }
      
      setSubmitError(errorMessage);
    }
  };

  const handleClose = () => {
    setSubmitError(null);
    onClose();
  };

  return (
    <>
      <Modal show={show} onHide={handleClose} size="lg">
        <Modal.Header closeButton>
          <Modal.Title>{initialData ? t('Rediger avtale') : t('Ny avtale')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <AppointmentForm
            initialData={initialData}
            defaultPersonnelId={defaultPersonnelId}
            onSubmit={handleSubmit}
            onCancel={handleClose}
          />
        </Modal.Body>
      </Modal>

      <Modal show={!!submitError} onHide={() => setSubmitError(null)} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('Kunne ikke lagre avtalen')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Alert variant="danger" className="mb-0">{submitError}</Alert>
        </Modal.Body>
        <Modal.Footer>
          <button className="btn btn-secondary" type="button" onClick={() => setSubmitError(null)}>
            {t('Lukk')}
          </button>
        </Modal.Footer>
      </Modal>
    </>
  );
};

export default AppointmentModal;
