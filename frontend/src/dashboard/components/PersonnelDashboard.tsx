import React, { useState, useEffect } from 'react';
import { Dropdown } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { fetchPersonnelDashboard } from '../services/DashboardService';
import TaskBadges from '../../components/common/TaskBadges';
import PageHeader from '../../components/common/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import StatTile from '../../components/common/StatTile';
import AppointmentCard from '../../appointments/components/AppointmentCard';
import EmptyState from '../../components/common/EmptyState';
import type { PersonnelViewModel } from '../types/dashboard';
import type { AppointmentSummary } from '../../appointments/types/appointment';
import './PersonnelDashboard.css';

// Visible labels for the timeline visit-type filter dropdown.
const TIMELINE_FILTER_LABELS: Record<'alle' | 'fysisk' | 'digitalt', string> = {
  alle: 'Alle',
  fysisk: 'Fysisk',
  digitalt: 'Digitalt',
};

// "<weekday> <month> <day> • <start> - <end>" line for the recent appointments list.
const formatRecentDateTime = (appointment: AppointmentSummary) => {
  const datePart = appointment.date
    ? new Date(appointment.date).toLocaleDateString('nb-NO', { weekday: 'long', month: 'short', day: 'numeric' })
    : '';
  return `${datePart} • ${appointment.startTime} - ${appointment.endTime}`;
};

// personnel dashboard component
const PersonnelDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<PersonnelViewModel | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedAvailabilityDateKey, setSelectedAvailabilityDateKey] = useState<string>('');
  const [timelineFilter, setTimelineFilter] = useState<'alle' | 'fysisk' | 'digitalt'>('alle');
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
        setError('Kunne ikke laste dashboarddata');
      } finally {
        setLoading(false);
      }
    };

    loadDashboard();
  }, []);

  // renders loading state while fetching data
  if (loading) {
    return (
      <div className="personnel-dashboard">
        <p>Laster dashboard...</p>
      </div>
    );
  }

  // renders error state if data fetch fails
  if (error || !dashboard) {
    return (
      <div className="personnel-dashboard">
        <p className="error-text">{error || 'Kunne ikke laste dashboard'}</p>
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

  const monthLabel = firstDayOfMonth.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  const weekDayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const currentWeekStart = new Date(today);
  currentWeekStart.setHours(0, 0, 0, 0);
  const mondayOffset = (today.getDay() + 6) % 7;
  currentWeekStart.setDate(today.getDate() - mondayOffset);

  const currentWeekEnd = new Date(currentWeekStart);
  currentWeekEnd.setDate(currentWeekStart.getDate() + 6);

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

  const dayTimelineDateLabel = today.toLocaleDateString('nb-NO', {
    day: 'numeric',
    month: 'long',
  });

  const nowTimeLabel = today.toLocaleTimeString('nb-NO', {
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
  const availabilityWeekEnd = new Date(today);
  availabilityWeekEnd.setHours(23, 59, 59, 999);
  availabilityWeekEnd.setDate(today.getDate() + 6);

  const isWithinAvailabilityWeek = (date: Date) => {
    const normalizedDate = new Date(date);
    normalizedDate.setHours(0, 0, 0, 0);

    const normalizedToday = new Date(today);
    normalizedToday.setHours(0, 0, 0, 0);

    return normalizedDate >= normalizedToday && normalizedDate <= availabilityWeekEnd;
  };

  const availabilityByDate = dashboard.upcomingAvailability
    .reduce<Record<string, typeof dashboard.upcomingAvailability>>((groupedAvailability, availability) => {
      const date = new Date(availability.date);
      if (!isWithinAvailabilityWeek(date)) {
        return groupedAvailability;
      }

      const dateKey = toDateKey(date);

      if (!groupedAvailability[dateKey]) {
        groupedAvailability[dateKey] = [];
      }

      groupedAvailability[dateKey].push(availability);
      return groupedAvailability;
    }, {});

  const orderedAvailabilityDateKeys = Object.keys(availabilityByDate)
    .sort((firstKey, secondKey) => firstKey.localeCompare(secondKey));

  const baseWindowDate = new Date(today);

  const availabilityWindowDays = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(baseWindowDate);
    date.setDate(baseWindowDate.getDate() + index);
    const dateKey = toDateKey(date);
    const dayName = date.toLocaleDateString('nb-NO', { weekday: 'short' });

    return {
      date,
      dateKey,
      label: index === 0 && dateKey === todayDateKey ? 'I dag' : `${dayName.charAt(0).toUpperCase()}${dayName.slice(1)}`,
    };
  });

  const defaultAvailabilityDateKey =
    availabilityByDate[todayDateKey]
      ? todayDateKey
      : orderedAvailabilityDateKeys[0] ?? availabilityWindowDays[0]?.dateKey ?? todayDateKey;

  const activeAvailabilityDateKey = selectedAvailabilityDateKey || defaultAvailabilityDateKey;

  const activeAvailabilityDate = parseDateKey(activeAvailabilityDateKey);
  const activeAvailabilityDateLabel = Number.isNaN(activeAvailabilityDate.getTime())
    ? ''
    : activeAvailabilityDate.toLocaleDateString('nb-NO', { day: 'numeric', month: 'long' });

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

  return (
    <div className="personnel-dashboard">
      <PageHeader
        title={`Velkommen tilbake, ${dashboard.personnelName}!`}
        subtitle="Her er en oversikt over timeplanen og pasientene dine"
      />

      {/* displays quick stats overview with key metrics */}
      <div className="stats-grid">
        <StatTile icon="people" label="Pasienter" value={dashboard.totalPatients} />
        <StatTile icon="calendar-check" label="Denne uken" value={dashboard.appointmentsThisWeek} />
        <StatTile icon="clock" label="Planlagte" value={dashboard.pendingAppointments} />
        <StatTile icon="x-circle" label="Avlyste" value={dashboard.cancelledAppointments} />
      </div>

      <div className="top-content">
        <div className="mini-column">
          {/* Calendar overview section */}
          <SectionCard title="Kalenderoversikt" icon="calendar3" className="calendar-overview">
            <div className="calendar-header-row">
              <button
                type="button"
                className="calendar-nav-btn"
                aria-label="Forrige måned"
                onClick={() => setDisplayedMonthDate(new Date(displayedYear, displayedMonth - 1, 1))}
              >
                <i className="bi bi-chevron-left"></i>
              </button>
              <h3 className="calendar-month-label">{monthLabel}</h3>
              <button
                type="button"
                className="calendar-nav-btn"
                aria-label="Neste måned"
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
                const isInCurrentWeek =
                  calendarDay.date >= currentWeekStart && calendarDay.date <= currentWeekEnd && calendarDay.isCurrentMonth;

                const isToday =
                  calendarDay.date.getDate() === today.getDate() &&
                  calendarDay.date.getMonth() === today.getMonth() &&
                  calendarDay.date.getFullYear() === today.getFullYear();

                const hasAppointment = appointmentDateSet.has(calendarDay.date.getTime());

                return (
                  <div
                    key={calendarDay.key}
                    className={`calendar-day ${calendarDay.isCurrentMonth ? '' : 'outside-month'} ${isInCurrentWeek ? 'current-week' : ''} ${isToday ? 'today' : ''} ${hasAppointment ? 'has-appointment' : ''}`}
                  >
                    <span className="day-number">{calendarDay.day}</span>
                  </div>
                );
              })}
            </div>
          </SectionCard>

          <SectionCard
            title="Dagens tidslinje"
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
                  aria-label="Filtrer tidslinje"
                >
                  {TIMELINE_FILTER_LABELS[timelineFilter]}
                  <i className="bi bi-chevron-down" aria-hidden="true"></i>
                </Dropdown.Toggle>
                <Dropdown.Menu
                  align="end"
                  className="timeline-filter-menu"
                  popperConfig={{ modifiers: [{ name: 'offset', options: { offset: [0, 6] } }] }}
                >
                  {(Object.keys(TIMELINE_FILTER_LABELS) as Array<'alle' | 'fysisk' | 'digitalt'>).map((key) => (
                    <Dropdown.Item key={key} eventKey={key} active={timelineFilter === key}>
                      {TIMELINE_FILTER_LABELS[key]}
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
                              <p className="timeline-address">{item.zone && item.address ? `${item.zone}, ${item.address}` : (item.address || item.zone || 'Adresse ikke oppgitt')}</p>
                            ) : (
                              <p className="timeline-visit-type">Digitalt besøk</p>
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
                <EmptyState icon="calendar-x" text="Ingen planlagte avtaler i dag." />
              )}

              <Link to="/availability" className="btn btn-secondary btn-sm w-100 mt-3">
                Vis mer
              </Link>
          </SectionCard>
        </div>

        <div className="availability-column">
          <div className="availability-quick-actions" role="group" aria-label="Hurtighandlinger">
            <button
              type="button"
              className="quick-action-btn"
              onClick={() => navigate('/appointments?ny=1')}
            >
              <i className="bi bi-calendar-plus"></i>
              <span>Legg til nytt besøk</span>
            </button>

            <button
              type="button"
              className="quick-action-btn"
              onClick={() => navigate('/availability')}
            >
              <i className="bi bi-arrow-repeat"></i>
              <span>Oppdater tilgjengelighet</span>
            </button>

            <button
              type="button"
              className="quick-action-btn"
              onClick={() => navigate('/planning')}
            >
              <i className="bi bi-geo-alt"></i>
              <span>Vis kart</span>
            </button>
          </div>

          <SectionCard
            title="Kommende tilgjengelighet"
            icon="calendar-week"
            className="availability-overview"
            action={
              <Link to="/availability" className="btn btn-secondary btn-sm" aria-label="Se tilgjengelighet">
                <i className="bi bi-plus-lg"></i>
              </Link>
            }
          >
              {orderedAvailabilityDateKeys.length > 0 ? (
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
                              {day.date.toLocaleDateString('nb-NO', { month: 'short' })}
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
                    <EmptyState icon="calendar-x" text="Ingen tilgjengelige tider for valgt dag." />
                  )}
                </div>
              ) : (
                <EmptyState icon="calendar-x" text="Ingen planlagt tilgjengelighet." />
              )}
          </SectionCard>

          <SectionCard title="Siste avtaler" icon="clock-history">
              {dashboard.recentAppointments.length > 0 ? (
                <div className="d-flex flex-column gap-3">
                  {dashboard.recentAppointments.map((appointment) => (
                    <AppointmentCard
                      key={appointment.id}
                      appointment={appointment}
                      dateTimeText={formatRecentDateTime(appointment)}
                      subject={appointment.patientName ? `Pasient: ${appointment.patientName}` : null}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState icon="calendar-x" text="Ingen nylige avtaler å vise." />
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
