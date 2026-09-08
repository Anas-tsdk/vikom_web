import React from 'react';
import { Modal, Button } from 'react-bootstrap';

interface AvailabilityDeleteModalProps {
  show: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  availabilityDate?: string;
  isBooked?: boolean;
}

const AvailabilityDeleteModal: React.FC<AvailabilityDeleteModalProps> = ({
  show,
  onClose,
  onConfirm,
  availabilityDate,
  isBooked,
}) => {
  const handleConfirm = async () => {
    try {
      await onConfirm();
      onClose();
    } catch (error) {
      console.error('Error deleting availability:', error);
    }
  };

  return (
    <Modal show={show} onHide={onClose}>
      <Modal.Header closeButton>
        <Modal.Title>Slett tilgjengelighetsluke</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isBooked ? (
          <div>
            <p className="text-danger">
              <strong>Denne tilgjengelighetsluken er allerede booket og kan ikke slettes.</strong>
            </p>
            {availabilityDate && (
              <p className="text-muted">
                <strong>Dato:</strong> {new Date(availabilityDate).toLocaleDateString('nb-NO')}
              </p>
            )}
          </div>
        ) : (
          <div>
            <p>Er du sikker på at du vil slette denne tilgjengelighetsluken?</p>
            {availabilityDate && (
              <p className="text-muted">
                <strong>Dato:</strong> {new Date(availabilityDate).toLocaleDateString('nb-NO')}
              </p>
            )}
            <p className="text-danger">Denne handlingen kan ikke angres.</p>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>
          {isBooked ? 'Lukk' : 'Avbryt'}
        </Button>
        {!isBooked && (
          <Button variant="danger" onClick={handleConfirm}>
            Slett
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default AvailabilityDeleteModal;
