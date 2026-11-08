import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from 'react-bootstrap';
import * as AuthService from '../../auth/AuthService';
import AppointmentService from '../services/AppointmentService';
import AppointmentModal from '../components/AppointmentModal';
import AppointmentDeleteModal from '../components/AppointmentDeleteModal';
import AppointmentCard from '../components/AppointmentCard';
import PageHeader from '../../components/common/PageHeader';
import Tabs from '../../components/common/Tabs';
import EmptyState from '../../components/common/EmptyState';
import IconButton from '../../components/common/IconButton';
import VisitDetailsModal from '../../visits/components/VisitDetailsModal';
import PlannedVisitModal from '../../visits/components/PlannedVisitModal';
import type { Appointment } from '../types/appointment';
import { localeForLanguage } from '../../i18n';
import { formatDateISO } from '../../utils/dateUtils';
import { isHeadNurseRole } from '../../auth/roles';
import PersonnelService, { type NurseSummary } from '../../personnel/services/PersonnelService';
import { signalingService, isSupabaseConfigured } from '../../services/SupabaseSignalingService';
import './AppointmentListPage.css';

type PersonnelTab = 'all' | 'scheduled' | 'inprogress' | 'completed';

const formatDate = (dateString: string | undefined, locale: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

// Builds the "<date> • <start> - <end>" line shown on each appointment card.
const formatDateTime = (appointment: Appointment, locale: string) => {
  const datePart = formatDate(appointment.date, locale);
  const timePart = appointment.startTime ? ` • ${appointment.startTime} - ${appointment.endTime}` : '';
  return `${datePart}${timePart}`;
};

const AppointmentListPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.resolvedLanguage);
  const tabParam = searchParams.get('tab');
  const userInfo = AuthService.getUserInfo();
  const userId = userInfo?.userId;
  const isHeadNurse = isHeadNurseRole(userInfo?.role);

  // State management
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [nurses, setNurses] = useState<NurseSummary[]>([]);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState(userId ?? '');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const appointmentRequestRef = useRef(0);

  // Modal state management
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | undefined>();
  const [appointmentToDelete, setAppointmentToDelete] = useState<{ id: number; description: string } | null>(null);
  const [detailsVisitId, setDetailsVisitId] = useState<number | null>(null);
  const [plannedAppointment, setPlannedAppointment] = useState<Appointment | null>(null);
  const [acceptingProposalId, setAcceptingProposalId] = useState<number | null>(null);
  const [proposalError, setProposalError] = useState<string>('');
  const [patientFilter, setPatientFilter] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>(() => formatDateISO(new Date()));

  // Active tab state
  const [activeTab, setActiveTab] = useState<PersonnelTab>(
    () => (
      tabParam === 'all' || tabParam === 'inprogress' || tabParam === 'completed'
        ? tabParam
        : 'scheduled'
    ),
  );

  // loads the logged-in nurse's appointments
  const loadAppointments = useCallback(async (silent = false) => {
    const requestId = ++appointmentRequestRef.current;
    try {
      if (!silent) {
        setLoading(true);
        setError('');
      }

      const data = selectedPersonnelId
        ? await AppointmentService.getByPersonnelId(selectedPersonnelId)
        : await AppointmentService.getAll();

      if (requestId === appointmentRequestRef.current) setAppointments(data);
    } catch {
      if (requestId === appointmentRequestRef.current) {
        setAppointments([]);
        setError(t('Kunne ikke laste avtaler'));
      }
    } finally {
      if (!silent && requestId === appointmentRequestRef.current) setLoading(false);
    }
  }, [selectedPersonnelId, t]);

  useEffect(() => {
    if (!isHeadNurse) {
      if (userId) setSelectedPersonnelId(userId);
      return;
    }
    let active = true;
    void PersonnelService.getAll()
      .then((staff) => {
        if (!active) return;
        const ordered = [...staff].sort((a, b) => a.fullName.localeCompare(b.fullName, locale));
        setNurses(ordered);
        setSelectedPersonnelId((current) => ordered.some((nurse) => nurse.id === current)
          ? current
          : ordered.find((nurse) => nurse.id === userId)?.id ?? ordered[0]?.id ?? '');
      })
      .catch(() => { if (active) setError(t('Kunne ikke laste sykepleiere')); });
    return () => { active = false; };
  }, [isHeadNurse, locale, t, userId]);

  // loads appointments on component mount
  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  // Patient responses are broadcast to the assigned nurse and every head nurse.
  // A small polling fallback also covers temporary realtime disconnections.
  useEffect(() => {
    if (!userId) return;
    const refresh = () => { void loadAppointments(true); };
    const onVisibility = () => { if (!document.hidden) refresh(); };
    signalingService.on('appointment_staff_event', refresh);
    if (isSupabaseConfigured) {
      void signalingService.initialize(userId).catch(() => {
        // The interval below remains active if realtime is unavailable.
      });
    }
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(refresh, 5_000);
    return () => {
      signalingService.off('appointment_staff_event', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
  }, [loadAppointments, userId]);

  const handleAcceptProposal = async (appointment: Appointment) => {
    if (!appointment.id) return;

    setAcceptingProposalId(appointment.id);
    try {
      const accepted = await AppointmentService.acceptProposal(appointment.id);
      setAppointments((current) =>
        current.map((item) => item.id === accepted.id ? accepted : item),
      );
    } catch (acceptError) {
      setProposalError(acceptError instanceof Error
        ? t(acceptError.message)
        : t('Could not accept the proposed time'));
    } finally {
      setAcceptingProposalId(null);
    }
  };

  const openAppointmentInfo = (appointment: Appointment) => {
    if (appointment.visitId) {
      setDetailsVisitId(appointment.visitId);
      return;
    }
    setPlannedAppointment(appointment);
  };

  const renderInfoAction = (appointment: Appointment) => (
    <button
      className="btn btn-outline-secondary btn-sm"
      type="button"
      onClick={() => openAppointmentInfo(appointment)}
    >
      <i className="bi bi-info-circle me-1" aria-hidden="true"></i>
      {t('Info')}
    </button>
  );

  // Personnel row actions expose the same details view as clicking the card.
  const renderPersonnelActions = (appointment: Appointment) => {
    if (!appointment.id) return null;
    const id = appointment.id;
    const canExecuteVisit = selectedPersonnelId === userId;
    const hasPatientProposal = appointment.patientResponseStatus === 'Declined' &&
      !!appointment.patientProposedDate &&
      !!appointment.patientProposedStartTime &&
      !!appointment.patientProposedEndTime;

    if (hasPatientProposal) {
      return isHeadNurse ? (
        <>
          {renderInfoAction(appointment)}
          <button
            className="btn btn-success btn-sm"
            disabled={acceptingProposalId === id}
            onClick={() => void handleAcceptProposal(appointment)}
          >
            {acceptingProposalId === id
              ? <span className="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>
              : <i className="bi bi-calendar2-check me-1" aria-hidden="true"></i>}
            {t('Godta foreslått tidspunkt')}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => handleReplan(appointment)}>
            <i className="bi bi-calendar2-plus me-1" aria-hidden="true"></i>
            {t('Planlegg et nytt tidspunkt')}
          </button>
        </>
      ) : renderInfoAction(appointment);
    }

    // Active visits are documented in the workspace; details remain available here.
    if (appointment.visitStatus === 'Active' && canExecuteVisit) {
      return (
        <>
          {renderInfoAction(appointment)}
          <button className="btn btn-warning btn-sm" onClick={() => navigate(`/besok/${id}`)}>
            <i className="bi bi-arrow-right-circle me-1" aria-hidden="true"></i>{t('Fortsett besøk')}
          </button>
        </>
      );
    }

    // Planned appointment: start actions + the read-only pre-visit plan.
    if (appointment.status === 'Booked' || appointment.status === 'InProgress') {
      return (
        <>
          {canExecuteVisit && (
            <button className="btn btn-primary btn-sm" onClick={() => navigate(`/besok/${id}`)}>
              <i className="bi bi-play-circle me-1" aria-hidden="true"></i>{t('Start besøk')}
            </button>
          )}
          {canExecuteVisit && appointment.patientSupabaseProfileId && (
              <button
                className="btn btn-outline-primary btn-sm"
                onClick={() => navigate(`/besok/${id}?type=Digital`)}
              >
                <i className="bi bi-camera-video me-1" aria-hidden="true"></i>{t('Start digitalt besøk')}
              </button>
            )}
          {renderInfoAction(appointment)}
          {/* Booking upkeep on the patient's behalf. The backend rejects changes
              within 24 hours of the start time, so the buttons disable to match. */}
          {isHeadNurse && appointment.status === 'Booked' && (
            <>
              <IconButton
                icon="pencil"
                title={
                  canModify(appointment)
                    ? t('Endre avtale')
                    : t('Kan ikke endres innen 24 timer før avtalen')
                }
                disabled={!canModify(appointment)}
                onClick={() => handleEdit(appointment)}
              />
              <IconButton
                icon="trash"
                title={
                  canModify(appointment)
                    ? t('Avbryt avtale')
                    : t('Kan ikke avbestilles innen 24 timer før avtalen')
                }
                disabled={!canModify(appointment)}
                onClick={() => handleDelete(appointment)}
              />
            </>
          )}
        </>
      );
    }

    return renderInfoAction(appointment);
  };

  const patientOptions = useMemo(() => Array.from(
    new Map(appointments
      .filter((appointment) => appointment.patientId)
      .map((appointment) => [appointment.patientId, appointment.patientName || t('Ukjent pasient')]))
  ).sort((a, b) => a[1].localeCompare(b[1], locale)), [appointments, locale, t]);

  // Patient and date filters are deliberately applied before the tab filter,
  // so they work identically in All, Planned, In progress and Completed.
  const filteredAppointments = appointments.filter((appointment) => {
    const matchesPatient = !patientFilter || appointment.patientId === patientFilter;
    const matchesDate = !dateFilter || appointment.date === dateFilter;
    return matchesPatient && matchesDate;
  });
  const scheduledAppointments = filteredAppointments.filter((a) => a.status === 'Booked');
  const inProgressAppointments = filteredAppointments.filter((a) => a.status === 'InProgress');
  const completedAppointments = filteredAppointments.filter(
    (a) => a.status === 'Completed' || a.status === 'NotCompleted',
  );
  const allAppointments = [...filteredAppointments].sort((a, b) => {
    const dateA = new Date(a.date || '');
    const dateB = new Date(b.date || '');
    if (dateA.getTime() !== dateB.getTime()) return dateA.getTime() - dateB.getTime();
    return a.startTime.localeCompare(b.startTime);
  });

  // checks if appointment is within 24 hours (the backend rejects changes inside that window)
  const isWithin24Hours = (appointment: Appointment): boolean => {
    if (!appointment.date || !appointment.startTime) return false;

    const appointmentDateTime = new Date(`${appointment.date}T${appointment.startTime}`);
    const now = new Date();
    const hoursUntil = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);

    return hoursUntil < 24;
  };

  // checks if an appointment can still be changed or cancelled
  const canModify = (appointment: Appointment): boolean => {
    return !isWithin24Hours(appointment) && appointment.status === 'Booked';
  };

  // opens modal to edit existing appointment
  const handleEdit = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
    setShowModal(true);
  };

  const handleReplan = (appointment: Appointment) => {
    setSelectedAppointment({
      ...appointment,
      availabilityId: 0,
      declinedSlotDate: appointment.date,
      declinedSlotStartTime: appointment.startTime,
      declinedSlotEndTime: appointment.endTime,
      date: appointment.patientProposedDate ?? '',
      startTime: appointment.patientProposedStartTime ?? '',
      endTime: appointment.patientProposedEndTime ?? '',
      status: 'Booked',
    });
    setShowModal(true);
  };

  // opens delete confirmation modal
  const handleDelete = (appointment: Appointment) => {
    if (appointment.id) {
      setAppointmentToDelete({
        id: appointment.id,
        description: appointment.tasks,
      });
      setShowDeleteModal(true);
    }
  };

  // submits appointment data (create or update)
  const handleSubmit = async (data: Appointment) => {
    if (data.id) {
      await AppointmentService.update(data.id, data);
    } else {
      await AppointmentService.create({
        patientId: data.patientId,
        availabilityId: data.availabilityId,
        tasks: data.tasks,
        additionalDurationMinutes: data.additionalDurationMinutes ?? 0,
        startTime: data.startTime,
        endTime: data.endTime,
        status: data.status,
      });
    }
    await loadAppointments();
  };

  // confirms and executes appointment deletion
  const handleConfirmDelete = async () => {
    if (appointmentToDelete) {
      try {
        await AppointmentService.delete(appointmentToDelete.id);
        await loadAppointments();
      } catch {
        setError(t('Kunne ikke slette avtalen'));
      }
    }
  };

  // shared dismissible error banner
  const errorBanner = error && (
    <div className="vk-error-alert">
      <span>{error}</span>
      <button className="vk-error-alert__close" onClick={() => setError('')}>
        <i className="bi bi-x"></i>
      </button>
    </div>
  );

  // renders loading state
  if (loading) {
    return (
      <div className="appointment-list-page">
        <p>{t('Laster avtaler...')}</p>
      </div>
    );
  }

  // Render UI for personnel (nurse) view
  const personnelTabs = [
    { key: 'scheduled', label: t('Upcoming'), count: scheduledAppointments.length },
    { key: 'inprogress', label: t('Pågår'), count: inProgressAppointments.length },
    { key: 'completed', label: t('Fullført'), count: completedAppointments.length },
    { key: 'all', label: t('Alle'), count: allAppointments.length },
  ];

  const showList = (tab: PersonnelTab) => {
    const list =
      tab === 'all'
        ? allAppointments
        : tab === 'scheduled'
        ? scheduledAppointments
        : tab === 'inprogress'
        ? inProgressAppointments
        : completedAppointments;

    if (list.length === 0) {
      return (
        <EmptyState
          icon="calendar-x"
          text={t('Det finnes ingen avtaler som matcher dette filteret.')}
        />
      );
    }

    return (
      <div className="d-flex flex-column gap-3">
        {list.map((appointment) => (
          <AppointmentCard
            key={appointment.id}
            appointment={appointment}
            dateTimeText={formatDateTime(appointment, locale)}
            subject={appointment.patientName ? t('Pasient: {{name}}', { name: appointment.patientName }) : null}
            footerNote={
              <>
                <span className="text-muted small d-block">
                  {appointment.personnelName
                    ? t('Sykepleier: {{name}}', { name: appointment.personnelName })
                    : t('Sykepleier ikke oppgitt')}
                </span>
                {appointment.status === 'Booked' && isWithin24Hours(appointment) ? (
                  <span className="d-inline-flex align-items-center gap-2 text-danger small">
                    <i className="bi bi-exclamation-triangle" aria-hidden="true"></i>
                    {t('Endring og avbestilling må skje minst 24 timer før')}
                  </span>
                ) : null}
              </>
            }
            actions={renderPersonnelActions(appointment)}
            onClick={() => openAppointmentInfo(appointment)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className="appointment-list-page personnel-page">
      {errorBanner}

      <PageHeader
        title={isHeadNurse ? t('Avtaler') : t('Mine pasientavtaler')}
        subtitle={isHeadNurse
          ? t('Planlegg avtaler og følg arbeidslisten til hver sykepleier.')
          : t('Start og fullfør oppgaver for pasientene dine direkte her.')}
        actions={
          <div className="d-flex flex-wrap align-items-center justify-content-end gap-2">
            <button
              className="btn btn-outline-secondary"
              type="button"
              onClick={() => navigate('/appointments/archive')}
            >
              <i className="bi bi-journals me-2" aria-hidden="true"></i>
              {t('Arkiv')}
            </button>
          </div>
        }
      />

      <div className="appointment-filters" role="search" aria-label={t('Filtrer avtaler')}>
        {isHeadNurse && (
          <div>
            <label className="form-label" htmlFor="appointment-nurse-filter">{t('Sykepleier')}</label>
            <select
              id="appointment-nurse-filter"
              className="form-select"
              value={selectedPersonnelId}
              onChange={(event) => {
                appointmentRequestRef.current += 1;
                setAppointments([]);
                setLoading(true);
                setSelectedPersonnelId(event.target.value);
                setPatientFilter('');
                setDateFilter(formatDateISO(new Date()));
              }}
            >
              {nurses.map((nurse) => <option key={nurse.id} value={nurse.id}>{nurse.fullName}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="form-label" htmlFor="appointment-patient-filter">{t('Pasient')}</label>
          <select
            id="appointment-patient-filter"
            className="form-select"
            value={patientFilter}
            onChange={(event) => setPatientFilter(event.target.value)}
          >
            <option value="">{t('Alle pasienter')}</option>
            {patientOptions.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label" htmlFor="appointment-date-filter">{t('Dato')}</label>
          <input
            id="appointment-date-filter"
            type="date"
            className="form-control"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          />
        </div>
        <button
          type="button"
          className="btn btn-outline-secondary"
          disabled={!patientFilter && dateFilter === formatDateISO(new Date())}
          onClick={() => { setPatientFilter(''); setDateFilter(formatDateISO(new Date())); }}
        >
          {t('Nullstill filtre')}
        </button>
      </div>

      <Tabs
        tabs={personnelTabs}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as PersonnelTab)}
        card
      >
        {showList(activeTab)}
      </Tabs>

      <VisitDetailsModal
        show={detailsVisitId !== null}
        onClose={() => setDetailsVisitId(null)}
        visitId={detailsVisitId}
      />

      <PlannedVisitModal
        show={plannedAppointment !== null}
        onClose={() => setPlannedAppointment(null)}
        appointment={plannedAppointment}
      />

      {/* booking modals - personnel create and amend appointments for patients */}
      <AppointmentModal
        show={showModal}
        onClose={() => setShowModal(false)}
        initialData={selectedAppointment}
        defaultPersonnelId={selectedPersonnelId}
        onSubmit={handleSubmit}
      />

      <AppointmentDeleteModal
        show={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        appointmentDescription={appointmentToDelete?.description}
      />

      <Modal show={!!proposalError} onHide={() => setProposalError('')} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('Kunne ikke godta det foreslåtte tidspunktet')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>{proposalError}</Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setProposalError('')}>
            {t('Lukk')}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default AppointmentListPage;
