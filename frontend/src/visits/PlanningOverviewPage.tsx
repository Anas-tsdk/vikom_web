import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Form, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import * as AuthService from '../auth/AuthService';
import AppointmentService from '../appointments/services/AppointmentService';
import type { Appointment } from '../appointments/types/appointment';
import TaskBadges from '../components/common/TaskBadges';
import Badge from '../components/common/Badge';
import PageHeader from '../components/common/PageHeader';
import SectionCard from '../components/common/SectionCard';
import EmptyState from '../components/common/EmptyState';
import PlannedVisitModal from './components/PlannedVisitModal';
import AppointmentModal from '../appointments/components/AppointmentModal';
import InteractiveVisitMap from './components/InteractiveVisitMap';
import { searchAddresses } from '../patients/services/AddressSearchService';
import { getDrivingRoute, type PlannedDrivingRoute, type RouteLeg } from './services/RoutePlanningService';
import { localeForLanguage } from '../i18n';
import { isHeadNurseRole } from '../auth/roles';
import PersonnelService, { type NurseSummary } from '../personnel/services/PersonnelService';
import './PlanningOverviewPage.css';

type PlanningVisit = {
  id: number;
  patientName: string;
  address: string;
  isDigital: boolean;
  tasks: string;
  date: string;
  time: string;
  endTime: string;
  patientResponseStatus?: 'Pending' | 'Accepted' | 'Declined';
  latitude?: number | null;
  longitude?: number | null;
};

type Position = { latitude: number; longitude: number };

const isDigitalAppointment = (appointment: Appointment): boolean =>
  appointment.visitType === 'Digital'
  || /^digital(t)?$/i.test(appointment.availabilityNotes?.trim() ?? '');

// Older demo data put values such as "Sone A, Grensen 12" in an availability
// note. A zone is not a destination, so only use its address part as a fallback.
const appointmentAddress = (appointment: Appointment): string => {
  if (appointment.patientAddress?.trim()) return appointment.patientAddress.trim();
  const noteParts = (appointment.availabilityNotes ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  if (/^(sone|zone)\b/i.test(noteParts[0] ?? '')) noteParts.shift();
  return noteParts.join(', ');
};

const formatDistance = (meters: number, locale: string): string =>
  meters < 1000
    ? `${Math.round(meters)} m`
    : `${(meters / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} km`;

const formatDuration = (seconds: number): string => `${Math.max(1, Math.round(seconds / 60))} min`;

const navigationUrl = (visit: PlanningVisit): string => {
  const destination = typeof visit.latitude === 'number' && typeof visit.longitude === 'number'
    ? `${visit.latitude},${visit.longitude}`
    : visit.address;
  const params = new URLSearchParams({
    api: '1', destination, travelmode: 'driving', dir_action: 'navigate',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

const dayRouteUrl = (visits: PlanningVisit[], origin: Position | null): string | null => {
  const stops = visits.filter((visit) =>
    !visit.isDigital && typeof visit.latitude === 'number' && typeof visit.longitude === 'number');
  if (stops.length === 0) return null;

  const point = (visit: PlanningVisit) => `${visit.latitude},${visit.longitude}`;
  const params = new URLSearchParams({
    api: '1',
    destination: point(stops[stops.length - 1]),
    travelmode: 'driving',
    dir_action: 'navigate',
  });
  if (origin) params.set('origin', `${origin.latitude},${origin.longitude}`);
  if (stops.length > 1) params.set('waypoints', stops.slice(0, -1).map(point).join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

const PlanningOverviewPage: React.FC = () => {
  const userInfo = AuthService.getUserInfo();
  const userId = userInfo?.userId;
  const isHeadNurse = isHeadNurseRole(userInfo?.role);
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.resolvedLanguage);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [nurses, setNurses] = useState<NurseSummary[]>([]);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState(userId ?? '');
  const [nursesLoading, setNursesLoading] = useState(isHeadNurse);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [geocoded, setGeocoded] = useState<Record<string, Position | null>>({});
  const [selectedVisitId, setSelectedVisitId] = useState<number | null>(null);
  const [detailsAppointment, setDetailsAppointment] = useState<Appointment | null>(null);
  const [editAppointment, setEditAppointment] = useState<Appointment | undefined>();
  const [showEditModal, setShowEditModal] = useState(false);
  const [origin, setOrigin] = useState<Position | null>(null);
  const [locating, setLocating] = useState(false);
  const [route, setRoute] = useState<PlannedDrivingRoute | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState('');
  const appointmentRequestRef = useRef(0);

  const loadAppointments = useCallback(async () => {
    const requestId = ++appointmentRequestRef.current;
    try {
      setLoading(true);
      setError('');
      const data = selectedPersonnelId
        ? await AppointmentService.getByPersonnelId(selectedPersonnelId)
        : await AppointmentService.getAll();
      if (requestId === appointmentRequestRef.current) setAppointments(data);
    } catch {
      if (requestId === appointmentRequestRef.current) {
        setAppointments([]);
        setError(t('Kunne ikke laste planlagte besøk'));
      }
    } finally {
      if (requestId === appointmentRequestRef.current) setLoading(false);
    }
  }, [selectedPersonnelId, t]);

  useEffect(() => {
    if (!isHeadNurse) {
      setNurses([]);
      setNursesLoading(false);
      if (userId) setSelectedPersonnelId(userId);
      return;
    }

    let active = true;
    setNursesLoading(true);
    void PersonnelService.getAll()
      .then((staff) => {
        if (!active) return;
        const ordered = [...staff].sort((a, b) => a.fullName.localeCompare(b.fullName, locale));
        setNurses(ordered);
        setSelectedPersonnelId((current) =>
          ordered.some((nurse) => nurse.id === current)
            ? current
            : ordered.find((nurse) => nurse.id === userId)?.id ?? ordered[0]?.id ?? '');
      })
      .catch(() => {
        if (active) setError(t('Kunne ikke laste sykepleiere'));
      })
      .finally(() => {
        if (active) setNursesLoading(false);
      });

    return () => { active = false; };
  }, [isHeadNurse, locale, t, userId]);

  useEffect(() => { void loadAppointments(); }, [loadAppointments]);

  const plannedAppointments = useMemo(() => appointments
    .filter((appointment) => appointment.status === 'Booked' && appointment.date)
    .sort((a, b) => `${a.date}T${a.startTime}`.localeCompare(`${b.date}T${b.startTime}`)), [appointments]);

  const availableDays = useMemo(() => Array.from(new Set(
    plannedAppointments.map((appointment) => appointment.date as string),
  )), [plannedAppointments]);

  useEffect(() => {
    if (availableDays.length === 0) {
      setSelectedDate('');
      return;
    }
    if (!availableDays.includes(selectedDate)) setSelectedDate(availableDays[0]);
  }, [availableDays, selectedDate]);

  useEffect(() => {
    const controller = new AbortController();
    const missing = Array.from(new Set(plannedAppointments
      .filter((appointment) => !isDigitalAppointment(appointment)
        && typeof appointment.patientLatitude !== 'number'
        && appointmentAddress(appointment))
      .map(appointmentAddress)
      .filter((address) => !Object.prototype.hasOwnProperty.call(geocoded, address))));
    if (missing.length === 0) return () => controller.abort();

    void Promise.all(missing.map(async (address) => {
      try {
        const [match] = await searchAddresses(address, 1, controller.signal);
        return { address, coordinates: match ? { latitude: match.latitude, longitude: match.longitude } : null };
      } catch {
        return { address, coordinates: null };
      }
    })).then((results) => {
      if (controller.signal.aborted) return;
      setGeocoded((current) => {
        const next = { ...current };
        results.forEach(({ address, coordinates }) => { next[address] = coordinates; });
        return next;
      });
    });
    return () => controller.abort();
  }, [geocoded, plannedAppointments]);

  const visits = useMemo<PlanningVisit[]>(() => plannedAppointments.map((appointment) => {
    const address = appointmentAddress(appointment);
    const fallbackCoordinates = geocoded[address];
    return {
      id: appointment.id ?? 0,
      patientName: appointment.patientName || t('Ukjent pasient'),
      address,
      isDigital: isDigitalAppointment(appointment),
      tasks: appointment.tasks,
      date: appointment.date ?? '',
      time: appointment.startTime,
      endTime: appointment.endTime,
      patientResponseStatus: appointment.patientResponseStatus,
      latitude: appointment.patientLatitude ?? fallbackCoordinates?.latitude,
      longitude: appointment.patientLongitude ?? fallbackCoordinates?.longitude,
    };
  }), [geocoded, plannedAppointments, t]);

  const dayVisits = useMemo(() => visits
    .filter((visit) => visit.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time)), [selectedDate, visits]);

  const mappedVisits = useMemo(() => dayVisits.flatMap((visit, index) =>
    !visit.isDigital && typeof visit.latitude === 'number' && typeof visit.longitude === 'number'
      ? [{ ...visit, sequence: index + 1 }]
      : []), [dayVisits]);

  const routePoints = useMemo(() => [
    ...(origin ? [origin] : []),
    ...mappedVisits.map((visit) => ({ latitude: visit.latitude!, longitude: visit.longitude! })),
  ], [mappedVisits, origin]);

  useEffect(() => {
    const controller = new AbortController();
    setRouteError('');
    if (routePoints.length < 2) {
      setRoute(null);
      setRouteLoading(false);
      return () => controller.abort();
    }
    setRouteLoading(true);
    void getDrivingRoute(routePoints, controller.signal)
      .then((result) => { if (!controller.signal.aborted) setRoute(result); })
      .catch((requestError) => {
        if (controller.signal.aborted || requestError instanceof DOMException && requestError.name === 'AbortError') return;
        setRoute(null);
        setRouteError(t('Kjøreruten kunne ikke beregnes. Stoppene vises fortsatt på kartet.'));
      })
      .finally(() => { if (!controller.signal.aborted) setRouteLoading(false); });
    return () => controller.abort();
  }, [routePoints, t]);

  useEffect(() => {
    if (selectedVisitId !== null && !dayVisits.some((visit) => visit.id === selectedVisitId)) {
      setSelectedVisitId(null);
    }
  }, [dayVisits, selectedVisitId]);

  const appointmentForVisit = (visitId: number) =>
    appointments.find((appointment) => appointment.id === visitId);

  const handleAppointmentSubmit = async (data: Appointment) => {
    if (!data.id) return;
    await AppointmentService.update(data.id, data);
    setShowEditModal(false);
    await loadAppointments();
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setRouteError(t('Nettleseren støtter ikke posisjonsdeling.'));
      return;
    }
    setLocating(true);
    setRouteError('');
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setOrigin({ latitude: coords.latitude, longitude: coords.longitude });
        setLocating(false);
      },
      () => {
        setRouteError(t('Kunne ikke hente posisjonen din. Kontroller nettlesertillatelsen.'));
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const routeLegForVisit = (visit: PlanningVisit): RouteLeg | null => {
    const mappedIndex = mappedVisits.findIndex((mappedVisit) => mappedVisit.id === visit.id);
    if (mappedIndex < 0 || !route) return null;
    const legIndex = origin ? mappedIndex : mappedIndex - 1;
    return legIndex >= 0 ? route.legs[legIndex] ?? null : null;
  };

  const selectedDayIndex = availableDays.indexOf(selectedDate);
  const googleDayRoute = dayRouteUrl(dayVisits, origin);
  const selectedNurse = nurses.find((nurse) => nurse.id === selectedPersonnelId);
  const viewingOwnSchedule = selectedPersonnelId === userId;

  if (loading) {
    return <div className="planning-overview-page"><p>{t('Laster planlagte besøk...')}</p></div>;
  }

  return (
    <div className="planning-overview-page">
      {error && <Alert variant="danger">{error}</Alert>}

      <PageHeader
        className="planning-header"
        title={t('Daily route')}
        subtitle={isHeadNurse && selectedNurse
          ? t('Viser kjøreplanen til {{name}}.', { name: selectedNurse.fullName })
          : t('Se alle planlagte avtaler i tidsrekkefølge og kjøreruten mellom hjemmebesøkene.')}
        actions={isHeadNurse ? (
          <Form.Group className="planning-nurse-selector" controlId="planning-nurse">
            <Form.Label><i className="bi bi-person-badge me-2" aria-hidden="true"></i>{t('Sykepleier')}</Form.Label>
            <Form.Select
              value={selectedPersonnelId}
              disabled={nursesLoading || nurses.length === 0}
              onChange={(event) => {
                appointmentRequestRef.current += 1;
                setAppointments([]);
                setLoading(true);
                setSelectedPersonnelId(event.target.value);
                setSelectedDate('');
                setSelectedVisitId(null);
                setOrigin(null);
              }}
            >
              {nurses.map((nurse) => (
                <option key={nurse.id} value={nurse.id}>
                  {nurse.fullName}{nurse.role === 'HeadNurse' ? ` · ${t('Ledende sykepleier')}` : ''}
                </option>
              ))}
            </Form.Select>
          </Form.Group>
        ) : undefined}
      />

      <div className="planning-toolbar">
        <Button
          variant="outline-secondary"
          aria-label={t('Forrige planlagte dag')}
          disabled={selectedDayIndex <= 0}
          onClick={() => setSelectedDate(availableDays[selectedDayIndex - 1])}
        ><i className="bi bi-chevron-left" aria-hidden="true"></i></Button>
        <Form.Select
          className="day-select"
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.target.value)}
          aria-label={t('Velg planlagt dag')}
          disabled={availableDays.length === 0}
        >
          {availableDays.length === 0 && <option value="">{t('Ingen planlagte dager')}</option>}
          {availableDays.map((date) => {
            const count = visits.filter((visit) => visit.date === date).length;
            return (
              <option value={date} key={date}>
                {new Date(`${date}T12:00:00`).toLocaleDateString(locale, {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })} ({count})
              </option>
            );
          })}
        </Form.Select>
        <Button
          variant="outline-secondary"
          aria-label={t('Neste planlagte dag')}
          disabled={selectedDayIndex < 0 || selectedDayIndex >= availableDays.length - 1}
          onClick={() => setSelectedDate(availableDays[selectedDayIndex + 1])}
        ><i className="bi bi-chevron-right" aria-hidden="true"></i></Button>
        {viewingOwnSchedule && (
          <Button
            className="planning-location-button"
            variant={origin ? 'success' : 'outline-primary'}
            onClick={useCurrentLocation}
            disabled={locating}
          >
            {locating ? <Spinner size="sm" animation="border" className="me-2" /> : <i className="bi bi-crosshair me-2" aria-hidden="true"></i>}
            {origin ? t('Startposisjon er satt') : t('Bruk min posisjon som start')}
          </Button>
        )}
      </div>

      {routeError && <Alert variant="warning" className="route-alert">{routeError}</Alert>}

      <div className="route-summary" aria-live="polite">
        <div><strong>{dayVisits.length}</strong><span>{t('Planlagte avtaler')}</span></div>
        <div><strong>{mappedVisits.length}</strong><span>{t('Kjørestopp')}</span></div>
        <div><strong>{routeLoading ? '…' : route ? formatDistance(route.distanceMeters, locale) : '—'}</strong><span>{t('Kjørelengde')}</span></div>
        <div><strong>{routeLoading ? '…' : route ? formatDuration(route.durationSeconds) : '—'}</strong><span>{t('Estimert kjøretid')}</span></div>
        {googleDayRoute && (
          <a href={googleDayRoute} target="_blank" rel="noreferrer" className="btn btn-primary">
            <i className="bi bi-sign-turn-right me-2" aria-hidden="true"></i>{t('Åpne hele ruten')}
          </a>
        )}
      </div>

      <div className="planning-content">
        <div className="visits-section">
          <SectionCard title={t('Dagens kjøreplan')} className="visits-card">
            {dayVisits.length > 0 ? (
              <div className="visits-list">
                {dayVisits.map((visit, index) => {
                  const leg = routeLegForVisit(visit);
                  return (
                    <article
                      key={visit.id}
                      className={`visit-item${selectedVisitId === visit.id ? ' selected' : ''}`}
                      onClick={() => setSelectedVisitId(visit.id)}
                    >
                      <button
                        type="button"
                        className="stop-number"
                        aria-label={t('Vis {{name}} på kartet', { name: visit.patientName })}
                        onClick={() => setSelectedVisitId(visit.id)}
                      >{index + 1}</button>
                      <span className="visit-body">
                        <span className="visit-header">
                          <span><span className="visit-time">{visit.time}–{visit.endTime}</span><span className="patient-name">{visit.patientName}</span></span>
                          <span className="d-flex flex-column align-items-end gap-1">
                            <Badge bg={visit.isDigital ? 'info' : 'neutral'}>{visit.isDigital ? t('Digitalt') : t('Hjemmebesøk')}</Badge>
                            {visit.patientResponseStatus === 'Pending' && <Badge bg="warning">{t('Venter på svar')}</Badge>}
                            {visit.patientResponseStatus === 'Accepted' && <Badge bg="success">{t('Bekreftet')}</Badge>}
                          </span>
                        </span>
                        {visit.isDigital ? (
                          <span className="visit-address"><i className="bi bi-camera-video"></i>{t('Ingen kjøretur nødvendig')}</span>
                        ) : (
                          <span className="visit-address"><i className="bi bi-geo-alt-fill"></i>{visit.address || t('Adresse ikke oppgitt')}</span>
                        )}
                        {leg && (
                          <span className="drive-leg"><i className="bi bi-car-front-fill"></i>{t('{{distance}} · ca. {{duration}} fra forrige stopp', {
                            distance: formatDistance(leg.distanceMeters, locale), duration: formatDuration(leg.durationSeconds),
                          })}</span>
                        )}
                        <span className="visit-tasks"><TaskBadges tasks={visit.tasks} /></span>
                        <span className="visit-actions">
                          {!visit.isDigital && (visit.address || typeof visit.latitude === 'number') && (
                            <a href={navigationUrl(visit)} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm" onClick={(event) => event.stopPropagation()}>
                              <i className="bi bi-sign-turn-right me-1" aria-hidden="true"></i>{t('Kjør hit')}
                            </a>
                          )}
                          <Button variant="outline-primary" size="sm" onClick={(event) => {
                            event.stopPropagation(); setDetailsAppointment(appointmentForVisit(visit.id) ?? null);
                          }}>{t('Vis detaljer')}</Button>
                          {isHeadNurse && (
                            <Button variant="outline-secondary" size="sm" onClick={(event) => {
                              event.stopPropagation();
                              const appointment = appointmentForVisit(visit.id);
                              if (appointment) { setEditAppointment(appointment); setShowEditModal(true); }
                            }}>{t('Endre tidspunkt')}</Button>
                          )}
                        </span>
                      </span>
                    </article>
                  );
                })}
              </div>
            ) : <EmptyState icon="calendar-x" text={t('Ingen planlagte avtaler denne dagen.')} />}
          </SectionCard>
        </div>

        <div className="map-section">
          <SectionCard title={t('Kjørerute for valgt dag')} className="map-card" bodyClassName="map-body p-0">
            <InteractiveVisitMap
              visits={mappedVisits}
              routeCoordinates={route?.coordinates}
              origin={origin}
              originText={t('Din startposisjon')}
              selectedVisitId={selectedVisitId}
              onSelect={setSelectedVisitId}
              noLocationsText={t('Ingen hjemmebesøk denne dagen har en adresse som kan vises på kartet.')}
              appointmentText={(count) => t('Interaktiv kjørerute med {{count}} stopp', { count })}
            />
          </SectionCard>
        </div>
      </div>

      <PlannedVisitModal show={detailsAppointment !== null} onClose={() => setDetailsAppointment(null)} appointment={detailsAppointment} />
      <AppointmentModal show={showEditModal} onClose={() => setShowEditModal(false)} initialData={editAppointment} onSubmit={handleAppointmentSubmit} />
    </div>
  );
};

export default PlanningOverviewPage;
