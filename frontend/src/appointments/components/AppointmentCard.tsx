import React from 'react';
import { Card } from 'react-bootstrap';
import StatusBadge from '../../components/common/StatusBadge';
import TaskBadges from '../../components/common/TaskBadges';
import type { BadgeColor } from '../../components/common/Badge';

/** Minimal shape the card needs — satisfied by both Appointment and AppointmentSummary. */
interface AppointmentCardData {
  date?: string;
  formattedDateTime?: string;
  personnelName?: string;
  status: string;
  tasks: string;
}

interface AppointmentCardProps {
  appointment: AppointmentCardData;
  taskVariant?: BadgeColor;
  /** Overrides the date/time line (defaults to formattedDateTime || date). */
  dateTimeText?: React.ReactNode;
  /** Overrides the subject line (defaults to "Ansvarlig: <personnel>"). */
  subject?: React.ReactNode;
  /** Optional note rendered below the tasks (e.g. a 24-hour warning). */
  footerNote?: React.ReactNode;
  /** Optional footer actions (buttons). */
  actions?: React.ReactNode;
  /** When set, the whole card becomes clickable (e.g. to open the visit). */
  onClick?: () => void;
}

/**
 * Compact appointment card showing date/time, a subject line, a status badge
 * and the task badges. Shared across the appointment list, dashboards and the
 * patient details page. Optional `subject`, `actions` and `footerNote` slots
 * adapt it to the personnel (patient + start/complete) and patient
 * (personnel + edit/cancel) variants.
 */
const AppointmentCard: React.FC<AppointmentCardProps> = ({
  appointment,
  taskVariant = 'neutral',
  dateTimeText,
  subject,
  footerNote,
  actions,
  onClick,
}) => {
  const subjectNode =
    subject !== undefined
      ? subject
      : appointment.personnelName
      ? `Ansvarlig: ${appointment.personnelName}`
      : 'Ansvarlig ikke oppgitt';

  const clickable = !!onClick;

  return (
    <Card
      className={`border-dark vk-hoverable${clickable ? ' vk-card-clickable' : ''}`}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      <Card.Body>
        <div className="d-flex flex-column flex-md-row justify-content-between gap-2 mb-3">
          <div>
            <div className="fw-semibold">
              {dateTimeText ?? appointment.formattedDateTime ?? appointment.date}
            </div>
            {subjectNode && <div className="text-muted small">{subjectNode}</div>}
          </div>
          <StatusBadge status={appointment.status} className="align-self-start" />
        </div>

        <TaskBadges tasks={appointment.tasks} variant={taskVariant} />

        {footerNote && <div className="mt-3">{footerNote}</div>}
        {/* Stop action clicks from also triggering the row's onClick. */}
        {actions && (
          <div className="d-flex flex-wrap gap-2 mt-3" onClick={(e) => e.stopPropagation()}>
            {actions}
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default AppointmentCard;
