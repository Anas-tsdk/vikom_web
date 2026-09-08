import React from 'react';
import { Modal, Button } from 'react-bootstrap';
import InfoRow from '../../components/common/InfoRow';
import TaskBadges from '../../components/common/TaskBadges';

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

const formatDate = (date?: string): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('nb-NO', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

const visitTypeLabel = (type?: string | null): string => {
  if (type === 'Digital') return 'Digitalt besøk';
  if (type === 'Physical') return 'Fysisk besøk';
  return 'Ikke bestemt enda';
};

/**
 * Read-only "what is planned to happen" document for an appointment, shown
 * before the visit takes place. Derived entirely from the appointment data —
 * no fetch, no stored pre-visit record.
 */
const PlannedVisitModal: React.FC<PlannedVisitModalProps> = ({ show, onClose, appointment }) => {
  const timeText =
    appointment?.startTime || appointment?.endTime
      ? `${appointment?.startTime ?? ''} - ${appointment?.endTime ?? ''}`
      : '';

  return (
    <Modal show={show} onHide={onClose} centered>
      <Modal.Header closeButton>
        <Modal.Title>Planlagt besøk</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {appointment && (
          <>
            <h5 className="mb-3">{appointment.patientName}</h5>

            <InfoRow icon="calendar-event" label="Dato" value={formatDate(appointment.date)} />
            <InfoRow icon="clock" label="Tidspunkt" value={timeText} />
            <InfoRow
              icon={appointment.visitType === 'Digital' ? 'camera-video' : 'house-door'}
              label="Type"
              value={visitTypeLabel(appointment.visitType)}
            />
            <InfoRow icon="geo-alt" label="Adresse" value={appointment.patientAddress} />
            {appointment.availabilityNotes && (
              <InfoRow icon="info-circle" label="Notat" value={appointment.availabilityNotes} />
            )}

            <hr />

            <h6>Planlagte oppgaver</h6>
            <TaskBadges tasks={appointment.tasks} />
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          Lukk
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default PlannedVisitModal;
