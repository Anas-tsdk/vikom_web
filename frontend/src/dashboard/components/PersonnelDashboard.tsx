import React, { useState, useEffect } from 'react';
import { Dropdown } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { fetchPersonnelDashboard } from '../services/DashboardService';
import { fetchWeekAvailability } from '../../availability/services/AvailabilityService';
import type { AvailabilitySummary } from '../../availability/types/availability';
import TaskBadges from '../../components/common/TaskBadges';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import StatTile from '../../components/common/StatTile';
import AppointmentCard from '../../appointments/components/AppointmentCard';
import EmptyState from '../../components/common/EmptyState';
import IconButton from '../../components/common/IconButton';
import VisitDetailsModal from '../../visits/components/VisitDetailsModal';
import type { PersonnelViewModel } from '../types/dashboard';
import type { AppointmentSummary } from '../../appointments/types/appointment';
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

// "<weekday> <month> <day> • <start> - <end>" line for the recent appointments list.
const formatRecentDateTime = (appointment: AppointmentSummary, locale: string) => {
  const datePart = appointment.date
    ? new Date(appointment.date).toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' })
    : '';
  return `${datePart} • ${appointment.startTime} - ${appointment.endTime}`;
};

// personnel dashboard component
const PersonnelDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.resolvedLanguage);
  const isHeadNurse = isHeadNurseRole(getUserInfo()?.role);
  const [dashboard, setDashboard] = useState<PersonnelViewModel | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAvailabilityDateKey, setSelectedAvailabilityDateKey] = useState<string>('');
  const [selectedAvailabilityWeekStart, setSelectedAvailabilityWeekStart] = useState<Date>(() => getMonday(new Date()));
  const [availabilityWeek, setAvailabilityWeek] = useState<AvailabilitySummary[]>([]);
  const [availabilityWeekLoading, setAvailabilityWeekLoading] = useState(false);
  const [availabilityWeekError, setAvailabilityWeekError] = useState<string | null>(null);
  const [timelineFilter, setTimelineFilter] = useState<'alle' | 'fysisk' | 'digitalt'>('alle');
  const [detailsVisitId, setDetailsVisitId] = useState<number | null>(null);
  const [displayedMonthDate, setDisplayedMonthDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

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

  useEffect(() => {
    if (!dashboard?.personnelId) return;

    let active = true;
    setAvailabilityWeekLoading(true);
    setAvailabilityWeekError(null);
    fetchWeekAvailability(dashboard.personnelId, formatDateISO(selectedAvailabilityWeekStart))
      .then((week) => {
        if (!active) return;
        setAvailabilityWeek(week.days.flatMap((day) =>
          day.windows.flatMap((window) =>
            (window.slots ?? []).map((slot) => ({
              id: slot.id,
              date: day.date,
              startTime: slot.startTime,
              endTime: slot.endTime,
              notes: window.notes ?? '',
              isBooked: slot.isBooked,
            })),
          ),
        ));
      })
      .catch(() => {
        if (!active) return;
        setAvailabilityWeek([]);
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
  const displayedYear = displayedMonthDate.getFullYear();
  const displayedMonth = displayedMonthDate.getMonth();
  const firstDayOfMonth = new Date(displayedYear, displayedMonth, 1);
  const daysInMonth = new Date(displayedYear, displayedMonth + 1, 0).getDate();
  const daysInPreviousMonth = new Date(displayedYear, displayedMonth, 0).getDate();
  const firstDayWeekIndex = (firstDayOfMonth.getDay() + 6) % 7;
  const totalCalendarCells = 42;

  const monthLabel = firstDayOfMonth.toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });

  const weekDayLabels = Array.from({ length: 7 }, (_, index) =>
    new Date(2024, 0, 1 + index).toLocaleDateString(locale, { weekday: 'narrow' }),
  );

  const appointmentDateSet = new Set(
    dashboard.upcomingAppointments.map((appointment) => {
      const date = new Date(appointment.date);
      date.setHours(0, 0, 0, 0);
      return date.getTime();
    })
  );

  const calendarDays = Array.from({ length: totalCalendarCells }, (_, index) => {
    const dayOffset = index - firstDayWeekIndex;
    const dayNumber = dayOffset + 1;

    if (dayNumber <= 0) {
      const previousMonthDate = new Date(displayedYear, displayedMonth - 1, daysInPreviousMonth + dayNumber);
      previousMonthDate.setHours(0, 0, 0, 0);
      return {
        key: `prev-${index}`,
        date: previousMonthDate,
        day: previousMonthDate.getDate(),
        isCurrentMonth: false,
      };
    }

    if (dayNumber > daysInMonth) {
      const nextMonthDate = new Date(displayedYear, displayedMonth + 1, dayNumber - daysInMonth);
      nextMonthDate.setHours(0, 0, 0, 0);
      return {
        key: `next-${index}`,
        date: nextMonthDate,
        day: nextMonthDate.getDate(),
        isCurrentMonth: false,
      };
    }

    const currentMonthDate = new Date(displayedYear, displayedMonth, dayNumber);
    currentMonthDate.setHours(0, 0, 0, 0);
    return {
      key: `current-${dayNumber}`,
      date: currentMonthDate,
      day: dayNumber,
      isCurrentMonth: true,
    };
  });

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
      const notesMatch = notes.match(/^([^,]+),\s*(.+)$/);
      const zone = notesMatch ? notesMatch[1].trim() : '';
      const address = notesMatch ? notesMatch[2].trim() : notes;

      return {
        id: appointment.id,
        startTime: appointment.startTime,
        endTime: appointment.endTime,
        patientName: appointment.patientName,
        tasks: appointment.tasks,
        zone,
        address,
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
  const availabilityByDate = availabilityWeek
    .reduce<Record<string, AvailabilitySummary[]>>((groupedAvailability, availability) => {
      const dateKey = availability.date;

      if (!groupedAvailability[dateKey]) {
        groupedAvailability[dateKey] = [];
      }

      groupedAvailability[dateKey].push(availability);
      return groupedAvailability;
    }, {});

  const orderedAvailabilityDateKeys = Object.keys(availabilityByDate)
    .sort((firstKey, secondKey) => firstKey.localeCompare(secondKey));

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

  const defaultAvailabilityDateKey =
    availabilityWindowDays.some((day) => day.dateKey === todayDateKey) &&
    availabilityByDate[todayDateKey]
      ? todayDateKey
      : orderedAvailabilityDateKeys[0] ?? availabilityWindowDays[0]?.dateKey ?? todayDateKey;

  const activeAvailabilityDateKey = selectedAvailabilityDateKey || defaultAvailabilityDateKey;

  const activeAvailabilityDate = parseDateKey(activeAvailabilityDateKey);
  const activeAvailabilityDateLabel = Number.isNaN(activeAvailabilityDate.getTime())
    ? ''
    : activeAvailabilityDate.toLocaleDateString(locale, { day: 'numeric', month: 'long' });

  const currentMinutes = toMinutes(nowTimeLabel);

  const selectedDaySlots = (availabilityByDate[activeAvailabilityDateKey] ?? [])
    .filter((availability) => {
      if (activeAvailabilityDateKey !== todayDateKey) {
        return true;
      }

      return toMinutes(availability.endTime) >= currentMinutes;
    })
    .sort((firstAvailability, secondAvailability) => toMinutes(firstAvailability.startTime) - toMinutes(secondAvailability.startTime));

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

  const selectCalendarDate = (date: Date) => {
    const selectedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    setSelectedAvailabilityDateKey(toDateKey(selectedDate));
    setSelectedAvailabilityWeekStart(getMonday(selectedDate));
    if (selectedDate.getMonth() !== displayedMonth || selectedDate.getFullYear() !== displayedYear) {
      setDisplayedMonthDate(new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
    }
  };

  return (
    <div className="personnel-dashboard">
      <PageHeader
        title={t('Velkommen tilbake, {{name}}!', { name: dashboard.personnelName })}
        subtitle={t('Her er en oversikt over timeplanen og pasientene dine')}
      />

      {/* displays quick stats overview with key metrics */}
      <div className="stats-grid">
        <StatTile icon="people" label={t('Pasienter')} value={dashboard.totalPatients} />
        <StatTile icon="calendar-check" label={t('Denne uken')} value={dashboard.appointmentsThisWeek} />
        <StatTile icon="clock" label={t('Planlagte')} value={dashboard.pendingAppointments} />
        <StatTile icon="x-circle" label={t('Avlyste')} value={dashboard.cancelledAppointments} />
      </div>

      <div className="top-content">
        <div className="mini-column">
          {/* Calendar overview section */}
          <SectionCard title={t('Kalenderoversikt')} icon="calendar3" className="calendar-overview">
            <div className="calendar-header-row">
              <button
                type="button"
                className="calendar-nav-btn"
                aria-label={t('Forrige måned')}
                onClick={() => setDisplayedMonthDate(new Date(displayedYear, displayedMonth - 1, 1))}
              >
                <i className="bi bi-chevron-left"></i>
              </button>
              <h3 className="calendar-month-label">{monthLabel}</h3>
              <button
                type="button"
                className="calendar-nav-btn"
                aria-label={t('Neste måned')}
                onClick={() => setDisplayedMonthDate(new Date(displayedYear, displayedMonth + 1, 1))}
              >
                <i className="bi bi-chevron-right"></i>
              </button>
            </div>

            <div className="calendar-weekdays" role="presentation">
              {weekDayLabels.map((label, index) => (
                <span key={`${label}-${index}`} className="calendar-weekday">
                  {label}
                </span>
              ))}
            </div>

            <div className="calendar-grid">
              {calendarDays.map((calendarDay) => {
                const isInSelectedWeek =
                  calendarDay.date >= selectedAvailabilityWeekStart &&
                  calendarDay.date < new Date(
                    selectedAvailabilityWeekStart.getFullYear(),
                    selectedAvailabilityWeekStart.getMonth(),
                    selectedAvailabilityWeekStart.getDate() + 7,
                  );

                const isToday =
                  calendarDay.date.getDate() === today.getDate() &&
                  calendarDay.date.getMonth() === today.getMonth() &&
                  calendarDay.date.getFullYear() === today.getFullYear();

                const hasAppointment = appointmentDateSet.has(calendarDay.date.getTime());
                const isSelectedDay = toDateKey(calendarDay.date) === activeAvailabilityDateKey;

                return (
                  <button
                    key={calendarDay.key}
                    type="button"
                    className={`calendar-day ${calendarDay.isCurrentMonth ? '' : 'outside-month'} ${isInSelectedWeek ? 'selected-week' : ''} ${isToday ? 'today' : ''} ${isSelectedDay ? 'selected-day' : ''} ${hasAppointment ? 'has-appointment' : ''}`}
                    aria-label={calendarDay.date.toLocaleDateString(locale, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    aria-pressed={isSelectedDay}
                    onClick={() => selectCalendarDate(calendarDay.date)}
                  >
                    <span className="day-number">{calendarDay.day}</span>
                    {hasAppointment && <span className="appointment-dot" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            title={t('Dagens tidslinje')}
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
                        <div className={`timeline-item timeline-tone-${item.tone} ${item.isCurrent ? 'active' : ''} ${item.isPast ? 'past' : ''}`}>
                          <div className="timeline-item-content">
                            <p className="timeline-patient-name">{item.patientName}</p>
                            <TaskBadges tasks={item.tasks} variant="secondary" className="timeline-task-badges" />
                            {item.visitType === 'Fysisk' ? (
                              <p className="timeline-address">{item.zone && item.address ? `${item.zone}, ${item.address}` : (item.address || item.zone || t('Adresse ikke oppgitt'))}</p>
                            ) : (
                              <p className="timeline-visit-type">{t('Digitalt besøk')}</p>
                            )}
                          </div>
                        </div>
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
          <div className="availability-quick-actions" role="group" aria-label={t('Hurtighandlinger')}>
            {isHeadNurse && (
              <button
                type="button"
                className="quick-action-btn"
                onClick={() => navigate('/appointments?ny=1')}
              >
                <i className="bi bi-calendar-plus"></i>
                <span>{t('Legg til nytt besøk')}</span>
              </button>
            )}

            <button
              type="button"
              className="quick-action-btn"
              onClick={() => navigate('/availability')}
            >
              <i className="bi bi-arrow-repeat"></i>
              <span>{t('Oppdater tilgjengelighet')}</span>
            </button>

            <button
              type="button"
              className="quick-action-btn"
              onClick={() => navigate('/planning')}
            >
              <i className="bi bi-geo-alt"></i>
              <span>{t('Vis kart')}</span>
            </button>
          </div>

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
                  <div className="availability-days-nav">
                    <div className="availability-days-strip">
                      {availabilityWindowDays.map((day) => {
                        const hasSlots = Boolean(availabilityByDate[day.dateKey]);
                        const isActive = day.dateKey === activeAvailabilityDateKey;

                        return (
                          <button
                            key={day.dateKey}
                            type="button"
                            className={`availability-day-chip ${isActive ? 'active' : ''}`}
                            onClick={() => setSelectedAvailabilityDateKey(day.dateKey)}
                          >
                            <span className="availability-day-chip-label">{day.label}</span>
                            <span className="availability-day-chip-number">{day.date.getDate()}</span>
                            <span className="availability-day-chip-month">
                              {day.date.toLocaleDateString(locale, { month: 'short' })}
                            </span>
                            {hasSlots && <span className="availability-day-dot"></span>}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {activeAvailabilityDateLabel && (
                    <p className="availability-active-date">{activeAvailabilityDateLabel}</p>
                  )}

                  {selectedDaySlots.length > 0 ? (
                    <div className="availability-slots-grid">
                      {selectedDaySlots.map((availability) => (
                        <div
                          key={availability.id}
                          className={`availability-slot-card ${availability.isBooked ? 'booked' : 'available'}`}
                        >
                          <span className="availability-slot-time">{availability.startTime}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState icon="calendar-x" text={t('Ingen tilgjengelige tider for valgt dag.')} />
                  )}
                </div>
              )}
          </SectionCard>

          <SectionCard
            title={t('Siste avtaler')}
            icon="clock-history"
            action={
              <Link to="/appointments/archive" className="btn btn-secondary btn-sm">
                {t('Besøksarkiv')}
              </Link>
            }
          >
              {dashboard.recentAppointments.length > 0 ? (
                <div className="d-flex flex-column gap-3">
                  {dashboard.recentAppointments.map((appointment) => (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      dateTimeText={formatRecentDateTime(appointment, locale)}
                      subject={appointment.patientName ? t('Pasient: {{name}}', { name: appointment.patientName }) : null}
                      actions={
                        appointment.visitId ? (
                          <IconButton
                            icon="journal-text"
                            title={t('Besøksdetaljer')}
                            onClick={() => setDetailsVisitId(appointment.visitId ?? null)}
                          />
                        ) : undefined
                      }
                    />
                  ))}
                </div>
              ) : (
                <EmptyState icon="calendar-x" text={t('Ingen nylige avtaler å vise.')} />
              )}
          </SectionCard>
        </div>
      </div>

      {/*
        Kommende avtaler er midlertidig kommentert ut etter ønske.
      */}

      <VisitDetailsModal
        show={detailsVisitId !== null}
        onClose={() => setDetailsVisitId(null)}
        visitId={detailsVisitId}
      />

    </div>
  );
};

export default PersonnelDashboard;
