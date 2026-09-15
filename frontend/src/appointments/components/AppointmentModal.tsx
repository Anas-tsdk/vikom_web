import React, { useState } from 'react';
import { Modal, Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import AppointmentForm from './AppointmentForm';
import type { Appointment } from '../types/appointment';

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
          errorMessage = t(response.data);
        } else if (response?.data && typeof response.data === 'object' && 'message' in response.data) {
          const message = (response.data as { message?: unknown }).message;
          if (typeof message === 'string') errorMessage = t(message);
        }
      } else if (error instanceof Error && error.message) {
        errorMessage = t(error.message);
      }
      
      setSubmitError(errorMessage);
    }
  };

  const handleClose = () => {
    setSubmitError(null);
    onClose();
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg">
      <Modal.Header closeButton>
          <Modal.Title>{initialData ? t('Rediger avtale') : t('Ny avtale')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {submitError && (
          <Alert variant="danger" dismissible onClose={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        )}
        <AppointmentForm
          initialData={initialData}
          defaultPersonnelId={defaultPersonnelId}
          onSubmit={handleSubmit}
          onCancel={handleClose}
        />
      </Modal.Body>
    </Modal>
  );
};

export default AppointmentModal;
