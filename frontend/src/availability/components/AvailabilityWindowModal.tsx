import React from 'react';
import { Modal } from 'react-bootstrap';
import AvailabilityWindowForm from './AvailabilityWindowForm';
import type { AvailabilityWindow, CreateAvailabilityWindowDto, UpdateAvailabilityWindowDto } from '../types/availability';

interface AvailabilityWindowModalProps {
  show: boolean;
  onClose: () => void;
  initialData?: AvailabilityWindow;
  selectedDate: string;
  onSubmit: (data: CreateAvailabilityWindowDto | UpdateAvailabilityWindowDto) => Promise<void>;
  onDelete?: () => Promise<void>;
}

const AvailabilityWindowModal: React.FC<AvailabilityWindowModalProps> = ({
  show,
  onClose,
  initialData,
  selectedDate,
  onSubmit,
  onDelete,
}) => {
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const handleSubmit = async (data: CreateAvailabilityWindowDto | UpdateAvailabilityWindowDto) => {
    try {
      setSubmitError(null);
      setIsSubmitting(true);
      await onSubmit(data);
      onClose();
    } catch (error: any) {
      console.error('Error submitting availability window:', error);
      setSubmitError(error.message || 'Kunne ikke sende inn. Vennligst prøv igjen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;

    if (!window.confirm('Er du sikker på at du vil slette dette tilgjengelighetsvinduet?')) {
      return;
    }

    try {
      setSubmitError(null);
      setIsSubmitting(true);
      await onDelete();
      onClose();
    } catch (error: any) {
      console.error('Error deleting availability window:', error);
      setSubmitError(error.message || 'Kunne ikke slette. Vennligst prøv igjen.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setSubmitError(null);
    onClose();
  };

  return (
    <Modal show={show} onHide={handleClose} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>
          {initialData ? 'Rediger tilgjengelighet' : 'Opprett tilgjengelighet'}
        </Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {submitError && (
          <div className="alert alert-danger" role="alert">
            {submitError}
          </div>
        )}
        <AvailabilityWindowForm
          initialData={initialData}
          selectedDate={selectedDate}
          onSubmit={handleSubmit}
          onCancel={handleClose}
          onDelete={onDelete ? handleDelete : undefined}
          isSubmitting={isSubmitting}
        />
      </Modal.Body>
    </Modal>
  );
};

export default AvailabilityWindowModal;
