import React, { useEffect, useState } from 'react';
import { Modal, Button, Spinner, Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import StatusBadge from '../../components/common/StatusBadge';
import Badge from '../../components/common/Badge';
import InfoRow from '../../components/common/InfoRow';
import VisitService from '../services/VisitService';
import type { Visit } from '../types/visit';
import { localeForLanguage } from '../../i18n';

interface VisitDetailsModalProps {
  show: boolean;
  onClose: () => void;
  visitId: number | null;
}

const formatDate = (date: string | null | undefined, locale: string): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatDateTime = (iso: string | null | undefined, locale: string): string => {
  if (!iso) return '–';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '–';
  return d.toLocaleString(locale, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const attemptLabel = (status: string, t: TFunction): string => {
  switch (status.toLowerCase()) {
    case 'answered':
      return t('Besvart');
    case 'declined':
      return t('Avvist');
    case 'missed':
      return t('Ingen svar');
    case 'ended':
      return t('Avsluttet');
    case 'failed':
      return t('Teknisk feil');
    default:
      return t('Ringte');
  }
};

/**
 * Read-only visit summary opened from the appointment notebook icon and the
 * patient's appointment/visit history.
 */
const VisitDetailsModal: React.FC<VisitDetailsModalProps> = ({ show, onClose, visitId }) => {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.resolvedLanguage);
  const [visit, setVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!show || !visitId) return;
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        setVisit(null);
        const data = await VisitService.getById(visitId);
        if (!cancelled) setVisit(data);
      } catch {
        if (!cancelled) setError(t('Kunne ikke laste besøksdetaljer.'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [show, visitId, t]);

  const completedTasks = visit?.tasks.filter((t) => t.status === 'Completed') ?? [];
  const skippedTasks = visit?.tasks.filter((t) => t.status === 'Skipped') ?? [];
  const pendingTasks = visit?.tasks.filter((t) => t.status === 'Pending') ?? [];

  return (
    <Modal show={show} onHide={onClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>{t('Besøksdetaljer')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading && (
          <div className="d-flex align-items-center gap-2 py-3">
            <Spinner animation="border" size="sm" />
            <span>{t('Laster...')}</span>
          </div>
        )}

        {error && <Alert variant="danger">{error}</Alert>}

        {visit && !loading && (
          <>
            <div className="d-flex justify-content-between align-items-start mb-3">
              <div>
                <h5 className="mb-1">{visit.patientName}</h5>
                <div className="text-muted">
                  {formatDate(visit.date, locale)} • {visit.startTime} - {visit.endTime}
                </div>
              </div>
              <StatusBadge status={visit.status} />
            </div>

            <InfoRow icon="person-badge" label={t('Ansvarlig')} value={visit.responsibleUserName} />
            <InfoRow
              icon={visit.visitType === 'Digital' ? 'camera-video' : 'house-door'}
              label={t('Type')}
              value={visit.visitType === 'Digital' ? t('Digitalt besøk') : t('Fysisk besøk')}
            />
            <InfoRow icon="play-circle" label={t('Startet')} value={formatDateTime(visit.startedAt, locale)} />
            <InfoRow icon="stop-circle" label={t('Avsluttet')} value={formatDateTime(visit.endedAt, locale)} />
            {visit.completedAt && (
              <InfoRow icon="check-circle" label={t('Fullført')} value={formatDateTime(visit.completedAt, locale)} />
            )}
            {visit.outcomeReason && (
              <InfoRow icon="exclamation-circle" label={t('Årsak')} value={t(visit.outcomeReason)} />
            )}
            {visit.followUpRequired && (
              <InfoRow icon="flag" label={t('Oppfølging')} value={t('Krever oppfølging')} />
            )}

            <hr />

            <h6>{t('Oppgaver')}</h6>
            {visit.tasks.length === 0 ? (
              <p className="text-muted">{t('Ingen oppgaver registrert.')}</p>
            ) : (
              <ul className="list-unstyled mb-0">
                {completedTasks.map((task) => (
                  <li key={task.id} className="mb-1">
                    <i className="bi bi-check-circle-fill text-success me-2" aria-hidden="true"></i>
                    {t(task.title)}
                  </li>
                ))}
                {skippedTasks.map((task) => (
                  <li key={task.id} className="mb-1 text-muted">
                    <i className="bi bi-dash-circle me-2" aria-hidden="true"></i>
                    {t(task.title)} ({t('Hoppet over')}{task.skippedReason ? `: ${task.skippedReason}` : ''})
                  </li>
                ))}
                {pendingTasks.map((task) => (
                  <li key={task.id} className="mb-1 text-muted">
                    <i className="bi bi-circle me-2" aria-hidden="true"></i>
                    {t(task.title)} ({t('ikke utført')})
                  </li>
                ))}
              </ul>
            )}

            {visit.visitType === 'Digital' && (
              <>
                <hr />
                <h6>{t('Samtaleforsøk')}</h6>
                {visit.callAttempts.length === 0 ? (
                  <p className="text-muted">{t('Ingen samtaleforsøk registrert.')}</p>
                ) : (
                  <ol className="ps-3 mb-0">
                    {visit.callAttempts.map((a) => (
                      <li key={a.id} className="mb-1">
                        {formatDateTime(a.startedAt, locale)} —{' '}
                        <Badge bg="neutral">{attemptLabel(a.status, t)}</Badge>
                        {a.durationSeconds ? ` (${t('{{count}} min', { count: Math.round(a.durationSeconds / 60) })})` : ''}
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}

            <hr />

            <h6>{t('Notater')}</h6>
            <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
              {visit.notes?.trim() ? visit.notes : <span className="text-muted">{t('Ingen notater.')}</span>}
            </p>
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

export default VisitDetailsModal;
