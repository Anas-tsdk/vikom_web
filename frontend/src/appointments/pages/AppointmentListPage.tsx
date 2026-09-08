import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
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
import './AppointmentListPage.css';

type PersonnelTab = 'all' | 'scheduled' | 'inprogress' | 'completed';

const formatDateNorwegian = (dateString?: string) => {
  if (!dateString) return '';
  const date = new Date(dateString);
  return date.toLocaleDateString('nb-NO', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

// Builds the "<date> • <start> - <end>" line shown on each appointment card.
const formatDateTime = (appointment: Appointment) => {
  const datePart = formatDateNorwegian(appointment.date);
  const timePart = appointment.startTime ? ` • ${appointment.startTime} - ${appointment.endTime}` : '';
  return `${datePart}${timePart}`;
};

const AppointmentListPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabParam = searchParams.get('tab');
  const userInfo = AuthService.getUserInfo();

  // State management
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Modal state management
  const [showModal, setShowModal] = useState<boolean>(false);
  const [showDeleteModal, setShowDeleteModal] = useState<boolean>(false);
  const [selectedAppointment, setSelectedAppointment] = useState<Appointment | undefined>();
  const [appointmentToDelete, setAppointmentToDelete] = useState<{ id: number; description: string } | null>(null);
  const [detailsVisitId, setDetailsVisitId] = useState<number | null>(null);
  const [plannedAppointment, setPlannedAppointment] = useState<Appointment | null>(null);

  // Front-end-only declutter: hides finished appointments from the active list
  // for the current view. Resets on reload — the permanent record lives in the
  // visit archive (/appointments/archive).
  const [completedHidden, setCompletedHidden] = useState<boolean>(false);

  // Active tab state
  const [activeTab, setActiveTab] = useState<PersonnelTab>(
    () => (tabParam as PersonnelTab) || 'all',
  );

  // loads the logged-in nurse's appointments
  const loadAppointments = async () => {
    try {
      setLoading(true);
      setError('');

      const data = userInfo?.userId
        ? await AppointmentService.getByPersonnelId(userInfo.userId)
        : await AppointmentService.getAll();

      setAppointments(data);
    } catch {
      setError('Kunne ikke laste avtaler');
    } finally {
      setLoading(false);
    }
  };

  // loads appointments on component mount
  useEffect(() => {
    loadAppointments();
  }, []);

  // The dashboard's "Legg til nytt besøk" lands here with ?ny=1 to open the
  // create form straight away. The param is cleared so a refresh or back
  // navigation doesn't reopen the modal.
  useEffect(() => {
    if (searchParams.get('ny')) {
      setSelectedAppointment(undefined);
      setShowModal(true);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Personnel row actions. Each row gets one document icon: a read-only
  // "Planlagt besøk" (pre-visit plan) before/while it's planned, or the
  // post-visit "Besøksdetaljer" once the visit has ended. While a visit is
  // Active the nurse documents inside the workspace, so no document icon shows.
  const renderPersonnelActions = (appointment: Appointment) => {
    if (!appointment.id) return null;
    const id = appointment.id;

    const visitDone =
      !!appointment.visitId &&
      (appointment.visitStatus === 'Completed' ||
        appointment.visitStatus === 'Incomplete' ||
        appointment.visitStatus === 'Cancelled');

    // Active visit: the nurse documents inside the workspace — no document icon.
    if (appointment.visitStatus === 'Active') {
      return (
        <button className="btn btn-warning btn-sm" onClick={() => navigate(`/besok/${id}`)}>
          <i className="bi bi-arrow-right-circle me-1" aria-hidden="true"></i>Fortsett besøk
        </button>
      );
    }

    // Planned appointment: start actions + the read-only pre-visit plan.
    if (appointment.status === 'Booked' || appointment.status === 'InProgress') {
      return (
        <>
          <button className="btn btn-primary btn-sm" onClick={() => navigate(`/besok/${id}`)}>
            <i className="bi bi-play-circle me-1" aria-hidden="true"></i>Start besøk
          </button>
          {appointment.patientSupabaseProfileId && (
            <button
              className="btn btn-outline-primary btn-sm"
              onClick={() => navigate(`/besok/${id}?type=Digital`)}
            >
              <i className="bi bi-camera-video me-1" aria-hidden="true"></i>Start digitalt besøk
            </button>
          )}
          <IconButton
            icon="clipboard-check"
            title="Planlagt besøk"
            onClick={() => setPlannedAppointment(appointment)}
          />
          {/* Booking upkeep on the patient's behalf. The backend rejects changes
              within 24 hours of the start time, so the buttons disable to match. */}
          {appointment.status === 'Booked' && (
            <>
              <IconButton
                icon="pencil"
                title={
                  canModify(appointment)
                    ? 'Endre avtale'
                    : 'Kan ikke endres innen 24 timer før avtalen'
                }
                disabled={!canModify(appointment)}
                onClick={() => handleEdit(appointment)}
              />
              <IconButton
                icon="trash"
                title={
                  canModify(appointment)
                    ? 'Avbryt avtale'
                    : 'Kan ikke avbestilles innen 24 timer før avtalen'
                }
                disabled={!canModify(appointment)}
                onClick={() => handleDelete(appointment)}
              />
            </>
          )}
        </>
      );
    }

    // Finished appointment: only the post-visit record, and only if one exists.
    return visitDone ? (
      <IconButton
        icon="journal-text"
        title="Besøksdetaljer"
        onClick={() => setDetailsVisitId(appointment.visitId ?? null)}
      />
    ) : null;
  };

  // filters for personnel view
  const scheduledAppointments = appointments.filter((a) => a.status === 'Booked');
  const inProgressAppointments = appointments.filter((a) => a.status === 'InProgress');
  const completedAppointments = appointments.filter(
    (a) => a.status === 'Completed' || a.status === 'NotCompleted',
  );
  const allActiveAppointments = [...scheduledAppointments, ...inProgressAppointments].sort((a, b) => {
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

  // opens modal to create new appointment
  const handleCreate = () => {
    setSelectedAppointment(undefined);
    setShowModal(true);
  };

  // opens modal to edit existing appointment
  const handleEdit = (appointment: Appointment) => {
    setSelectedAppointment(appointment);
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
        setError('Kunne ikke slette avtalen');
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
        <p>Laster avtaler...</p>
      </div>
    );
  }

  // Render UI for personnel (nurse) view
  const personnelTabs = [
    { key: 'all', label: 'Alle', count: allActiveAppointments.length },
    { key: 'scheduled', label: 'Planlagt', count: scheduledAppointments.length },
    { key: 'inprogress', label: 'Pågår', count: inProgressAppointments.length },
    { key: 'completed', label: 'Fullført', count: completedHidden ? 0 : completedAppointments.length },
  ];

  const showList = (tab: PersonnelTab) => {
    // Completed appointments are tidied away on demand; the permanent record
    // stays available in the visit archive.
    if (tab === 'completed' && completedHidden) {
      return (
        <EmptyState
          icon="archive"
          text="Fullførte avtaler er ryddet bort. Se besøksarkivet for historikk."
          action={
            <button className="btn btn-outline-primary" onClick={() => navigate('/appointments/archive')}>
              <i className="bi bi-journals me-2" aria-hidden="true"></i>Åpne besøksarkiv
            </button>
          }
        />
      );
    }

    const list =
      tab === 'all'
        ? allActiveAppointments
        : tab === 'scheduled'
        ? scheduledAppointments
        : tab === 'inprogress'
        ? inProgressAppointments
        : completedAppointments;

    if (list.length === 0) {
      return (
        <EmptyState
          icon="calendar-x"
          text="Det finnes ingen avtaler som matcher dette filteret."
        />
      );
    }

    return (
      <div className="d-flex flex-column gap-3">
        {list.map((appointment) => (
          <AppointmentCard
            key={appointment.id}
            appointment={appointment}
            dateTimeText={formatDateTime(appointment)}
            subject={appointment.patientName ? `Pasient: ${appointment.patientName}` : null}
            footerNote={
              appointment.status === 'Booked' && isWithin24Hours(appointment) ? (
                <span className="d-inline-flex align-items-center gap-2 text-danger small">
                  <i className="bi bi-exclamation-triangle" aria-hidden="true"></i>
                  Endring og avbestilling må skje minst 24 timer før
                </span>
              ) : undefined
            }
            actions={renderPersonnelActions(appointment)}
            onClick={
              appointment.id &&
              (appointment.status === 'InProgress' || appointment.visitStatus === 'Active')
                ? () => navigate(`/besok/${appointment.id}`)
                : undefined
            }
          />
        ))}
      </div>
    );
  };

  return (
    <div className="appointment-list-page personnel-page">
      {errorBanner}

      <PageHeader
        title="Mine pasientavtaler"
        subtitle="Start og fullfør oppgaver for pasientene dine direkte her."
        actions={
          <div className="d-flex align-items-center gap-2">
            <button className="btn btn-primary" type="button" onClick={handleCreate}>
              <i className="bi bi-calendar-plus me-2" aria-hidden="true"></i>Ny avtale
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              disabled={completedHidden || completedAppointments.length === 0}
              onClick={() => {
                setActiveTab('completed');
                setCompletedHidden(true);
              }}
            >
              Rydd opp fullførte
            </button>
            <IconButton
              icon="journals"
              title="Besøksarkiv"
              onClick={() => navigate('/appointments/archive')}
            />
          </div>
        }
      />

      <Tabs
        tabs={personnelTabs}
        activeKey={activeTab}
        onChange={(key) => setActiveTab(key as PersonnelTab)}
        card
      >
        {showList(activeTab as PersonnelTab)}
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
        onSubmit={handleSubmit}
      />

      <AppointmentDeleteModal
        show={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleConfirmDelete}
        appointmentDescription={appointmentToDelete?.description}
      />
    </div>
  );
};

export default AppointmentListPage;
