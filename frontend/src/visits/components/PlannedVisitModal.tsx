import React from 'react';
import { Modal, Button } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import InfoRow from '../../components/common/InfoRow';
import TaskBadges from '../../components/common/TaskBadges';
import { localeForLanguage } from '../../i18n';

/** Minimal plan shape — satisfied by both Appointment and AppointmentSummary. */
export interface PlannedVisitData {
  patientName?: string;
  patientAddress?: string | null;
  date?: string;
  startTime?: string;
  endTime?: string;
  tasks: string;
  visitType?: string | null;
  availabilityNotes?: string | null;
}

interface PlannedVisitModalProps {
  show: boolean;
  onClose: () => void;
  appointment: PlannedVisitData | null;
}

const formatDate = (date: string | undefined, locale: string): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * Read-only "what is planned to happen" document for an appointment, shown
 * before the visit takes place. Derived entirely from the appointment data —
 * no fetch, no stored pre-visit record.
 */
const PlannedVisitModal: React.FC<PlannedVisitModalProps> = ({ show, onClose, appointment }) => {
  const { t, i18n } = useTranslation();
  const visitTypeLabel = (type?: string | null): string => {
    if (type === 'Digital') return t('Digitalt besøk');
    if (type === 'Physical') return t('Fysisk besøk');
    return t('Ikke bestemt enda');
  };
  const timeText =
    appointment?.startTime || appointment?.endTime
      ? `${appointment?.startTime ?? ''} - ${appointment?.endTime ?? ''}`
      : '';

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>{t('Planlagt besøk')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {appointment && (
          <>
            <h5 className="mb-3">{appointment.patientName}</h5>

            <InfoRow icon="calendar-event" label={t('Dato')} value={formatDate(appointment.date, localeForLanguage(i18n.resolvedLanguage))} />
            <InfoRow icon="clock" label={t('Tidspunkt')} value={timeText} />
            <InfoRow
              icon={appointment.visitType === 'Digital' ? 'camera-video' : 'house-door'}
              label={t('Type')}
              value={visitTypeLabel(appointment.visitType)}
            />
            <InfoRow icon="geo-alt" label={t('Adresse')} value={appointment.patientAddress} />
            {appointment.availabilityNotes && (
              <InfoRow icon="info-circle" label={t('Notat')} value={appointment.availabilityNotes} />
            )}

            <hr />

            <h6>{t('Planlagte oppgaver')}</h6>
            <TaskBadges tasks={appointment.tasks} />
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t('Lukk')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PlannedVisitModal;
