import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { getUserInfo } from '../../auth/AuthService';
import { isHeadNurseRole } from '../../auth/roles';
import PersonnelService, { type NurseSummary } from '../../personnel/services/PersonnelService';
import {
  fetchWeekAvailability,
  fetchDayAvailability,
  createAvailabilityWindow,
  updateAvailabilityWindow,
  deleteAvailabilityWindow,
} from '../services/AvailabilityService';
import WeeklyView from '../components/WeeklyView';
import DailyView from '../components/DailyView';
import AvailabilityWindowModal from '../components/AvailabilityWindowModal';
import WeeklyScheduleModal from '../components/WeeklyScheduleModal';
import PageHeader from '../../components/common/PageHeader';
import type {
  WeekAvailability,
  DayAvailability,
  AvailabilityWindow,
  CreateAvailabilityWindowDto,
  UpdateAvailabilityWindowDto,
} from '../types/availability';
import {
  getMonday,
  getSunday,
  formatDateISO,
  formatWeekRange,
  formatDateLong,
  addWeeks,
  addDays,
} from '../../utils/dateUtils';
import './AvailabilityCalendarPage.css';

type ViewMode = 'week' | 'day';

const AvailabilityCalendarPage: React.FC = () => {
  const { t } = useTranslation();
  const userInfo = getUserInfo();
  const isHeadNurse = isHeadNurseRole(userInfo?.role);
  const [personnelId, setPersonnelId] = useState(userInfo?.userId || '');
  const [nurses, setNurses] = useState<NurseSummary[]>([]);

  // State
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [weekData, setWeekData] = useState<WeekAvailability | null>(null);
  const [dayData, setDayData] = useState<DayAvailability | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Modal state
  const [showModal, setShowModal] = useState<boolean>(false);
  const [selectedWindow, setSelectedWindow] = useState<AvailabilityWindow | undefined>();
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [showWeeklySchedule, setShowWeeklySchedule] = useState(false);
  const availabilityRequestRef = useRef(0);

  useEffect(() => {
    if (!isHeadNurse) return;
    let active = true;
    void PersonnelService.getAll()
      .then((staff) => {
        if (!active) return;
        const ordered = [...staff].sort((a, b) => a.fullName.localeCompare(b.fullName));
        setNurses(ordered);
        setPersonnelId((current) => ordered.some((nurse) => nurse.id === current)
          ? current
          : ordered[0]?.id ?? '');
      })
      .catch(() => { if (active) setError(t('Kunne ikke laste sykepleiere')); });
    return () => { active = false; };
  }, [isHeadNurse, t]);

  // Load data based on view mode
  const loadData = useCallback(async () => {
    const requestId = ++availabilityRequestRef.current;
    try {
      setLoading(true);
      setError('');

      if (viewMode === 'week') {
        const monday = getMonday(currentDate);
        const mondayISO = formatDateISO(monday);
        const data = await fetchWeekAvailability(personnelId, mondayISO);
        if (requestId === availabilityRequestRef.current) setWeekData(data);
      } else {
        const dateISO = formatDateISO(currentDate);
        const data = await fetchDayAvailability(personnelId, dateISO);
        if (requestId === availabilityRequestRef.current) setDayData(data);
      }
    } catch (err) {
      console.error('Error loading availability:', err);
      if (requestId === availabilityRequestRef.current) {
        setError(t('Kunne ikke laste tilgjengelighetsdata'));
      }
    } finally {
      if (requestId === availabilityRequestRef.current) setLoading(false);
    }
  }, [currentDate, personnelId, t, viewMode]);

  useEffect(() => {
    if (personnelId) {
      loadData();
    }
  }, [personnelId, loadData]);

  // Navigation
  const handlePrevious = () => {
    if (viewMode === 'week') {
      setCurrentDate((prev) => addWeeks(prev, -1));
    } else {
      setCurrentDate((prev) => addDays(prev, -1));
    }
  };

  const handleNext = () => {
    if (viewMode === 'week') {
      setCurrentDate((prev) => addWeeks(prev, 1));
    } else {
      setCurrentDate((prev) => addDays(prev, 1));
    }
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  // Day card click handler
  const handleDayClick = (date: string, window?: AvailabilityWindow) => {
    setSelectedDate(date);
    setSelectedWindow(window);
    setShowModal(true);
  };

  // Modal handlers
  const handleCreateOrUpdate = async (data: CreateAvailabilityWindowDto | UpdateAvailabilityWindowDto) => {
    if (selectedWindow?.id) {
      // Update
      await updateAvailabilityWindow(selectedWindow.id, data as UpdateAvailabilityWindowDto, personnelId);
    } else {
      // Create
      await createAvailabilityWindow(data as CreateAvailabilityWindowDto, personnelId);
    }
    await loadData();
  };

  const handleDelete = async () => {
    if (selectedWindow?.id) {
      await deleteAvailabilityWindow(selectedWindow.id, personnelId);
      await loadData();
    }
  };

  const handleEditFromDailyView = (window: AvailabilityWindow) => {
    setSelectedWindow(window);
    setSelectedDate(window.date);
    setShowModal(true);
  };

  const handleDeleteFromDailyView = async (windowId: number) => {
    if (!window.confirm(t('Er du sikker på at du vil slette dette tilgjengelighetsvinduet?'))) {
      return;
    }

    try {
      await deleteAvailabilityWindow(windowId, personnelId);
      await loadData();
    } catch (err) {
      setError(t(err instanceof Error ? err.message : 'Kunne ikke slette tilgjengelighetsvinduet'));
    }
  };

  const handleCreateFromDailyView = () => {
    setSelectedDate(formatDateISO(currentDate));
    setSelectedWindow(undefined);
    setShowModal(true);
  };

  // Date header text
  const getHeaderText = (): string => {
    if (viewMode === 'week') {
      const monday = getMonday(currentDate);
      const sunday = getSunday(currentDate);
      return formatWeekRange(monday, sunday);
    } else {
      return formatDateLong(currentDate);
    }
  };

  const selectedNurse = nurses.find((nurse) => nurse.id === personnelId);

  // renders loading state while fetching availability data
  if (loading && !weekData && !dayData) {
    return (
      <div className="availability-calendar-page">
        <p>{t('Laster tilgjengelighet...')}</p>
      </div>
    );
  }

  return (
    <div className="availability-calendar-page">
      {/* displays error message if data fetch fails */}
      {error && (
        <div className="vk-error-alert">
          <span>{error}</span>
          <button className="vk-error-alert__close" onClick={() => setError('')}>
            <i className="bi bi-x"></i>
          </button>
        </div>
      )}

      <PageHeader
        title={t('Kalender')}
        subtitle={isHeadNurse && selectedNurse
          ? t('Administrer kalenderen til {{name}}.', { name: selectedNurse.fullName })
          : t('Administrer din ukentlige og daglige tilgjengelighetsplan.')}
        actions={(
          <>
            {isHeadNurse && (
              <select
                className="form-select calendar-nurse-select"
                aria-label={t('Velg sykepleier')}
                value={personnelId}
                onChange={(event) => {
                  availabilityRequestRef.current += 1;
                  setPersonnelId(event.target.value);
                  setWeekData(null);
                  setDayData(null);
                  setSelectedWindow(undefined);
                  setShowModal(false);
                  setShowWeeklySchedule(false);
                  setLoading(true);
                }}
              >
                {nurses.map((nurse) => <option key={nurse.id} value={nurse.id}>{nurse.fullName}</option>)}
              </select>
            )}
            <button className="btn btn-outline-primary" type="button" onClick={() => setShowWeeklySchedule(true)}>
              <i className="bi bi-calendar-week me-2" aria-hidden="true"></i>{t('Standarduke')}
            </button>
          </>
        )}
      />

      {/* provides view mode toggle and navigation controls */}
      <div className="calendar-controls">
        <div className="controls-left">
          {/* allows switching between day and week views */}
          <div className="btn-group" role="group" aria-label={t('Visningsmodus')}>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'day' ? 'btn-secondary' : 'btn-outline-secondary'}`}
              onClick={() => {
                setViewMode('day');
                setCurrentDate(new Date());
              }}
            >
              {t('Dag')}
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'week' ? 'btn-secondary' : 'btn-outline-secondary'}`}
              onClick={() => {
                setViewMode('week');
                setCurrentDate(new Date());
              }}
            >
              {t('Uke')}
            </button>
          </div>

          {/* navigates to current date */}
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleToday}>
            {t('I dag')}
          </button>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={loadData} disabled={loading}>
            {t('Oppdater')}
          </button>
        </div>

        {/* displays current date range and navigation arrows */}
        <div className="controls-right">
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handlePrevious} aria-label={t('Forrige')}>
            <i className="bi bi-chevron-left"></i>
          </button>
          <h2 className="date-header">{getHeaderText()}</h2>
          <button type="button" className="btn btn-outline-secondary btn-sm" onClick={handleNext} aria-label={t('Neste')}>
            <i className="bi bi-chevron-right"></i>
          </button>
        </div>
      </div>

      {/* renders weekly calendar view with day cards */}
      {viewMode === 'week' && weekData && (
        <WeeklyView weekData={weekData} onDayClick={handleDayClick} />
      )}

      {/* renders daily schedule view with time slots */}
      {viewMode === 'day' && dayData && (
        <DailyView
          dayData={dayData}
          onEdit={handleEditFromDailyView}
          onDelete={handleDeleteFromDailyView}
          onCreate={handleCreateFromDailyView}
        />
      )}

      {/* shows modal for creating or editing availability windows */}
      <AvailabilityWindowModal
        show={showModal}
        onClose={() => {
          setShowModal(false);
          setSelectedWindow(undefined);
        }}
        initialData={selectedWindow}
        selectedDate={selectedDate}
        onSubmit={handleCreateOrUpdate}
        onDelete={selectedWindow ? handleDelete : undefined}
      />
      <WeeklyScheduleModal
        show={showWeeklySchedule}
        onClose={() => setShowWeeklySchedule(false)}
        onSaved={loadData}
        personnelId={personnelId}
        personnelName={selectedNurse?.fullName}
      />
    </div>
  );
};

export default AvailabilityCalendarPage;
