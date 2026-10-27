import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Modal } from 'react-bootstrap';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import AppointmentCard from '../components/AppointmentCard';
import AppointmentModal from '../components/AppointmentModal';
import AppointmentService from '../services/AppointmentService';
import type { Appointment } from '../types/appointment';
import PlannedVisitModal from '../../visits/components/PlannedVisitModal';
import { getUserInfo } from '../../auth/AuthService';
import { isHeadNurseRole } from '../../auth/roles';
import { localeForLanguage, translateApiMessage } from '../../i18n';
import { isSupabaseConfigured, signalingService } from '../../services/SupabaseSignalingService';
import './AppointmentListPage.css';

const CancelledAppointmentsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const user = getUserInfo();
  const authorized = isHeadNurseRole(user?.role);
  const locale = localeForLanguage(i18n.resolvedLanguage);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState<Appointment>();
  const [infoAppointment, setInfoAppointment] = useState<Appointment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [proposalError, setProposalError] = useState('');
  const [proposalFailedAppointment, setProposalFailedAppointment] = useState<Appointment | null>(null);
  const [acceptingProposalId, setAcceptingProposalId] = useState<number | null>(null);
  const appointmentRequestRef = useRef(0);
  const rescheduledAppointmentIds = useRef(new Set<number>());

  const loadAppointments = useCallback(async (silent = false) => {
    const requestId = ++appointmentRequestRef.current;
    if (!authorized) {
      setLoading(false);
      return;
    }
    try {
      if (!silent) setLoading(true);
      const all = await AppointmentService.getAll();
      if (requestId === appointmentRequestRef.current) {
        const declined = all.filter((appointment) =>
          appointment.status === 'Cancelled' &&
          appointment.patientResponseStatus === 'Declined');
        const declinedIds = new Set(declined.flatMap((appointment) =>
          appointment.id ? [appointment.id] : []));
        for (const id of rescheduledAppointmentIds.current) {
          if (!declinedIds.has(id)) rescheduledAppointmentIds.current.delete(id);
        }
        setAppointments(declined.filter((appointment) =>
          !appointment.id || !rescheduledAppointmentIds.current.has(appointment.id)));
        setError('');
      }
    } catch {
      if (requestId === appointmentRequestRef.current) {
        setError(t('Kunne ikke laste pasientavslåtte avtaler'));
      }
    } finally {
      if (!silent && requestId === appointmentRequestRef.current) setLoading(false);
    }
  }, [authorized, t]);

  useEffect(() => {
    void loadAppointments();
  }, [loadAppointments]);

  useEffect(() => {
    if (!authorized || !user?.userId) return;
    const refresh = () => { void loadAppointments(true); };
    const onVisibility = () => { if (!document.hidden) refresh(); };
    signalingService.on('appointment_staff_event', refresh);
    if (isSupabaseConfigured) void signalingService.initialize(user.userId).catch(() => undefined);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisibility);
    const interval = window.setInterval(refresh, 5_000);
    return () => {
      signalingService.off('appointment_staff_event', refresh);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(interval);
    };
  }, [authorized, loadAppointments, user?.userId]);

  const sortedAppointments = useMemo(() => [...appointments].sort((a, b) =>
    (b.patientRespondedAt ?? '').localeCompare(a.patientRespondedAt ?? '')),
  [appointments]);

  const openReschedule = (appointment: Appointment) => {
    setSelected({
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
  };

  const submitReschedule = async (appointment: Appointment) => {
    if (!appointment.id) return;
    await AppointmentService.update(appointment.id, appointment);
    rescheduledAppointmentIds.current.add(appointment.id);
    appointmentRequestRef.current += 1;
    setAppointments((current) => current.filter((item) => item.id !== appointment.id));
  };

  const acceptProposal = async (appointment: Appointment) => {
    if (!appointment.id) return;

    setAcceptingProposalId(appointment.id);
    setError('');
    appointmentRequestRef.current += 1;
    try {
      await AppointmentService.acceptProposal(appointment.id);
      appointmentRequestRef.current += 1;
      setAppointments((current) =>
        current.filter((item) => item.id !== appointment.id),
      );
    } catch (acceptError) {
      setProposalFailedAppointment(appointment);
      setProposalError(translateApiMessage(
        t,
        acceptError instanceof Error ? acceptError.message : 'Could not accept the proposed time',
      ));
    } finally {
      setAcceptingProposalId(null);
    }
  };

  const closeProposalError = () => {
    setProposalError('');
    setProposalFailedAppointment(null);
  };

  if (!authorized) {
    return (
      <div className="appointment-list-page">
        <PageHeader title={t('Patient declined')} />
        <div className="alert alert-danger" role="alert">
          {t('Kun ledende sykepleiere kan planlegge pasientavslåtte avtaler på nytt.')}
        </div>
      </div>
    );
  }

  return (
    <div className="appointment-list-page personnel-page">
      <PageHeader
        title={t('Patient declined')}
        subtitle={t('Viser avtaler pasienten har avslått og eventuelle foreslåtte tidspunkter.')}
        actions={(
          <Link className="btn btn-outline-primary" to="/appointments">
            <i className="bi bi-arrow-left me-2" aria-hidden="true"></i>{t('Tilbake til avtaler')}
          </Link>
        )}
      />

      {error && <div className="vk-error-alert" role="alert">{error}</div>}
      {loading ? (
        <p>{t('Laster pasientavslåtte avtaler...')}</p>
      ) : sortedAppointments.length === 0 ? (
        <EmptyState
          icon="calendar-check"
          text={t('Ingen pasientavslåtte avtaler trenger ny planlegging.')}
        />
      ) : (
        <div className="d-flex flex-column gap-3">
          {sortedAppointments.map((appointment) => {
            const hasProposal = !!appointment.patientProposedDate &&
              !!appointment.patientProposedStartTime &&
              !!appointment.patientProposedEndTime;
            const originalDate = appointment.date
              ? new Date(`${appointment.date}T12:00:00`).toLocaleDateString(locale, {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })
              : '';
            return (
              <AppointmentCard
                key={appointment.id}
                appointment={appointment}
                dateTimeText={`${originalDate} · ${appointment.startTime}–${appointment.endTime}`}
                onClick={() => setInfoAppointment(appointment)}
                subject={(
                  <>
                    <div>{t('Pasient: {{name}}', { name: appointment.patientName || t('Ukjent pasient') })}</div>
                    <div>
                      {appointment.personnelName
                        ? t('Sykepleier: {{name}}', { name: appointment.personnelName })
                        : t('Sykepleier ikke oppgitt')}
                    </div>
                  </>
                )}
                footerNote={(
                  <span className="text-muted small">
                    <i className="bi bi-lock me-2" aria-hidden="true"></i>
                    {t('Det avslåtte tidspunktet kan ikke velges igjen for denne pasienten.')}
                  </span>
                )}
                actions={(
                  <>
                    <button
                      className="btn btn-outline-secondary"
                      type="button"
                      onClick={() => setInfoAppointment(appointment)}
                    >
                      <i className="bi bi-info-circle me-2" aria-hidden="true"></i>
                      {t('Info')}
                    </button>
                    {hasProposal && (
                      <button
                        className="btn btn-success"
                        type="button"
                        disabled={acceptingProposalId === appointment.id}
                        onClick={() => void acceptProposal(appointment)}
                      >
                        {acceptingProposalId === appointment.id
                          ? <span className="spinner-border spinner-border-sm me-2" aria-hidden="true"></span>
                          : <i className="bi bi-calendar2-check me-2" aria-hidden="true"></i>}
                        {t('Godta foreslått avtale')}
                      </button>
                    )}
                    <button className="btn btn-primary" type="button" onClick={() => openReschedule(appointment)}>
                      <i className="bi bi-calendar2-plus me-2" aria-hidden="true"></i>
                      {t('Planlegg et nytt tidspunkt')}
                    </button>
                  </>
                )}
              />
            );
          })}
        </div>
      )}

      <AppointmentModal
        show={Boolean(selected)}
        onClose={() => setSelected(undefined)}
        initialData={selected}
        defaultPersonnelId={selected?.personnelId}
        onSubmit={submitReschedule}
      />

      <PlannedVisitModal
        show={infoAppointment !== null}
        onClose={() => setInfoAppointment(null)}
        appointment={infoAppointment}
      />

      <Modal show={!!proposalError} onHide={closeProposalError} centered>
        <Modal.Header closeButton>
          <Modal.Title>{t('Could not accept the proposed time')}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>{proposalError}</p>
          <p className="mb-0">{t('Velg et annet tidspunkt og planlegg avtalen på nytt.')}</p>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="primary"
            onClick={() => {
              const appointment = proposalFailedAppointment;
              closeProposalError();
              if (appointment) openReschedule(appointment);
            }}
          >
            <i className="bi bi-calendar2-plus me-2" aria-hidden="true"></i>
            {t('Planlegg et nytt tidspunkt')}
          </Button>
          <Button
            variant="secondary"
            onClick={closeProposalError}
          >
            {t('Lukk')}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
};

export default CancelledAppointmentsPage;
