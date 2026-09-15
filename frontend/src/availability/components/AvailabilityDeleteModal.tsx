import React from 'react';
import { Modal, Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { localeForLanguage } from '../../i18n';

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
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.resolvedLanguage);
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
        <Modal.Title>{t('Slett tilgjengelighetsluke')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {isBooked ? (
          <div>
            <p className="text-danger">
              <strong>{t('Denne tilgjengelighetsluken er allerede booket og kan ikke slettes.')}</strong>
            </p>
            {availabilityDate && (
              <p className="text-muted">
                <strong>{t('Dato:')}</strong> {new Date(availabilityDate).toLocaleDateString(locale)}
              </p>
            )}
          </div>
        ) : (
          <div>
            <p>{t('Er du sikker på at du vil slette denne tilgjengelighetsluken?')}</p>
            {availabilityDate && (
              <p className="text-muted">
                <strong>{t('Dato:')}</strong> {new Date(availabilityDate).toLocaleDateString(locale)}
              </p>
            )}
            <p className="text-danger">{t('Denne handlingen kan ikke angres.')}</p>
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onClose}>
          {isBooked ? t('Lukk') : t('Avbryt')}
        </Button>
        {!isBooked && (
          <Button variant="danger" onClick={handleConfirm}>
            {t('Slett')}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  );
};

export default AvailabilityDeleteModal;
