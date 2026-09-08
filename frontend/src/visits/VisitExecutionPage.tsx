import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Row, Col, Card, Button, Spinner, Alert, Form, ProgressBar } from 'react-bootstrap';
import SectionCard from '../components/common/SectionCard';
import EmptyState from '../components/common/EmptyState';
import StatusBadge from '../components/common/StatusBadge';
import Avatar from '../components/common/Avatar';
import Breadcrumb from '../components/common/Breadcrumb';
import Badge from '../components/common/Badge';
import CallModal, { type CallOutcome } from '../components/common/CallModal';
import CancelVisitModal from './components/CancelVisitModal';
import ClinicalOverviewCard from '../patients/components/ClinicalOverviewCard';
import DiagnosesCard from '../patients/components/DiagnosesCard';
import MedicationsCard from '../patients/components/MedicationsCard';
import TreatmentPlanCard from '../patients/components/TreatmentPlanCard';
import VisitService from './services/VisitService';
import type { Visit, VisitTask, VisitType } from './types/visit';
import './VisitExecutionPage.css';

const MAX_CALL_ATTEMPTS = 3;
const NOTES_AUTOSAVE_MS = 1500;

const formatTime = (iso?: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('nb-NO', { hour: '2-digit', minute: '2-digit' });
};

const attemptLabel = (status: string): string => {
  switch (status.toLowerCase()) {
    case 'answered':
      return 'Besvart';
    case 'declined':
      return 'Avvist';
    case 'missed':
      return 'Ingen svar';
    case 'ended':
      return 'Avsluttet';
    case 'failed':
      return 'Teknisk feil';
    default:
      return 'Ringte';
  }
};

// Live "Økt" timer: elapsed time since the visit started, ticking each second.
const useElapsed = (startedAt?: string | null): string => {
  const [now, setNow] = useState<number>(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!startedAt) return '';
  const start = new Date(startedAt).getTime();
  if (isNaN(start)) return '';

  let secs = Math.max(0, Math.floor((now - start) / 1000));
  const h = Math.floor(secs / 3600);
  secs -= h * 3600;
  const m = Math.floor(secs / 60);
  secs -= m * 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(secs)}` : `${pad(m)}:${pad(secs)}`;
};

const VisitExecutionPage: React.FC = () => {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const requestedType: VisitType = searchParams.get('type') === 'Digital' ? 'Digital' : 'Physical';

  const [visit, setVisit] = useState<Visit | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');
  const [actionError, setActionError] = useState<string>('');

  const [notes, setNotes] = useState<string>('');
  const [notesSaving, setNotesSaving] = useState<boolean>(false);
  const notesDirtyRef = useRef<boolean>(false);
  const autosaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [newTaskTitle, setNewTaskTitle] = useState<string>('');
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [showCallModal, setShowCallModal] = useState<boolean>(false);
  const [completing, setCompleting] = useState<boolean>(false);

  const pendingOutcomeRef = useRef<CallOutcome | null>(null);
  const [callPrompt, setCallPrompt] = useState<{ outcome: CallOutcome; attemptCount: number } | null>(null);
  const [callSuccess, setCallSuccess] = useState<boolean>(false);

  const elapsed = useElapsed(visit?.startedAt);

  // Start (or resume) the visit when the page loads.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!appointmentId) {
        setError('Mangler avtale-ID.');
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError('');
        const data = await VisitService.startVisit(Number(appointmentId), requestedType);
        if (cancelled) return;
        setVisit(data);
        setNotes(data.notes ?? '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Kunne ikke åpne besøket.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appointmentId]);

  const isActive = visit?.status === 'Active';

  // --- Notes ----------------------------------------------------------------
  const saveNotes = useCallback(async () => {
    if (!visit || !notesDirtyRef.current) return;
    try {
      setNotesSaving(true);
      await VisitService.updateNotes(visit.id, notes);
      notesDirtyRef.current = false;
    } catch {
      setActionError('Kunne ikke lagre notatet automatisk.');
    } finally {
      setNotesSaving(false);
    }
  }, [visit, notes]);

  const saveNotesNow = useCallback(async () => {
    if (!visit) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    try {
      setNotesSaving(true);
      await VisitService.updateNotes(visit.id, notes);
      notesDirtyRef.current = false;
    } catch {
      setActionError('Kunne ikke lagre notatet.');
    } finally {
      setNotesSaving(false);
    }
  }, [visit, notes]);

  const handleNotesChange = (value: string) => {
    setNotes(value);
    notesDirtyRef.current = true;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => saveNotes(), NOTES_AUTOSAVE_MS);
  };

  useEffect(() => {
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, []);

  // --- Tasks ----------------------------------------------------------------
  const applyTask = (updated: VisitTask) => {
    setVisit((prev) =>
      prev ? { ...prev, tasks: prev.tasks.map((t) => (t.id === updated.id ? updated : t)) } : prev,
    );
  };

  const updateTask = async (task: VisitTask, status: VisitTask['status'], skippedReason?: string | null) => {
    if (!visit) return;
    try {
      const updated = await VisitService.updateTask(visit.id, task.id, status, skippedReason);
      applyTask(updated);
    } catch {
      setActionError('Kunne ikke oppdatere oppgaven.');
    }
  };

  const toggleTask = (task: VisitTask) => {
    updateTask(task, task.status === 'Completed' ? 'Pending' : 'Completed');
  };

  const handleSkip = (task: VisitTask) => {
    const reason = window.prompt('Årsak til at oppgaven hoppes over (valgfritt):', '');
    if (reason === null) return;
    updateTask(task, 'Skipped', reason.trim() || null);
  };

  const handleAddTask = async () => {
    const title = newTaskTitle.trim();
    if (!title || !visit) return;
    try {
      const created = await VisitService.addTask(visit.id, title);
      setVisit((prev) => (prev ? { ...prev, tasks: [...prev.tasks, created] } : prev));
      setNewTaskTitle('');
    } catch {
      setActionError('Kunne ikke legge til oppgaven.');
    }
  };

  // --- Complete / cancel ----------------------------------------------------
  const refreshVisit = useCallback(async () => {
    if (!visit) return;
    try {
      const data = await VisitService.getById(visit.id);
      setVisit(data);
    } catch {
      /* non-fatal */
    }
  }, [visit]);

  const handleComplete = async () => {
    if (!visit) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    try {
      setCompleting(true);
      await saveNotes();
      await VisitService.complete(visit.id, { notes, followUpRequired: false });
      navigate('/appointments');
    } catch {
      setActionError('Kunne ikke fullføre besøket.');
      setCompleting(false);
    }
  };

  const cancelVisit = async (reason: string, extraNotes: string) => {
    if (!visit) return;
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    const combined = [notes, extraNotes]
      .map((s) => s?.trim())
      .filter(Boolean)
      .join('\n\n');
    await VisitService.cancel(visit.id, reason, combined || null);
    navigate('/appointments');
  };

  // --- Digital call flow ----------------------------------------------------
  const openCall = () => {
    setCallPrompt(null);
    setCallSuccess(false);
    setShowCallModal(true);
  };

  const handleCallOutcome = (outcome: CallOutcome) => {
    pendingOutcomeRef.current = outcome;
  };

  const handleCallModalHide = async () => {
    setShowCallModal(false);
    await refreshVisit();
    const outcome = pendingOutcomeRef.current;
    pendingOutcomeRef.current = null;
    if (!outcome) return;
    if (outcome === 'Answered') {
      setCallSuccess(true);
      setCallPrompt(null);
    } else {
      let count = visit ? visit.callAttempts.length : 0;
      if (visit) {
        try {
          const fresh = await VisitService.getById(visit.id);
          count = fresh.callAttempts.length;
        } catch {
          /* fall back to local count */
        }
      }
      setCallPrompt({ outcome, attemptCount: count });
    }
  };

  // --- Render ---------------------------------------------------------------
  if (loading) {
    return (
      <div className="visit-execution-page">
        <div className="d-flex align-items-center gap-2 py-4">
          <Spinner animation="border" size="sm" />
          <span>Åpner besøk...</span>
        </div>
      </div>
    );
  }

  if (error || !visit) {
    return (
      <div className="visit-execution-page">
        <Alert variant="danger">{error || 'Fant ikke besøket.'}</Alert>
        <Link to="/appointments" className="btn btn-outline-dark">
          Tilbake til avtaler
        </Link>
      </div>
    );
  }

  const isDigital = visit.visitType === 'Digital';
  // Calling the patient's TV is useful on every visit, not just digital ones (a
  // nurse standing outside a door still needs to reach the patient), so the call
  // only requires a linked TV profile.
  const canCall = !!visit.supabaseProfileId;
  const hasCallAttempts = visit.callAttempts.length > 0;
  const callLabel = hasCallAttempts ? 'Ring igjen' : 'Ring pasient';
  const completedCount = visit.tasks.filter((t) => t.status === 'Completed').length;
  const totalTasks = visit.tasks.length;
  const progressPct = totalTasks > 0 ? Math.round((completedCount / totalTasks) * 100) : 0;

  return (
    <div className="visit-execution-page">
      <Breadcrumb
        items={[
          { label: 'Avtaler', to: '/appointments' },
          { label: `Aktivt besøk` },
        ]}
      />

      {actionError && (
        <Alert variant="danger" dismissible onClose={() => setActionError('')}>
          {actionError}
        </Alert>
      )}

      {!isActive && (
        <Alert variant="info">Dette besøket er avsluttet. Det kan ikke endres.</Alert>
      )}

      {/* Header */}
      <Card className="border-dark mb-4">
        <Card.Body>
          <div className="d-flex flex-column flex-md-row justify-content-between gap-3">
            <div className="d-flex gap-3">
              <Avatar name={visit.patientName} size="lg" />
              <div>
                <div className="d-flex align-items-center gap-2 mb-1">
                  <StatusBadge status={visit.status} />
                  {isActive && elapsed && <Badge bg="light" bordered>Økt · {elapsed}</Badge>}
                </div>
                <h1 className="mb-2">{visit.patientName}</h1>
                <div className="d-flex flex-wrap gap-2">
                  <Badge icon="clock" bg="light" bordered>{`${visit.startTime ?? ''}–${visit.endTime ?? ''}`}</Badge>
                  {visit.patientAddress && <Badge icon="geo-alt" bg="light" bordered>{visit.patientAddress}</Badge>}
                  {visit.patientPhone && <Badge icon="telephone" bg="light" bordered>{visit.patientPhone}</Badge>}
                </div>
              </div>
            </div>

            {isActive && (
              <div className="d-flex flex-wrap align-items-start gap-2">
                <Button
                  variant="primary"
                  onClick={openCall}
                  disabled={!canCall || completing}
                  title={!canCall ? 'Pasienten har ingen TV-profil koblet til seg' : undefined}
                >
                  <i className="bi bi-telephone-outbound me-2" aria-hidden="true"></i>
                  {callLabel}
                </Button>
                <Button variant="outline-danger" onClick={() => setShowCancelModal(true)} disabled={completing}>
                  <i className="bi bi-x-circle me-2" aria-hidden="true"></i>Avbryt besøk
                </Button>
                <Button variant="dark" onClick={handleComplete} disabled={completing}>
                  <i className="bi bi-check-circle me-2" aria-hidden="true"></i>
                  {completing ? 'Fullfører...' : 'Fullfør besøk'}
                </Button>
              </div>
            )}
          </div>

        </Card.Body>
      </Card>

      <Card className="vk-progress-card mb-4">
        <Card.Body>
          <div className="d-flex justify-content-between align-items-center mb-2">
            <span className="fw-semibold">Fremgang</span>
            <span className="text-muted">{completedCount} av {totalTasks} oppgaver fullført</span>
          </div>
          <ProgressBar now={progressPct} variant="success" />
        </Card.Body>
      </Card>

      <Row className="g-4">
        {/* Left: clinical profile */}
        <Col lg={4}>
          <div className="d-flex flex-column gap-4">
            <ClinicalOverviewCard clinical={visit.patientClinical} />
            <DiagnosesCard diagnoses={visit.patientClinical.diagnoses} />
            <MedicationsCard medications={visit.patientClinical.medications} />
          </div>
        </Col>

        {/* Right: plan, tasks, notes */}
        <Col lg={8}>
          <div className="d-flex flex-column gap-4">
            <TreatmentPlanCard
              treatmentPlan={visit.patientClinical.treatmentPlan}
              conditionFlags={visit.patientClinical.conditionFlags}
            />

            {(isDigital || hasCallAttempts) && (
              <SectionCard title="Samtaleforsøk" icon="telephone-outbound">
                {visit.callAttempts.length === 0 ? (
                  <p className="text-muted mb-0">Ingen samtaleforsøk registrert enda.</p>
                ) : (
                  <ol className="ps-3 mb-0">
                    {visit.callAttempts.map((a) => (
                      <li key={a.id} className="mb-1">
                        <span className="text-muted">{formatTime(a.startedAt)}</span> — {attemptLabel(a.status)}
                      </li>
                    ))}
                  </ol>
                )}

                {callSuccess && (
                  <Alert variant="success" className="mt-3 mb-0">
                    Pasienten svarte. Du kan fullføre besøket når du er ferdig.
                  </Alert>
                )}

                {callPrompt && isActive && (
                  <div className="mt-3 p-3 border rounded bg-light">
                    {!isDigital ? (
                      <>
                        <p className="fw-semibold mb-1">
                          {callPrompt.outcome === 'Declined'
                            ? 'Pasienten avviste samtalen.'
                            : callPrompt.outcome === 'Failed'
                              ? 'Teknisk problem under anropet.'
                              : 'Ingen svar fra pasient.'}
                        </p>
                        <p className="text-muted small mb-3">
                          Besøket fortsetter som normalt. Du kan prøve å ringe igjen senere.
                        </p>
                        <Button size="sm" variant="primary" onClick={openCall}>Ring igjen</Button>
                      </>
                    ) : callPrompt.outcome === 'Declined' ? (
                      <>
                        <p className="fw-semibold mb-1">Pasienten avviste samtalen.</p>
                        <p className="text-muted small mb-3">Dette kan ha vært et uhell.</p>
                        <div className="d-flex flex-wrap gap-2">
                          <Button size="sm" variant="primary" onClick={openCall}>Ring igjen</Button>
                          <Button size="sm" variant="outline-secondary" onClick={() => navigate('/appointments')}>
                            Kontakt senere
                          </Button>
                          <Button size="sm" variant="outline-danger" onClick={() => cancelVisit('Pasienten avviste samtalen', '')}>
                            Marker som avvist
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="fw-semibold mb-1">
                          {callPrompt.outcome === 'Failed' ? 'Teknisk problem under anropet.' : 'Ingen svar fra pasient.'}
                        </p>
                        <p className="text-muted small mb-3">
                          Forsøk {callPrompt.attemptCount} av {MAX_CALL_ATTEMPTS} registrert.
                        </p>
                        <div className="d-flex flex-wrap gap-2">
                          <Button size="sm" variant="primary" onClick={openCall}>Ring igjen</Button>
                          <Button
                            size="sm"
                            variant="outline-secondary"
                            onClick={() => cancelVisit('Pasienten var ikke tilgjengelig', '')}
                          >
                            Marker som ikke tilgjengelig
                          </Button>
                          <Button size="sm" variant="outline-danger" onClick={() => setShowCancelModal(true)}>
                            Avslutt besøk
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </SectionCard>
            )}

            <SectionCard
              title="Oppgaver"
              icon="check2-square"
              action={<span className="badge bg-light text-dark border">{completedCount}/{totalTasks}</span>}
            >
              {visit.tasks.length === 0 ? (
                <EmptyState icon="list-check" text="Ingen planlagte oppgaver for dette besøket." />
              ) : (
                <div className="vk-task-list">
                  {visit.tasks.map((task) => {
                    const done = task.status === 'Completed';
                    const skipped = task.status === 'Skipped';
                    return (
                      <div key={task.id} className="vk-task-row">
                        <button
                          type="button"
                          className="vk-task-check"
                          onClick={() => isActive && toggleTask(task)}
                          disabled={!isActive || skipped}
                          aria-label={done ? 'Marker som ikke fullført' : 'Marker som fullført'}
                        >
                          <i className={`bi ${done ? 'bi-check-circle-fill text-success' : 'bi-circle'}`} aria-hidden="true"></i>
                        </button>
                        <div className="flex-grow-1">
                          <span className={done ? 'text-decoration-line-through text-muted' : skipped ? 'text-muted' : ''}>
                            {task.title}
                          </span>
                          {skipped && (
                            <div className="small text-muted">
                              Hoppet over{task.skippedReason ? `: ${task.skippedReason}` : ''}
                            </div>
                          )}
                        </div>
                        {isActive && task.status === 'Pending' && (
                          <Button variant="link" size="sm" className="text-muted p-0 text-decoration-none" onClick={() => handleSkip(task)}>
                            Hopp over
                          </Button>
                        )}
                        {isActive && task.status === 'Skipped' && (
                          <Button variant="link" size="sm" className="text-muted p-0 text-decoration-none" onClick={() => updateTask(task, 'Pending')}>
                            Angre
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {isActive && (
                <Form
                  className="d-flex gap-2 mt-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddTask();
                  }}
                >
                  <Form.Control
                    size="sm"
                    value={newTaskTitle}
                    onChange={(e) => setNewTaskTitle(e.target.value)}
                    placeholder="Legg til oppgave..."
                  />
                  <Button
                    type="submit"
                    size="sm"
                    variant="outline-secondary"
                    className="flex-shrink-0 text-nowrap"
                    disabled={!newTaskTitle.trim()}
                  >
                    <i className="bi bi-plus-lg me-1" aria-hidden="true"></i>Legg til
                  </Button>
                </Form>
              )}
            </SectionCard>

            <SectionCard
              title="Notater fra besøket"
              icon="journal-text"
              action={notesSaving ? <span className="text-muted small">Lagrer...</span> : undefined}
            >
              <Form.Control
                as="textarea"
                rows={5}
                value={notes}
                onChange={(e) => handleNotesChange(e.target.value)}
                onBlur={saveNotes}
                disabled={!isActive}
                placeholder="Skriv observasjoner, hendelser eller meldinger til neste vakt…"
              />
              <div className="d-flex justify-content-between align-items-center mt-2">
                <span className="text-muted small">{notes.length} tegn</span>
                {isActive && (
                  <Button size="sm" variant="outline-secondary" onClick={saveNotesNow} disabled={notesSaving}>
                    Lagre notat
                  </Button>
                )}
              </div>
            </SectionCard>
          </div>
        </Col>
      </Row>

      <CancelVisitModal show={showCancelModal} onClose={() => setShowCancelModal(false)} onConfirm={cancelVisit} />

      <CallModal
        show={showCallModal}
        onHide={handleCallModalHide}
        targetSupabaseProfileId={visit.supabaseProfileId}
        patientId={visit.patientId}
        patientName={visit.patientName}
        visitId={visit.id}
        onOutcome={handleCallOutcome}
      />
    </div>
  );
};

export default VisitExecutionPage;
