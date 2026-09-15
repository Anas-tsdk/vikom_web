import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import AppointmentService from '../services/AppointmentService';
import type { Appointment } from '../types/appointment';
import { getUserInfo } from '../../auth/AuthService';
import { isHeadNurseRole, isPortalRole } from '../../auth/roles';
import { isSupabaseConfigured, signalingService } from '../../services/SupabaseSignalingService';

interface DeclineNotice {
  appointmentId?: number;
  patientName: string;
  proposedDate?: string | null;
  proposedStartTime?: string | null;
  proposedEndTime?: string | null;
}

interface StaffEventPayload {
  appointmentId?: unknown;
  action?: unknown;
  patientName?: unknown;
  patientResponseStatus?: unknown;
  patientProposedDate?: unknown;
  patientProposedStartTime?: unknown;
  patientProposedEndTime?: unknown;
}

const LAST_SEEN_KEY = 'vikom:last-declined-appointment-response';

const toNotice = (payload: StaffEventPayload): DeclineNotice | null => {
  if (payload.patientResponseStatus !== 'Declined' && payload.action !== 'declined') return null;
  return {
    appointmentId: typeof payload.appointmentId === 'number' ? payload.appointmentId : undefined,
    patientName: typeof payload.patientName === 'string' ? payload.patientName : '',
    proposedDate: typeof payload.patientProposedDate === 'string' ? payload.patientProposedDate : null,
    proposedStartTime: typeof payload.patientProposedStartTime === 'string' ? payload.patientProposedStartTime : null,
    proposedEndTime: typeof payload.patientProposedEndTime === 'string' ? payload.patientProposedEndTime : null,
  };
};

const noticeFromAppointment = (appointment: Appointment): DeclineNotice => ({
  appointmentId: appointment.id,
  patientName: appointment.patientName ?? '',
  proposedDate: appointment.patientProposedDate,
  proposedStartTime: appointment.patientProposedStartTime,
  proposedEndTime: appointment.patientProposedEndTime,
});

/** App-styled staff notification; never uses an operating-system notification. */
const AppointmentStaffNotification: React.FC = () => {
  const { t } = useTranslation();
  const user = getUserInfo();
  const [notice, setNotice] = useState<DeclineNotice | null>(null);
  const checkingRef = useRef(false);
  const isStaff = isPortalRole(user?.role);
  const isHeadNurse = isHeadNurseRole(user?.role);

  const showRealtimeNotice = useCallback((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return;
    const next = toNotice(raw as StaffEventPayload);
    if (!next) return;
    localStorage.setItem(LAST_SEEN_KEY, new Date().toISOString());
    setNotice(next);
  }, []);

  const checkForMissedDecline = useCallback(async () => {
    if (!isStaff || checkingRef.current) return;
    checkingRef.current = true;
    try {
      const appointments = await AppointmentService.getAll();
      const latest = appointments
        .filter((appointment) => appointment.status === 'Cancelled' &&
          appointment.patientResponseStatus === 'Declined' && appointment.patientRespondedAt)
        .sort((a, b) => (b.patientRespondedAt ?? '').localeCompare(a.patientRespondedAt ?? ''))[0];
      if (!latest?.patientRespondedAt) return;
      const lastSeen = localStorage.getItem(LAST_SEEN_KEY);
      if (!lastSeen || Date.parse(latest.patientRespondedAt) > Date.parse(lastSeen)) {
        localStorage.setItem(LAST_SEEN_KEY, latest.patientRespondedAt);
        setNotice(noticeFromAppointment(latest));
      }
    } catch {
      // Realtime remains active; page-level error states cover API failures.
    } finally {
      checkingRef.current = false;
    }
  }, [isStaff]);

  useEffect(() => {
    if (!isStaff || !user?.userId) return;
    signalingService.on('appointment_staff_event', showRealtimeNotice);
    if (isSupabaseConfigured) void signalingService.initialize(user.userId).catch(() => undefined);
    void checkForMissedDecline();
    const interval = window.setInterval(() => { void checkForMissedDecline(); }, 15_000);
    return () => {
      signalingService.off('appointment_staff_event', showRealtimeNotice);
      window.clearInterval(interval);
    };
  }, [checkForMissedDecline, isStaff, showRealtimeNotice, user?.userId]);

  if (!notice) return null;
  const hasProposal = notice.proposedDate && notice.proposedStartTime && notice.proposedEndTime;
  const patientName = notice.patientName || t('Ukjent pasient');

  return (
    <aside className="vk-staff-notification" role="status" aria-live="polite">
      <div className="vk-staff-notification__icon" aria-hidden="true">
        <i className="bi bi-calendar-x"></i>
      </div>
      <div className="vk-staff-notification__body">
        <strong>{t('Pasienten avslo avtalen')}</strong>
        <p className="mb-2">
          {hasProposal
            ? t('{{name}} avslo avtalen og foreslo et nytt tidspunkt.', { name: patientName })
            : t('{{name}} avslo avtalen.', { name: patientName })}
        </p>
        {hasProposal && (
          <p className="vk-staff-notification__proposal mb-3">
            {notice.proposedDate} · {notice.proposedStartTime}–{notice.proposedEndTime}
          </p>
        )}
        <Link
          className="btn btn-primary btn-sm"
          to={isHeadNurse ? '/appointments/cancelled' : '/appointments'}
          onClick={() => setNotice(null)}
        >
          {isHeadNurse ? t('Åpne avlyste avtaler') : t('Åpne avtaler')}
        </Link>
      </div>
      <button
        type="button"
        className="vk-staff-notification__close"
        aria-label={t('Lukk')}
        onClick={() => setNotice(null)}
      >
        <i className="bi bi-x-lg" aria-hidden="true"></i>
      </button>
    </aside>
  );
};

export default AppointmentStaffNotification;
