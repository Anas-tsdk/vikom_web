import React, { useEffect, useState } from 'react';
import { Modal, Button, Spinner, Alert } from 'react-bootstrap';
import StatusBadge from '../../components/common/StatusBadge';
import Badge from '../../components/common/Badge';
import InfoRow from '../../components/common/InfoRow';
import VisitService from '../services/VisitService';
import type { Visit } from '../types/visit';

interface VisitDetailsModalProps {
  show: boolean;
  onClose: () => void;
  visitId: number | null;
}

const formatDate = (date?: string | null): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
};

const formatDateTime = (iso?: string | null): string => {
  if (!iso) return '–';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '–';
  return d.toLocaleString('nb-NO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const attemptLabel = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'answered':
      return 'Besvart';
    case 'declined':
      return 'Avvist';
    case 'missed':
      return 'Ingen svar';
    case 'ended':
      return 'Avsluttet';
    case 'failed':
      return 'Teknisk feil';
    default:
      return 'Ringte';
  }
};

/**
 * Read-only visit summary opened from the appointment notebook icon and the
 * patient's appointment/visit history.
 */
const VisitDetailsModal: React.FC<VisitDetailsModalProps> = ({ show, onClose, visitId }) => {
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
        if (!cancelled) setError('Kunne ikke laste besøksdetaljer.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [show, visitId]);

  const completedTasks = visit?.tasks.filter((t) => t.status === 'Completed') ?? [];
  const skippedTasks = visit?.tasks.filter((t) => t.status === 'Skipped') ?? [];
  const pendingTasks = visit?.tasks.filter((t) => t.status === 'Pending') ?? [];

  return (
    <Modal show={show} onHide={onClose} centered size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Besøksdetaljer</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {loading && (
          <div className="d-flex align-items-center gap-2 py-3">
            <Spinner animation="border" size="sm" />
            <span>Laster...</span>
          </div>
        )}

        {error && <Alert variant="danger">{error}</Alert>}

        {visit && !loading && (
          <>
            <div className="d-flex justify-content-between align-items-start mb-3">
              <div>
                <h5 className="mb-1">{visit.patientName}</h5>
                <div className="text-muted">
                  {formatDate(visit.date)} • {visit.startTime} - {visit.endTime}
                </div>
              </div>
              <StatusBadge status={visit.status} />
            </div>

            <InfoRow icon="person-badge" label="Ansvarlig" value={visit.responsibleUserName} />
            <InfoRow
              icon={visit.visitType === 'Digital' ? 'camera-video' : 'house-door'}
              label="Type"
              value={visit.visitType === 'Digital' ? 'Digitalt besøk' : 'Fysisk besøk'}
            />
            <InfoRow icon="play-circle" label="Startet" value={formatDateTime(visit.startedAt)} />
            <InfoRow icon="stop-circle" label="Avsluttet" value={formatDateTime(visit.endedAt)} />
            {visit.completedAt && (
              <InfoRow icon="check-circle" label="Fullført" value={formatDateTime(visit.completedAt)} />
            )}
            {visit.outcomeReason && (
              <InfoRow icon="exclamation-circle" label="Årsak" value={visit.outcomeReason} />
            )}
            {visit.followUpRequired && (
              <InfoRow icon="flag" label="Oppfølging" value="Krever oppfølging" />
            )}

            <hr />

            <h6>Oppgaver</h6>
            {visit.tasks.length === 0 ? (
              <p className="text-muted">Ingen oppgaver registrert.</p>
            ) : (
              <ul className="list-unstyled mb-0">
                {completedTasks.map((t) => (
                  <li key={t.id} className="mb-1">
                    <i className="bi bi-check-circle-fill text-success me-2" aria-hidden="true"></i>
                    {t.title}
                  </li>
                ))}
                {skippedTasks.map((t) => (
                  <li key={t.id} className="mb-1 text-muted">
                    <i className="bi bi-dash-circle me-2" aria-hidden="true"></i>
                    {t.title} (hoppet over{t.skippedReason ? `: ${t.skippedReason}` : ''})
                  </li>
                ))}
                {pendingTasks.map((t) => (
                  <li key={t.id} className="mb-1 text-muted">
                    <i className="bi bi-circle me-2" aria-hidden="true"></i>
                    {t.title} (ikke utført)
                  </li>
                ))}
              </ul>
            )}

            {visit.visitType === 'Digital' && (
              <>
                <hr />
                <h6>Samtaleforsøk</h6>
                {visit.callAttempts.length === 0 ? (
                  <p className="text-muted">Ingen samtaleforsøk registrert.</p>
                ) : (
                  <ol className="ps-3 mb-0">
                    {visit.callAttempts.map((a) => (
                      <li key={a.id} className="mb-1">
                        {formatDateTime(a.startedAt)} —{' '}
                        <Badge bg="neutral">{attemptLabel(a.status)}</Badge>
                        {a.durationSeconds ? ` (${Math.round(a.durationSeconds / 60)} min)` : ''}
                      </li>
                    ))}
                  </ol>
                )}
              </>
            )}

            <hr />

            <h6>Notater</h6>
            <p className="mb-0" style={{ whiteSpace: 'pre-wrap' }}>
              {visit.notes?.trim() ? visit.notes : <span className="text-muted">Ingen notater.</span>}
            </p>
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

export default VisitDetailsModal;
