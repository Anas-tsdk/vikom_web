import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageHeader from '../../components/common/PageHeader';
import EmptyState from '../../components/common/EmptyState';
import AppointmentCard from '../components/AppointmentCard';
import AppointmentModal from '../components/AppointmentModal';
import AppointmentService from '../services/AppointmentService';
import type { Appointment } from '../types/appointment';
import { getUserInfo } from '../../auth/AuthService';
import { isHeadNurseRole } from '../../auth/roles';
import { localeForLanguage } from '../../i18n';
import { isSupabaseConfigured, signalingService } from '../../services/SupabaseSignalingService';
import './AppointmentListPage.css';

const CancelledAppointmentsPage: React.FC = () => {
  const { t, i18n } = useTranslation();
  const user = getUserInfo();
  const authorized = isHeadNurseRole(user?.role);
  const locale = localeForLanguage(i18n.resolvedLanguage);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [selected, setSelected] = useState<Appointment>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadAppointments = useCallback(async (silent = false) => {
    if (!authorized) {
      setLoading(false);
      return;
    }
    try {
      if (!silent) setLoading(true);
      const all = await AppointmentService.getAll();
      setAppointments(all.filter((appointment) =>
        appointment.status === 'Cancelled' &&
        appointment.patientResponseStatus === 'Declined'));
      setError('');
    } catch {
      setError(t('Kunne ikke laste avlyste avtaler'));
    } finally {
      if (!silent) setLoading(false);
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
    await loadAppointments(true);
  };

  if (!authorized) {
    return (
      <div className="appointment-list-page">
        <PageHeader title={t('Avlyste avtaler')} />
        <div className="alert alert-danger" role="alert">
          {t('Kun ledende sykepleiere kan planlegge avlyste avtaler på nytt.')}
        </div>
      </div>
    );
  }

  return (
    <div className="appointment-list-page personnel-page">
      <PageHeader
        title={t('Avlyste avtaler')}
        subtitle={t('Se pasientens svar og planlegg et nytt tidspunkt.')}
        actions={(
          <Link className="btn btn-outline-primary" to="/appointments">
            <i className="bi bi-arrow-left me-2" aria-hidden="true"></i>{t('Tilbake til avtaler')}
          </Link>
        )}
      />

      {error && <div className="vk-error-alert" role="alert">{error}</div>}
      {loading ? (
        <p>{t('Laster avlyste avtaler...')}</p>
      ) : sortedAppointments.length === 0 ? (
        <EmptyState
          icon="calendar-check"
          text={t('Ingen avlyste avtaler trenger ny planlegging.')}
        />
      ) : (
        <div className="d-flex flex-column gap-3">
          {sortedAppointments.map((appointment) => {
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
                subject={t('Pasient: {{name}}', { name: appointment.patientName || t('Ukjent pasient') })}
                footerNote={(
                  <span className="text-muted small">
                    <i className="bi bi-lock me-2" aria-hidden="true"></i>
                    {t('Det avslåtte tidspunktet kan ikke velges igjen for denne pasienten.')}
                  </span>
                )}
                actions={(
                  <button className="btn btn-primary" type="button" onClick={() => openReschedule(appointment)}>
                    <i className="bi bi-calendar2-plus me-2" aria-hidden="true"></i>
                    {t('Planlegg et nytt tidspunkt')}
                  </button>
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
    </div>
  );
};

export default CancelledAppointmentsPage;
