import React, { useState } from 'react';
import { Modal } from 'react-bootstrap';
import AvailabilityForm from './AvailabilityForm';
import type { Availability } from '../types/availability';

interface AvailabilityModalProps {
  show: boolean;
  onClose: () => void;
  initialData?: Availability;
  onSubmit: (data: Availability) => Promise<void>;
}

const AvailabilityModal: React.FC<AvailabilityModalProps> = ({ show, onClose, initialData, onSubmit }) => {
  const [submitError, setSubmitError] = useState<string | null>(null);
  
  const handleSubmit = async (data: Availability) => {
    try {
      setSubmitError(null);
      await onSubmit(data);
      onClose();
    } catch (error) {
      console.error('Error submitting availability:', error);
      setSubmitError('Kunne ikke sende inn tilgjengelighet. Vennligst prøv igjen.');
    }
  };

  return (
    <Modal show={show} onHide={onClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{initialData ? 'Rediger tilgjengelighetsluke' : 'Legg til tilgjengelighetsluke'}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {submitError && (
          <div className="alert alert-danger" role="alert">
            {submitError}
          </div>
        )}
        <AvailabilityForm
          initialData={initialData}
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      </Modal.Body>
    </Modal>
  );
};

export default AvailabilityModal;
