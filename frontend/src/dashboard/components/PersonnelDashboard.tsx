import React, { useState, useEffect } from 'react';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { fetchPersonnelDashboard } from '../services/DashboardService';
import PatientService from '../../patients/services/PatientService';
import type { PatientDetailsDto } from '../../patients/types/patient';
import { fetchWeekAvailability } from '../../availability/services/AvailabilityService';
import type { WeekAvailability } from '../../availability/types/availability';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import StatTile from '../../components/common/StatTile';
import EmptyState from '../../components/common/EmptyState';
import type { PersonnelViewModel } from '../types/dashboard';
import { localeForLanguage } from '../../i18n';
import { getUserInfo } from '../../auth/AuthService';
import { isHeadNurseRole } from '../../auth/roles';
import { formatDateISO, getMonday } from '../../utils/dateUtils';
import './PersonnelDashboard.css';

// Visible labels for the timeline visit-type filter dropdown.
const TIMELINE_FILTER_LABELS: Record<'alle' | 'fysisk' | 'digitalt', string> = {
  alle: 'Alle',
  fysisk: 'Fysisk',
  digitalt: 'Digitalt',
};

const SCHEDULE_START_MINUTES = 6 * 60;
const SCHEDULE_END_MINUTES = 22 * 60;
const SCHEDULE_DURATION_MINUTES = SCHEDULE_END_MINUTES - SCHEDULE_START_MINUTES;

// personnel dashboard component
const PersonnelDashboard: React.FC = () => {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.resolvedLanguage);
  const isHeadNurse = isHeadNurseRole(getUserInfo()?.role);
  const [dashboard, setDashboard] = useState<PersonnelViewModel | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAvailabilityDateKey, setSelectedAvailabilityDateKey] = useState<string>('');
  const [selectedAvailabilityWeekStart, setSelectedAvailabilityWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [availabilityWeek, setAvailabilityWeek] = useState<WeekAvailability | null>(null);
  const [availabilityWeekLoading, setAvailabilityWeekLoading] = useState(false);
  const [availabilityWeekError, setAvailabilityWeekError] = useState<string | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<'alle' | 'fysisk' | 'digitalt'>('alle');
  const [nextVisitPatient, setNextVisitPatient] = useState<PatientDetailsDto | null>(null);
  const [nextVisitPatientError, setNextVisitPatientError] = useState<string | null>(null);

  // fetches dashboard data on mount
  useEffect(() => {
    const loadDashboard = async () => {
      try {
        setLoading(true);
        const data = await fetchPersonnelDashboard();
        setDashboard(data);
      } catch {
        setError(t('Kunne ikke laste dashboarddata'));
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, [t]);

  const nextVisitPatientId = dashboard?.upcomingAppointments[0]?.patientId;

  useEffect(() => {
    if (!nextVisitPatientId) {
      setNextVisitPatient(null);
      setNextVisitPatientError(null);
      return;
    }

    let active = true;
    setNextVisitPatient(null);
    setNextVisitPatientError(null);
    PatientService.getById(nextVisitPatientId)
      .then((patient) => {
        if (active) setNextVisitPatient(patient);
      })
      .catch((loadError: unknown) => {
        console.error('Error loading next-visit patient details:', loadError);
        if (active) setNextVisitPatientError(t('Kunne ikke laste pasientdetaljer.'));
      });

    return () => { active = false; };
  }, [nextVisitPatientId, t]);

  useEffect(() => {
    if (!dashboard?.personnelId) return;

    let active = true;
    setAvailabilityWeekLoading(true);
    setAvailabilityWeekError(null);
    fetchWeekAvailability(dashboard.personnelId, formatDateISO(selectedAvailabilityWeekStart))
      .then((week) => {
        if (!active) return;
        setAvailabilityWeek(week);
      })
      .catch(() => {
        if (!active) return;
        setAvailabilityWeek(null);
        setAvailabilityWeekError(t('Kunne ikke laste tilgjengelighet.'));
      })
      .finally(() => {
        if (active) setAvailabilityWeekLoading(false);
      });

    return () => { active = false; };
  }, [dashboard?.personnelId, selectedAvailabilityWeekStart, t]);

  // renders loading state while fetching data
  if (loading) {
    return (
      <div className="personnel-dashboard">
        <p>{t('Laster dashboard...')}</p>
      </div>
    );
  }

  // renders error state if data fetch fails
  if (error || !dashboard) {
    return (
      <div className="personnel-dashboard">
        <p className="error-text">{error || t('Kunne ikke laste dashboard')}</p>
      </div>
    );
  }

  const today = new Date();

  const dayTimelineDateLabel = today.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'long',
  });

  const nowTimeLabel = today.toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);
    return (hours * 60) + minutes;
  };

  const getVisitType = (notes: string) => (/^digitalt$/i.test(notes.trim()) ? 'Digitalt' : 'Fysisk');

  const toDateKey = (date: Date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const parseDateKey = (dateKey: string) => {
    const [year, month, day] = dateKey.split('-').map(Number);

    if (!year || !month || !day) {
      return new Date('');
    }

    return new Date(year, month - 1, day);
  };

  const isSameDay = (firstDate: Date, secondDate: Date) =>
    firstDate.getFullYear() === secondDate.getFullYear()
    && firstDate.getMonth() === secondDate.getMonth()
    && firstDate.getDate() === secondDate.getDate();

  const todayTimelineItems = dashboard.upcomingAppointments
    .filter((appointment) => isSameDay(new Date(appointment.date), today))
    .sort((firstAppointment, secondAppointment) => toMinutes(firstAppointment.startTime) - toMinutes(secondAppointment.startTime))
    .filter((appointment, index, allAppointments) => {
      const duplicateIndex = allAppointments.findIndex((candidate) =>
        candidate.startTime === appointment.startTime
      );

      return duplicateIndex === index;
    })
    .map((appointment) => {
      const notes = appointment.availabilityNotes?.trim() ?? '';
      const visitType = getVisitType(notes);
      return {
        id: appointment.id,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        patientName: appointment.patientName,
        tasks: appointment.tasks,
        visitType,
        tone: visitType === 'Digitalt' ? 'blue' : 'olive',
      };
    });

  const timelineItems = todayTimelineItems.filter((item) => {
    if (timelineFilter === 'alle') {
      return true;
    }

    if (timelineFilter === 'fysisk') {
      return item.visitType === 'Fysisk';
    }

    return item.visitType === 'Digitalt';
  });

  const todayDateKey = toDateKey(today);
  const moveAvailabilityWeek = (offset: number) => {
    const next = new Date(selectedAvailabilityWeekStart);
    next.setDate(next.getDate() + offset * 7);
    setSelectedAvailabilityWeekStart(next);
    setSelectedAvailabilityDateKey(toDateKey(next));
  };

  const baseWindowDate = new Date(today);
  baseWindowDate.setFullYear(
    selectedAvailabilityWeekStart.getFullYear(),
    selectedAvailabilityWeekStart.getMonth(),
    selectedAvailabilityWeekStart.getDate(),
  );

  const availabilityWindowDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(baseWindowDate);
    date.setDate(baseWindowDate.getDate() + index);
    const dateKey = toDateKey(date);
    const dayName = date.toLocaleDateString(locale, { weekday: 'short' });

    return {
      date,
      dateKey,
      label: dateKey === todayDateKey ? t('I dag') : `${dayName.charAt(0).toUpperCase()}${dayName.slice(1)}`,
    };
  });

  const defaultAvailabilityDateKey = todayDateKey;

  const activeAvailabilityDateKey = selectedAvailabilityDateKey || defaultAvailabilityDateKey;

  const activeAvailabilityDate = parseDateKey(activeAvailabilityDateKey);
  const activeAvailabilityDateLabel = Number.isNaN(activeAvailabilityDate.getTime())
    ? ''
    : activeAvailabilityDate.toLocaleDateString(locale, { day: 'numeric', month: 'long' });

  const currentMinutes = toMinutes(nowTimeLabel);

  const selectedAvailabilityDay = availabilityWeek?.days
    .find((day) => day.date === activeAvailabilityDateKey);
  const selectedDayAppointments = (selectedAvailabilityDay?.appointments ?? [])
    .filter((appointment) => ['booked', 'inprogress'].includes(appointment.status.toLowerCase()))
    .sort((firstAppointment, secondAppointment) =>
      toMinutes(firstAppointment.startTime) - toMinutes(secondAppointment.startTime),
    );
  const scheduleHourMarks = Array.from(
    { length: SCHEDULE_DURATION_MINUTES / 60 + 1 },
    (_, index) => SCHEDULE_START_MINUTES + index * 60,
  );
  const positionedAppointments = selectedDayAppointments.flatMap((appointment) => {
    const start = toMinutes(appointment.startTime);
    const end = toMinutes(appointment.endTime);
    const visibleStart = Math.max(start, SCHEDULE_START_MINUTES);
    const visibleEnd = Math.min(end, SCHEDULE_END_MINUTES);

    if (visibleEnd <= visibleStart) return [];

    return [{
      ...appointment,
      left: ((visibleStart - SCHEDULE_START_MINUTES) / SCHEDULE_DURATION_MINUTES) * 100,
      width: ((visibleEnd - visibleStart) / SCHEDULE_DURATION_MINUTES) * 100,
      label: `${appointment.startTime}–${appointment.endTime} · ${appointment.patientName}${appointment.tasks ? ` · ${appointment.tasks}` : ''}`,
    }];
  });

  const timelineItemsWithState = timelineItems.map((item) => {
    const startMinutes = toMinutes(item.startTime);
    const endMinutes = toMinutes(item.endTime);
    const isCurrent = currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    const isPast = currentMinutes > endMinutes;

    return {
      ...item,
      isCurrent,
      isPast,
    };
  });

  const hasCurrentTimelineItem = timelineItemsWithState.some((item) => item.isCurrent);
  const timelineStartMinutes = timelineItems.length > 0 ? toMinutes(timelineItems[0].startTime) : -1;
  const timelineEndMinutes = timelineItems.length > 0 ? toMinutes(timelineItems[timelineItems.length - 1].endTime) : -1;

  const shouldShowNowMarker =
    !hasCurrentTimelineItem && currentMinutes >= timelineStartMinutes && currentMinutes <= timelineEndMinutes;

  const nowMarkerIndex = timelineItems.findIndex((item) => currentMinutes < toMinutes(item.startTime));


  return (
    <div className="personnel-dashboard">
      <PageHeader
        title={t('Velkommen tilbake, {{name}}!', { name: dashboard.personnelName })}
        subtitle={t('Her er en oversikt over timeplanen og pasientene dine')}
        actions={(
          <>
            {isHeadNurse && (
              <Link to="/appointments/create" className="btn btn-primary">
                <i className="bi bi-calendar-plus me-2" aria-hidden="true"></i>
                {t('Opprett avtale')}
              </Link>
            )}
            <Link to="/availability" className="btn btn-outline-secondary">
              <i className="bi bi-arrow-repeat me-2" aria-hidden="true"></i>
              {t('Oppdater tilgjengelighet')}
            </Link>
            <Link to="/planning" className="btn btn-outline-secondary">
              <i className="bi bi-geo-alt me-2" aria-hidden="true"></i>
              {t('Daily route')}
            </Link>
          </>
        )}
      />

      {/* displays quick stats overview with key metrics */}
      <div className="stats-grid">
        <StatTile icon="people" label={t('Pasienter')} value={dashboard.totalPatients} />
        <StatTile icon="calendar-check" label={t('Denne uken')} value={dashboard.appointmentsThisWeek} />
        <StatTile icon="clock" label={t('Planlagte')} value={dashboard.pendingAppointments} />
        <StatTile icon="x-circle" label={t('Avlyste')} value={dashboard.cancelledAppointments} />
      </div>

      {dashboard.upcomingAppointments[0] && (
        <SectionCard title={t('Next visit')} icon="signpost-split" className="next-visit-card">
          {(() => {
            const appointment = dashboard.upcomingAppointments[0];
            const patientKey = appointment.patientId ?? appointment.patientUsername;
            const patientHref = patientKey
              ? `/patients/${encodeURIComponent(patientKey)}`
              : '/patients';
            const journalHref = `/besok/${appointment.id}${appointment.visitType === 'Digital' ? '?type=Digital' : ''}`;
            const accessInstructions =
              nextVisitPatient?.clinical.accessInstructions ?? appointment.patientAccessInstructions;
            const medicationEquipmentNotes =
              nextVisitPatient?.clinical.medicationEquipmentNotes ?? appointment.patientMedicationEquipmentNotes;
            return (
              <div className="next-visit-content">
                <div className="next-visit-details">
                  <div className="next-visit-primary">
                    <div className="fw-bold fs-5">{appointment.patientName}</div>
                    <div className="text-muted">
                    {new Date(appointment.date).toLocaleDateString(locale, {
                      weekday: 'long', day: 'numeric', month: 'long',
                    })} · {appointment.startTime}–{appointment.endTime}
                    </div>
                    {appointment.patientAddress && (
                      <div className="mt-2"><i className="bi bi-geo-alt me-2" aria-hidden="true"></i>{appointment.patientAddress}</div>
                    )}
                    <div className="next-visit-national-id">
                      <strong>{t('Personnummer')}:</strong>{' '}
                      {nextVisitPatient?.socialSecurityNumber || t('Ikke oppgitt')}
                    </div>
                  </div>
                  <div className="next-visit-preparation">
                    {appointment.tasks && (
                      <div><strong>{t('Tasks')}:</strong> {appointment.tasks}</div>
                    )}
                    <div>
                      <strong>{t('Tilgang til boligen')}:</strong>{' '}
                      {accessInstructions || t('Ikke oppgitt')}
                    </div>
                    <div>
                      <strong>{t('Medisin og utstyr')}:</strong>{' '}
                      {medicationEquipmentNotes || t('Ikke oppgitt')}
                    </div>
                    {nextVisitPatientError && (
                      <div className="text-danger">{nextVisitPatientError}</div>
                    )}
                  </div>
                </div>
                <div className="next-visit-actions">
                  <Link to={patientHref} className="btn btn-outline-primary">
                    <i className="bi bi-person-lines-fill me-2" aria-hidden="true"></i>{t('Open patient details')}
                  </Link>
                  <Link to={journalHref} className="btn btn-primary">
                    <i className="bi bi-journal-text me-2" aria-hidden="true"></i>
                    {appointment.visitId ? t('Open journal') : t('Start visit')}
                  </Link>
                </div>
              </div>
            );
          })()}
        </SectionCard>
      )}

      <div className="top-content">
        <div className="mini-column">
          <SectionCard
            title={t('Kommende avtaler')}
            icon="clock"
            className="timeline-overview"
            action={
              <Dropdown
                className="timeline-filter"
                onSelect={(key) => setTimelineFilter((key as 'alle' | 'fysisk' | 'digitalt') ?? 'alle')}
              >
                <Dropdown.Toggle
                  variant="secondary"
                  className="timeline-filter-toggle"
                  aria-label={t('Filtrer tidslinje')}
                >
                  {t(TIMELINE_FILTER_LABELS[timelineFilter])}
                  <i className="bi bi-chevron-down" aria-hidden="true"></i>
                </Dropdown.Toggle>
                <Dropdown.Menu
                  align="end"
                  className="timeline-filter-menu"
                  popperConfig={{ modifiers: [{ name: 'offset', options: { offset: [0, 6] } }] }}
                >
                  {(Object.keys(TIMELINE_FILTER_LABELS) as Array<'alle' | 'fysisk' | 'digitalt'>).map((key) => (
                    <Dropdown.Item key={key} eventKey={key} active={timelineFilter === key}>
                      {t(TIMELINE_FILTER_LABELS[key])}
                    </Dropdown.Item>
                  ))}
                </Dropdown.Menu>
              </Dropdown>
            }
          >
              <p className="timeline-date-label">{dayTimelineDateLabel}</p>

              {timelineItemsWithState.length > 0 ? (
                <div className="timeline-list">
                  {timelineItemsWithState.map((item, index) => (
                    <React.Fragment key={item.id}>
                      {shouldShowNowMarker && index === nowMarkerIndex && (
                        <div className="timeline-now-row">
                          <div className="timeline-time timeline-now-time">{nowTimeLabel}</div>
                          <div className="timeline-now-line"></div>
                        </div>
                      )}

                      <div className={`timeline-row ${item.isCurrent ? 'active' : ''} ${item.isPast ? 'past' : ''}`}>
                        <div className="timeline-time">{item.isCurrent ? nowTimeLabel : item.startTime}</div>
                        <div
                          className={`timeline-item timeline-tone-${item.tone} ${item.isCurrent ? 'active' : ''} ${item.isPast ? 'past' : ''}`}
                          role="img"
                          aria-label={`${item.patientName}, ${item.startTime}–${item.endTime}${item.tasks ? `, ${item.tasks}` : ''}`}
                          title={`${item.patientName} · ${item.startTime}–${item.endTime}`}
                        />
                      </div>
                    </React.Fragment>
                  ))}

                  {shouldShowNowMarker && nowMarkerIndex === -1 && (
                    <div className="timeline-now-row">
                      <div className="timeline-time timeline-now-time">{nowTimeLabel}</div>
                      <div className="timeline-now-line"></div>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState icon="calendar-x" text={t('Ingen planlagte avtaler i dag.')} />
              )}

              <Link to="/availability" className="btn btn-secondary btn-sm w-100 mt-3">
                {t('Vis mer')}
              </Link>
          </SectionCard>
        </div>

        <div className="availability-column">
          <SectionCard
            title={t('Kommende tilgjengelighet')}
            icon="calendar-week"
            className="availability-overview"
            action={
              <Link to="/availability" className="btn btn-secondary btn-sm" aria-label={t('Se tilgjengelighet')}>
                <i className="bi bi-plus-lg"></i>
              </Link>
            }
          >
            {availabilityWeekLoading ? (
                <p className="mb-0" role="status">{t('Laster tilgjengelighet...')}</p>
              ) : availabilityWeekError ? (
                <p className="text-danger mb-0" role="alert">{availabilityWeekError}</p>
              ) : (
                <div className="availability-day-planner">
                  <div className="availability-days-nav d-flex align-items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm flex-shrink-0"
                      aria-label={t('Forrige uke')}
                      onClick={() => moveAvailabilityWeek(-1)}
                    >
                      <i className="bi bi-chevron-left" aria-hidden="true"></i>
                    </button>
                    <div className="availability-days-strip flex-grow-1">
                      {availabilityWindowDays.map((day) => {
                        const isActive = day.dateKey === activeAvailabilityDateKey;

                        return (
                          <button
                            key={day.dateKey}
                            type="button"
                            className={`availability-day-chip ${isActive ? 'active' : ''}`}
                            aria-pressed={isActive}
                            aria-label={day.date.toLocaleDateString(locale, {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                            })}
                            onClick={() => setSelectedAvailabilityDateKey(day.dateKey)}
                          >
                            <span className="availability-day-chip-label">{day.label}</span>
                            <span className="availability-day-chip-number">{day.date.getDate()}</span>
                            <span className="availability-day-chip-month">
                              {day.date.toLocaleDateString(locale, { month: 'short' })}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <button
                      type="button"
                      className="btn btn-outline-secondary btn-sm flex-shrink-0"
                      aria-label={t('Neste uke')}
                      onClick={() => moveAvailabilityWeek(1)}
                    >
                      <i className="bi bi-chevron-right" aria-hidden="true"></i>
                    </button>
                  </div>

                  {activeAvailabilityDateLabel && (
                    <p className="availability-active-date">{activeAvailabilityDateLabel}</p>
                  )}

                  <section className="availability-appointments" aria-label={t('Planlagte besøk')}>
                    <h4 className="availability-timeline-heading">{t('Planlagte besøk')}</h4>
                    <div className="availability-timeline-scroll">
                      <div className="availability-schedule">
                        <div className="availability-time-ruler" aria-hidden="true">
                          {scheduleHourMarks.map((minute) => (
                            <span
                              className="availability-time-mark"
                              key={minute}
                              style={{
                                left: `${((minute - SCHEDULE_START_MINUTES) / SCHEDULE_DURATION_MINUTES) * 100}%`,
                              }}
                            >
                              {String(Math.floor(minute / 60) % 24).padStart(2, '0')}
                            </span>
                          ))}
                        </div>
                        {positionedAppointments.length > 0 ? (
                          <div
                            className="availability-schedule-track"
                            style={{ height: '3rem' }}
                            role="list"
                          >
                            {positionedAppointments.map((appointment) => (
                              <article
                                className={`availability-schedule-event ${appointment.width < 4.2 ? 'compact' : ''}`}
                                key={appointment.id}
                                style={{
                                  left: `${appointment.left}%`,
                                  width: `${appointment.width}%`,
                                }}
                                title={appointment.label}
                                aria-label={appointment.label}
                                role="listitem"
                              >
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="availability-schedule-empty">
                            <EmptyState icon="calendar-x" text={t('Ingen planlagte avtaler denne dagen.')} />
                          </div>
                        )}
                      </div>
                    </div>
                  </section>
                </div>
              )}
          </SectionCard>

        </div>
      </div>

      {/*
        Kommende avtaler er midlertidig kommentert ut etter ønske.
      */}

    </div>
  );
};

export default PersonnelDashboard;
