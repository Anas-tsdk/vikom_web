import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Alert, Button, Col, Row, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import PatientService from '../services/PatientService';
import Badge, { type BadgeColor } from '../../components/common/Badge';
import type { PatientDetailsDto } from '../types/patient';
import SectionCard from '../../components/common/SectionCard';
import IconButton from '../../components/common/IconButton';
import InfoRow from '../../components/common/InfoRow';
import EmptyState from '../../components/common/EmptyState';
import CallModal from '../../components/common/CallModal';
import VisitDetailsModal from '../../visits/components/VisitDetailsModal';
import PlannedVisitModal, { type PlannedVisitData } from '../../visits/components/PlannedVisitModal';
import AppointmentCard from '../../appointments/components/AppointmentCard';
import type { AppointmentSummary } from '../../appointments/types/appointment';
import Breadcrumb from '../../components/common/Breadcrumb';
import PatientProfileHeader from '../components/PatientProfileHeader';
import PatientNotesCard from '../components/PatientNotesCard';
import EditPatientModal from '../components/EditPatientModal';
import ClinicalOverviewCard from '../components/ClinicalOverviewCard';
import DiagnosesCard from '../components/DiagnosesCard';
import MedicationsCard from '../components/MedicationsCard';
import TreatmentPlanCard from '../components/TreatmentPlanCard';
import * as AuthService from '../../auth/AuthService';
import { isHeadNurseRole, isPortalRole } from '../../auth/roles';
import { localeForLanguage } from '../../i18n';
import './PatientDetailsPage.css';

const PAST_PREVIEW_COUNT = 3;

type RightTab = 'upcoming' | 'past' | 'calls';

const callStatusMeta = (status: string, t: TFunction): { label: string; variant: BadgeColor } => {
  switch (status.toLowerCase()) {
    case 'answered':
      return { label: t('Besvart'), variant: 'success' };
    case 'declined':
      return { label: t('Avvist'), variant: 'danger' };
    case 'missed':
      return { label: t('Tapt'), variant: 'warning' };
    case 'ended':
      return { label: t('Avsluttet'), variant: 'neutral' };
    default:
      return { label: t('Ringte'), variant: 'info' };
  }
};

const formatCallTime = (iso: string, locale: string): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const PatientDetailsPage: React.FC = () => {
  // Route key — the patient's username (falls back to the GUID id for patients
  // without one). Child API calls still use the resolved patient.id (GUID).
  const { username: patientKey } = useParams<{ username: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.resolvedLanguage);
  const userInfo = AuthService.getUserInfo();
  const currentPersonnelId = userInfo?.userId;
  const isPersonnel = isPortalRole(userInfo?.role);
  const isHeadNurse = isHeadNurseRole(userInfo?.role);

  const [patient, setPatient] = useState<PatientDetailsDto | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [infoMessage, setInfoMessage] = useState<string>('');
  const [showCallModal, setShowCallModal] = useState<boolean>(false);
  const [callMediaType, setCallMediaType] = useState<'audio' | 'video'>('audio');
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [showAllPast, setShowAllPast] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<RightTab>('upcoming');
  const [detailsVisitId, setDetailsVisitId] = useState<number | null>(null);
  const [plannedVisit, setPlannedVisit] = useState<PlannedVisitData | null>(null);

  const loadPatient = useCallback(async () => {
    if (!patientKey) {
      setError(t('Mangler pasient-ID.'));
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError('');
      setInfoMessage('');
      const data = await PatientService.getById(patientKey);
      setPatient(data);
    } catch (err) {
      setError(t('Kunne ikke laste pasientdetaljer.'));
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [patientKey, t]);

  useEffect(() => {
    loadPatient();
  }, [loadPatient]);

  // Lightweight refetch that doesn't flash the full-page spinner (used after a
  // call is logged so the communication history stays current).
  const refreshPatient = useCallback(async () => {
    if (!patientKey) return;
    try {
      const data = await PatientService.getById(patientKey);
      setPatient(data);
    } catch (err) {
      console.error(err);
    }
  }, [patientKey]);

  const deviceStatus = useMemo((): { label: string; color: BadgeColor; bordered: boolean } => {
    if (!patient) {
      return { label: t('Ukjent'), color: 'neutral', bordered: false };
    }

    if (patient.supabaseProfileId) {
      return { label: t('Account linked'), color: 'connected', bordered: true };
    }

    return { label: t('No account linked'), color: 'warning', bordered: false };
  }, [patient, t]);

  const handleCallClick = (mediaType: 'audio' | 'video') => {
    setCallMediaType(mediaType);
    setShowCallModal(true);
  };

  const handleCallModalHide = () => {
    setShowCallModal(false);
    refreshPatient();
  };

  const renderPatientEditAction = () =>
    isHeadNurse
      ? <IconButton icon="pencil" title={t('Rediger')} onClick={() => setShowEditModal(true)} />
      : undefined;

  if (loading) {
    return (
      <div className="patient-details-page">
        <div className="d-flex align-items-center gap-2 py-4">
          <Spinner animation="border" size="sm" />
          <span>{t('Laster pasientdetaljer...')}</span>
        </div>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="patient-details-page">
        <Alert variant="danger">{t('Fant ikke pasientdata.')}</Alert>
        <Link to="/patients" className="btn btn-outline-dark">
          {t('Tilbake til pasientlisten')}
        </Link>
      </div>
    );
  }

  const pastAppointments = patient.pastAppointments ?? [];
  const visiblePast = showAllPast ? pastAppointments : pastAppointments.slice(0, PAST_PREVIEW_COUNT);
  const recentCalls = patient.recentCalls ?? [];

  // Clinical execution never implies takeover: even a head nurse may inspect
  // another nurse's records, but only the assigned nurse gets an execution
  // shortcut.
  const ongoingVisit = isPersonnel
    ? [...patient.upcomingAppointments, ...pastAppointments].find((a) =>
        a.personnelId === currentPersonnelId && a.visitStatus === 'Active')
    : undefined;
  const ongoingVisitHref = ongoingVisit
    ? `/besok/${ongoingVisit.id}${ongoingVisit.visitType === 'Digital' ? '?type=Digital' : ''}`
    : undefined;

  // For personnel, clicking a row whose visit is currently Active (pågår) opens
  // the visit-execution workspace — the same destination as the header shortcut.
  const visitRowOnClick = (appt: AppointmentSummary) =>
    isPersonnel &&
    appt.personnelId === currentPersonnelId &&
    appt.visitStatus === 'Active' &&
    appt.id
      ? () => navigate(`/besok/${appt.id}${appt.visitType === 'Digital' ? '?type=Digital' : ''}`)
      : undefined;

  // One document icon per appointment card: the post-visit "Besøksdetaljer"
  // once the visit has ended, otherwise the read-only "Planlagt besøk".
  const renderVisitDoc = (appt: AppointmentSummary) => {
    const visitDone =
      !!appt.visitId &&
      (appt.visitStatus === 'Completed' ||
        appt.visitStatus === 'Incomplete' ||
        appt.visitStatus === 'Cancelled');

    // Finished visit → the post-visit record.
    if (visitDone) {
      return (
        <IconButton
          icon="journal-text"
          title={t('Besøksdetaljer')}
          onClick={() => setDetailsVisitId(appt.visitId ?? null)}
        />
      );
    }

    // Finished appointment without a visit record → nothing to show.
    const isTerminal =
      appt.status === 'Completed' || appt.status === 'NotCompleted' || appt.status === 'Cancelled';
    if (isTerminal) return undefined;

    // Planned appointment → the read-only pre-visit plan.
    return (
      <IconButton
        icon="clipboard-check"
        title={t('Planlagt besøk')}
        onClick={() =>
          setPlannedVisit({
            patientName: appt.patientName,
            patientAddress: patient.address ?? null,
            date: appt.date,
            startTime: appt.startTime,
            endTime: appt.endTime,
            tasks: appt.tasks,
            visitType: appt.visitType,
            availabilityNotes: appt.availabilityNotes,
          })
        }
      />
    );
  };

  const tabs: { key: RightTab; label: string; icon: string; count?: number }[] = [
    { key: 'upcoming', label: t('Kommende avtaler'), icon: 'calendar-event', count: patient.upcomingAppointments.length },
    { key: 'past', label: t('Tidligere avtaler'), icon: 'clock-history', count: pastAppointments.length },
    { key: 'calls', label: t('Anropslogg'), icon: 'telephone', count: recentCalls.length },
  ];

  return (
    <div className="patient-details-page">
      <Breadcrumb items={[{ label: t('Pasienter'), to: '/patients' }, { label: patient.fullName }]} />

      {error && (
        <Alert variant="danger" dismissible onClose={() => setError('')}>
          {error}
        </Alert>
      )}

      {infoMessage && (
        <Alert variant="info" dismissible onClose={() => setInfoMessage('')}>
          {infoMessage}
        </Alert>
      )}

      <PatientProfileHeader
        patient={patient}
        onAudioCall={() => handleCallClick('audio')}
        onVideoCall={() => handleCallClick('video')}
        onEdit={isHeadNurse ? () => setShowEditModal(true) : undefined}
        ongoingVisitHref={ongoingVisitHref}
      />

      <Row className="g-4">
        <Col lg={4}>
          <div className="vk-card-stack">

            <SectionCard title={t('Linked account')} icon="person-check">
              <InfoRow
                label={t('Status')}
                value={
                  <Badge bg={deviceStatus.color} bordered={deviceStatus.bordered}>
                    {deviceStatus.label}
                  </Badge>
                }
              />
              <InfoRow
                label={t('Account ID')}
                value={patient.supabaseProfileId}
                emptyText={t('Not linked')}
              />
            </SectionCard>

            <ClinicalOverviewCard
              clinical={patient.clinical}
              action={renderPatientEditAction()}
            />
            <DiagnosesCard
              diagnoses={patient.clinical.diagnoses}
              action={renderPatientEditAction()}
            />
            <MedicationsCard
              medications={patient.clinical.medications}
              action={renderPatientEditAction()}
            />
            <TreatmentPlanCard
              patientId={patient.id}
              treatmentPlan={patient.clinical.treatmentPlan}
              conditionFlags={patient.clinical.conditionFlags}
              canEdit={isPersonnel}
              onSaved={(treatmentPlan) =>
                setPatient((prev) =>
                  prev
                    ? { ...prev, clinical: { ...prev.clinical, treatmentPlan } }
                    : prev,
                )
              }
            />

            <PatientNotesCard
              patientId={patient.id}
              initialNotes={patient.notes}
              notesUpdatedAt={patient.notesUpdatedAt}
              onSaved={(notes) =>
                setPatient((prev) =>
                  prev ? { ...prev, notes, notesUpdatedAt: new Date().toISOString() } : prev,
                )
              }
            />
          </div>
        </Col>

        <Col lg={8}>
          <div className="vk-tabs-card">
            <ul className="vk-tabs-nav" role="tablist">
              {tabs.map((tab) => (
                <li key={tab.key} className="vk-tabs-item" role="presentation">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === tab.key}
                    className={`vk-tab-button ${activeTab === tab.key ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.key)}
                  >
                    <i className={`bi bi-${tab.icon}`} aria-hidden="true"></i>
                    <span className="vk-tab-label">{tab.label}</span>
                    {tab.count !== undefined && <span className="vk-tab-count">{tab.count}</span>}
                  </button>
                </li>
              ))}
            </ul>

            <div className="vk-tabs-content">
              {activeTab === 'upcoming' &&
                (patient.upcomingAppointments.length === 0 ? (
                  <EmptyState icon="calendar-x" text={t('Ingen kommende avtaler.')} />
                ) : (
                  <div className="d-grid gap-3">
                    {patient.upcomingAppointments.map((appointment) => (
                      <AppointmentCard
                        key={appointment.id}
                        appointment={appointment}
                        actions={renderVisitDoc(appointment)}
                        onClick={visitRowOnClick(appointment)}
                      />
                    ))}
                  </div>
                ))}

              {activeTab === 'past' &&
                (pastAppointments.length === 0 ? (
                  <EmptyState icon="calendar2-x" text={t('Ingen tidligere avtaler.')} />
                ) : (
                  <>
                    <div className="d-grid gap-3">
                      {visiblePast.map((appointment) => (
                        <AppointmentCard
                          key={appointment.id}
                          appointment={appointment}
                          actions={renderVisitDoc(appointment)}
                          onClick={visitRowOnClick(appointment)}
                        />
                      ))}
                    </div>
                    {pastAppointments.length > PAST_PREVIEW_COUNT && (
                      <div className="text-center mt-3">
                        <Button variant="link" className="p-0 text-dark" onClick={() => setShowAllPast((v) => !v)}>
                          {showAllPast ? t('Vis færre') : t('Vis alle ({{count}})', { count: pastAppointments.length })}
                        </Button>
                      </div>
                    )}
                  </>
                ))}

              {activeTab === 'calls' &&
                (recentCalls.length === 0 ? (
                  <EmptyState icon="telephone-x" text={t('Ingen registrerte anrop.')} />
                ) : (
                  <div className="vk-call-log">
                    {recentCalls.map((call) => {
                      const meta = callStatusMeta(call.status, t);
                      return (
                        <div key={call.id} className="vk-call-log-item">
                          <div className="vk-call-log-main">
                            <i className="bi bi-telephone-outbound vk-call-log-icon" aria-hidden="true"></i>
                            <div>
                              <div className="fw-semibold">{call.personnelName || t('Helsepersonell')}</div>
                              <div className="text-muted small">{formatCallTime(call.startedAt, locale)}</div>
                            </div>
                          </div>
                          <Badge bg={meta.variant}>{meta.label}</Badge>
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
          </div>
        </Col>
      </Row>

      {isHeadNurse && (
        <EditPatientModal
          show={showEditModal}
          onHide={() => setShowEditModal(false)}
          patient={patient}
          onSaved={(updated) => setPatient(updated)}
        />
      )}

      <CallModal
        show={showCallModal}
        onHide={handleCallModalHide}
        targetSupabaseProfileId={patient.supabaseProfileId}
        patientId={patient.id}
        patientName={patient.fullName}
        mediaType={callMediaType}
      />

      <VisitDetailsModal
        show={detailsVisitId !== null}
        onClose={() => setDetailsVisitId(null)}
        visitId={detailsVisitId}
      />

      <PlannedVisitModal
        show={plannedVisit !== null}
        onClose={() => setPlannedVisit(null)}
        appointment={plannedVisit}
      />
    </div>
  );
};

export default PatientDetailsPage;
