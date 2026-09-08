import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, Alert } from 'react-bootstrap';
import * as AuthService from '../auth/AuthService';
import AppointmentService from '../appointments/services/AppointmentService';
import type { Appointment } from '../appointments/types/appointment';
import TaskBadges from '../components/common/TaskBadges';
import Badge from '../components/common/Badge';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import EmptyState from '../components/common/EmptyState';
import './PlanningOverviewPage.css';

type PlanningVisit = {
  id: number;
  patientName: string;
  address: string;
  area: string;
  taskType: 'Digital' | 'Fysisk';
  tasks: string;
  date: string;
  time: string;
  status: string;
};

const mapTaskType = (tasks: string): 'Digital' | 'Fysisk' => {
  return /digital/i.test(tasks) ? 'Digital' : 'Fysisk';
};

const mapStatus = (status: Appointment['status']): string => {
  switch (status) {
    case 'Booked':
      return 'Planlagt';
    case 'InProgress':
      return 'Pågår';
    case 'Completed':
      return 'Fullført';
    case 'Cancelled':
      return 'Avlyst';
    default:
      return status;
  }
};

const parseAreaAndAddress = (
  availabilityNotes?: string,
  patientAddress?: string
): { area: string; address: string } => {
  const fallbackAddress = patientAddress?.trim() || 'Adresse ikke tilgjengelig';
  if (!availabilityNotes) {
    return { area: 'Ikke satt', address: fallbackAddress };
  }

  const parts = availabilityNotes.split(',').map((part) => part.trim()).filter(Boolean);
  const area = parts.length > 0 && /^sone/i.test(parts[0]) ? parts[0] : 'Ikke satt';
  const noteAddress = parts.length > 1 ? parts.slice(1).join(', ') : '';

  return {
    area,
    address: fallbackAddress !== 'Adresse ikke tilgjengelig' ? fallbackAddress : noteAddress || fallbackAddress,
  };
};

const PlanningOverviewPage: React.FC = () => {
  const userInfo = AuthService.getUserInfo();

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [taskTypeFilter, setTaskTypeFilter] = useState<string>('Alle');
  const [areaFilter, setAreaFilter] = useState<string>('Alle');
  const [sortBy, setSortBy] = useState<string>('time');

  const loadAppointments = async () => {
    try {
      setLoading(true);
      setError('');

      const data = userInfo?.userId
        ? await AppointmentService.getByPersonnelId(userInfo.userId)
        : await AppointmentService.getAll();

      setAppointments(data);
    } catch {
      setError('Kunne ikke laste planlagte besøk');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAppointments();
  }, []);

  const visits = useMemo<PlanningVisit[]>(() => {
    return appointments.map((appointment) => ({
      ...parseAreaAndAddress(appointment.availabilityNotes, appointment.patientAddress),
      id: appointment.id ?? 0,
      patientName: appointment.patientName || 'Ukjent pasient',
      taskType: mapTaskType(appointment.tasks),
      tasks: appointment.tasks,
      date: appointment.date || '',
      time: appointment.startTime || '',
      status: mapStatus(appointment.status),
    }));
  }, [appointments]);

  // Get unique task types and areas
  const taskTypes = ['Alle', ...Array.from(new Set(visits.map((v) => v.taskType)))];
  const areas = ['Alle', ...Array.from(new Set(visits.map((v) => v.area)))];

  // Filter visits
  const filteredVisits = visits.filter((visit) => {
    const isPlanned = visit.status === 'Planlagt';
    const matchesSearch = visit.patientName.toLowerCase().includes(searchQuery.trim().toLowerCase());
    const matchesTaskType = taskTypeFilter === 'Alle' || visit.taskType === taskTypeFilter;
    const matchesArea = areaFilter === 'Alle' || visit.area === areaFilter;
    return isPlanned && matchesSearch && matchesTaskType && matchesArea;
  });

  const displayedVisits = [...filteredVisits].sort((a, b) => {
    if (sortBy === 'patient') {
      return a.patientName.localeCompare(b.patientName, 'nb-NO');
    }

    if (sortBy === 'area') {
      return a.area.localeCompare(b.area, 'nb-NO');
    }

    const dateA = new Date(`${a.date}T${a.time || '00:00'}`).getTime();
    const dateB = new Date(`${b.date}T${b.time || '00:00'}`).getTime();
    return dateA - dateB;
  });

  const mapAreaCounts = Array.from(
    displayedVisits.reduce((acc, visit) => {
      acc.set(visit.area, (acc.get(visit.area) || 0) + 1);
      return acc;
    }, new Map<string, number>())
  );

  if (loading) {
    return (
      <div className="planning-overview-page">
        <p>Laster planlagte besok...</p>
      </div>
    );
  }

  return (
    <div className="planning-overview-page">
      {error && <Alert variant="danger">{error}</Alert>}

      <PageHeader
        title="Oversikt over planlagte besøk"
        subtitle="Planlegg og organiser hjemmebesøk etter område og oppgavetype"
      />

      {/* Filters */}
      <div className="filters-bar">
          <div className="controls-bar">
            <Form.Control
              type="search"
              className="search-control"
              placeholder="Search patient"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search patient"
            />

            <Form.Select
              className="compact-select"
              value={taskTypeFilter}
              onChange={(e) => setTaskTypeFilter(e.target.value)}
              aria-label="Filter by type"
            >
              {taskTypes.map((type) => (
                <option key={type} value={type}>{`Type: ${type}`}</option>
              ))}
            </Form.Select>

            <Form.Select
              className="compact-select"
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              aria-label="Filter by area"
            >
              {areas.map((area) => (
                <option key={area} value={area}>{`Area: ${area}`}</option>
              ))}
            </Form.Select>

            <Form.Select
              className="compact-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              aria-label="Sort visits"
            >
              <option value="time">Sort: Time</option>
              <option value="patient">Sort: Patient</option>
              <option value="area">Sort: Area</option>
            </Form.Select>
          </div>
      </div>

      {/* Main Content Grid */}
      <div className="planning-content">
        {/* Visits List */}
        <div className="visits-section">
          <SectionCard title={`Planlagte besøk (${filteredVisits.length})`} className="visits-card">
              {displayedVisits.length > 0 ? (
                <div className="visits-list">
                  {displayedVisits.map((visit) => (
                    <div key={visit.id} className="visit-item">
                      <div className="visit-header">
                        <div className="visit-main">
                          <h3 className="patient-name">{visit.patientName}</h3>
                          <p className="visit-address"><i className="bi bi-geo-alt-fill"></i> {visit.address}</p>
                        </div>
                        <div className="visit-meta">
                          <Badge bg={visit.taskType === 'Digital' ? 'info' : 'neutral'}>
                            {visit.taskType}
                          </Badge>
                          <Badge bg="light" bordered>
                            {visit.area}
                          </Badge>
                        </div>
                      </div>
                      <div className="visit-details">
                        <div className="visit-datetime">
                          <i className="bi bi-calendar-event-fill"></i>
                          {visit.date
                            ? `${new Date(visit.date).toLocaleDateString('nb-NO', {
                                month: 'short',
                                day: 'numeric',
                              })} kl. ${visit.time}`
                            : 'Tid ikke satt'}
                        </div>
                      </div>
                      <div className="visit-tasks">
                        <TaskBadges tasks={visit.tasks} />
                      </div>
                      <div className="visit-actions">
                        <Button variant="outline-primary" size="sm">
                          Vis detaljer
                        </Button>
                        <Button variant="outline-secondary" size="sm">
                          Endre tidspunkt
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState icon="calendar-x" text="Ingen besøk matcher valgte filtre." />
              )}
          </SectionCard>
        </div>

        {/* Map Placeholder */}
        <div className="map-section">
          <SectionCard title="Kart over områder" className="map-card" bodyClassName="map-body p-0">
              <div className="map-placeholder">
                <div className="map-content">
                  <i className="bi bi-geo-alt-fill map-icon"></i>
                  <h3 className="map-title">Interaktivt kart</h3>
                  <p className="map-text">
                    Kartvisning for å planlegge besøk etter områder og optimalisere ruter.
                  </p>
                  <div className="map-areas">
                    {mapAreaCounts.length > 0 ? (
                      mapAreaCounts.map(([area, count], index) => {
                        const variantClass = index % 3 === 0 ? 'downtown' : index % 3 === 1 ? 'suburb' : 'rural';
                        return (
                          <div key={area} className={`map-area ${variantClass}`}>
                            <span className="area-label">{area}</span>
                            <span className="area-count">{count} besøk</span>
                          </div>
                        );
                      })
                    ) : (
                      <div className="map-area downtown">
                        <span className="area-label">Ingen data</span>
                        <span className="area-count">0 besøk</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
};

export default PlanningOverviewPage;