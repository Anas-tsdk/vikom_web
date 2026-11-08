import React from 'react';
import { Card } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { localeForLanguage } from '../../i18n';
import StatusBadge from '../../components/common/StatusBadge';
import TaskBadges from '../../components/common/TaskBadges';
import type { BadgeColor } from '../../components/common/Badge';
import Badge from '../../components/common/Badge';

/** Minimal shape the card needs — satisfied by both Appointment and AppointmentSummary. */
interface AppointmentCardData {
  date?: string;
  formattedDateTime?: string;
  personnelName?: string;
  status: string;
  patientResponseStatus?: 'Pending' | 'Accepted' | 'Declined';
  patientProposedDate?: string | null;
  patientProposedStartTime?: string | null;
  patientProposedEndTime?: string | null;
  tasks: string;
  patientAddress?: string | null;
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
  const { t, i18n } = useTranslation();
  const subjectNode =
    subject !== undefined
      ? subject
      : appointment.personnelName
      ? t('Ansvarlig: {{name}}', { name: appointment.personnelName })
      : t('Ansvarlig ikke oppgitt');

  const clickable = !!onClick;
  const responseBadge = (() => {
    if (appointment.patientResponseStatus === 'Pending' && appointment.status === 'Booked') {
      return <Badge bg="warning">{t('Venter på pasientens svar')}</Badge>;
    }
    if (appointment.patientResponseStatus === 'Accepted' && appointment.status === 'Booked') {
      return <Badge bg="success">{t('Bekreftet')}</Badge>;
    }
    if (appointment.patientResponseStatus === 'Declined') {
      return <Badge bg="danger">{t('Avvist av pasient')}</Badge>;
    }
    return null;
  })();
  const hasProposal = appointment.patientResponseStatus === 'Declined' &&
    !!appointment.patientProposedDate &&
    !!appointment.patientProposedStartTime &&
    !!appointment.patientProposedEndTime;
  const proposedDate = hasProposal
    ? new Date(`${appointment.patientProposedDate}T12:00:00`).toLocaleDateString(
        localeForLanguage(i18n.resolvedLanguage),
        { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
      )
    : '';

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
          <div className="d-flex flex-wrap gap-2 align-self-start">
            <StatusBadge status={appointment.status} />
            {responseBadge}
          </div>
        </div>

        <TaskBadges tasks={appointment.tasks} variant={taskVariant} />
        {appointment.patientAddress && (
          <div className="text-muted small mt-2">
            <i className="bi bi-geo-alt me-1" aria-hidden="true"></i>
            {appointment.patientAddress}
          </div>
        )}

        {hasProposal && (
          <div className="alert alert-warning mt-3 mb-0" role="status">
            <div className="fw-semibold">
              <i className="bi bi-calendar2-week me-2" aria-hidden="true"></i>
              {t('Pasienten foreslår et annet tidspunkt')}
            </div>
            <div className="mt-1">
              {proposedDate} · {appointment.patientProposedStartTime}–{appointment.patientProposedEndTime}
            </div>
          </div>
        )}

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
