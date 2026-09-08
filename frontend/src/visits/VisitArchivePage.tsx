import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import VisitService from './services/VisitService';
import type { VisitSummary, VisitStatus } from './types/visit';
import PageHeader from '../components/common/PageHeader';
import Tabs from '../components/common/Tabs';
import EmptyState from '../components/common/EmptyState';
import StatusBadge from '../components/common/StatusBadge';
import Badge from '../components/common/Badge';
import IconButton from '../components/common/IconButton';
import VisitDetailsModal from './components/VisitDetailsModal';
import './VisitArchivePage.css';

// Archive tabs map onto the terminal visit statuses already in use; 'all' keeps
// everything. No new statuses are introduced here.
type ArchiveFilter = 'all' | 'Completed' | 'Incomplete' | 'Cancelled';

const formatDate = (date?: string | null): string => {
  if (!date) return '–';
  const d = new Date(date);
  if (isNaN(d.getTime())) return date;
  return d.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long', year: 'numeric' });
};

// "Resultat" column: cancelled/incomplete carry a reason; digital visits without
// one fall back to the number of call attempts logged.
const outcomeText = (visit: VisitSummary): string => {
  if (visit.outcomeReason?.trim()) return visit.outcomeReason;
  if (visit.visitType === 'Digital' && visit.callAttemptCount > 0) {
    return `${visit.callAttemptCount} samtaleforsøk`;
  }
  return '–';
};

const VisitArchivePage: React.FC = () => {
  const navigate = useNavigate();

  const [visits, setVisits] = useState<VisitSummary[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [filter, setFilter] = useState<ArchiveFilter>('all');
  const [search, setSearch] = useState<string>('');
  const [detailsVisitId, setDetailsVisitId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const data = await VisitService.getMine();
        if (!cancelled) setVisits(data);
      } catch {
        if (!cancelled) setError('Kunne ikke laste besøksarkivet.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const countFor = (status: VisitStatus) => visits.filter((v) => v.status === status).length;

  const tabs = [
    { key: 'all', label: 'Alle', count: visits.length },
    { key: 'Completed', label: 'Fullført', count: countFor('Completed') },
    { key: 'Incomplete', label: 'Ikke fullført', count: countFor('Incomplete') },
    { key: 'Cancelled', label: 'Avlyst', count: countFor('Cancelled') },
  ];

  // Newest first by scheduled date, falling back to when the visit started.
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return visits
      .filter((v) => (filter === 'all' ? true : v.status === filter))
      .filter((v) => (term ? v.patientName.toLowerCase().includes(term) : true))
      .sort((a, b) => {
        const da = new Date(a.date ?? a.startedAt).getTime();
        const db = new Date(b.date ?? b.startedAt).getTime();
        return db - da;
      });
  }, [visits, filter, search]);

  const renderBody = () => {
    if (loading) {
      return <EmptyState icon="hourglass-split" text="Laster besøksarkiv..." />;
    }
    if (filtered.length === 0) {
      return (
        <EmptyState
          icon="archive"
          text={
            search.trim() || filter !== 'all'
              ? 'Ingen besøk matcher dette filteret.'
              : 'Ingen dokumenterte besøk ennå.'
          }
        />
      );
    }

    return (
      <div className="table-responsive">
        <table className="table vk-archive-table align-middle mb-0">
          <thead>
            <tr>
              <th scope="col">Dato</th>
              <th scope="col">Tid</th>
              <th scope="col">Pasient</th>
              <th scope="col">Type</th>
              <th scope="col">Status</th>
              <th scope="col">Resultat</th>
              <th scope="col" className="text-end">
                Detaljer
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((visit) => (
              <tr key={visit.id}>
                <td>{formatDate(visit.date)}</td>
                <td>{visit.startTime ?? '–'}</td>
                <td className="fw-semibold">{visit.patientName || 'Ukjent pasient'}</td>
                <td>
                  <Badge
                    bg={visit.visitType === 'Digital' ? 'info' : 'neutral'}
                    icon={visit.visitType === 'Digital' ? 'camera-video' : 'house-door'}
                  >
                    {visit.visitType === 'Digital' ? 'Digitalt' : 'Fysisk'}
                  </Badge>
                </td>
                <td>
                  <StatusBadge status={visit.status} />
                </td>
                <td className="text-muted">{outcomeText(visit)}</td>
                <td className="text-end">
                  <IconButton
                    icon="journal-text"
                    title="Besøksdetaljer"
                    onClick={() => setDetailsVisitId(visit.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="visit-archive-page">
      {error && (
        <div className="vk-error-alert">
          <span>{error}</span>
          <button className="vk-error-alert__close" onClick={() => setError('')}>
            <i className="bi bi-x"></i>
          </button>
        </div>
      )}

      <PageHeader
        title="Besøksarkiv"
        subtitle="Fullstendig historikk over dokumenterte besøk."
        actions={
          <button className="btn btn-outline-secondary" onClick={() => navigate('/appointments')}>
            <i className="bi bi-arrow-left me-2" aria-hidden="true"></i>Tilbake til avtaler
          </button>
        }
      />

      <Tabs tabs={tabs} activeKey={filter} onChange={(key) => setFilter(key as ArchiveFilter)} card>
        <div className="d-flex justify-content-end mb-3">
          <div className="vk-archive-search">
            <i className="bi bi-search" aria-hidden="true"></i>
            <input
              type="text"
              className="form-control"
              placeholder="Søk etter pasient..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Søk etter pasient"
            />
          </div>
        </div>

        {renderBody()}
      </Tabs>

      <VisitDetailsModal
        show={detailsVisitId !== null}
        onClose={() => setDetailsVisitId(null)}
        visitId={detailsVisitId}
      />
    </div>
  );
};

export default VisitArchivePage;
