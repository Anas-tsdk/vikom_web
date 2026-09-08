import React, { useState } from 'react';
import { Modal, Alert } from 'react-bootstrap';
import AppointmentForm from './AppointmentForm';
import type { Appointment } from '../types/appointment';

interface AppointmentModalProps {
  show: boolean;
  onClose: () => void;
  initialData?: Appointment;
  onSubmit: (data: Appointment) => Promise<void>;
}

const AppointmentModal: React.FC<AppointmentModalProps> = ({ show, onClose, initialData, onSubmit }) => {
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const handleSubmit = async (data: Appointment) => {
    try {
      setSubmitError(null);
      await onSubmit(data);
      onClose();
    } catch (error: any) {
      // Extract error message from response
      let errorMessage = 'Kunne ikke sende inn avtalen. Vennligst prøv igjen.';
      if (error.response?.data) {
        errorMessage = typeof error.response.data === 'string' 
          ? error.response.data 
          : error.response.data.message || errorMessage;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setSubmitError(errorMessage);    }
  };

  const handleClose = () => {
    setSubmitError(null);
    onClose();
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{initialData ? 'Rediger avtale' : 'Ny avtale'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {submitError && (
          <Alert variant="danger" dismissible onClose={() => setSubmitError(null)}>
            {submitError}
          </Alert>
        )}
        <AppointmentForm
          initialData={initialData}
          onSubmit={handleSubmit}
          onCancel={handleClose}
        />
      </Modal.Body>
    </Modal>
  );
};

export default AppointmentModal;
