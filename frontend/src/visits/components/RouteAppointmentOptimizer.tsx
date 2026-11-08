import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Form, Modal, Spinner } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import AppointmentService from '../../appointments/services/AppointmentService';
import { APPOINTMENT_TASKS } from '../../appointments/utils/taskCatalog';
import { getTaskDurationMinutes } from '../../appointments/utils/scheduling';
import type { Appointment } from '../../appointments/types/appointment';
import PatientService from '../../patients/services/PatientService';
import type { PatientListDto } from '../../patients/types/patient';
import { fetchDayAvailability } from '../../availability/services/AvailabilityService';
import type { DayAvailability } from '../../availability/types/availability';
import { translateApiMessage } from '../../i18n';

interface RouteAppointmentOptimizerProps {
  show: boolean;
  personnelId: string;
  date: string;
  appointments: Appointment[];
  onHide: () => void;
  onSaved: () => void;
}

interface CustomTask {
  name: string;
  durationMinutes: number;
}

interface PatientPlan {
  patient: PatientListDto;
  taskIds: string[];
  customTasks: CustomTask[];
  customName: string;
  customDuration: string;
  fixedSlotId: string;
}

interface RouteSlot {
  id: number;
  startTime: string;
  windowEndTime: string;
}

interface ProposedVisit {
  patient: PatientListDto;
  availabilityId: number;
  startTime: string;
  endTime: string;
  tasks: string;
  additionalDurationMinutes: number;
  isFixed: boolean;
}

const minutesOf = (time: string): number => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

const formatTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const distanceKm = (first: PatientListDto, second: PatientListDto): number | null => {
  if (
    typeof first.latitude !== 'number' || typeof first.longitude !== 'number' ||
    typeof second.latitude !== 'number' || typeof second.longitude !== 'number'
  ) return null;
  const radians = (value: number) => value * Math.PI / 180;
  const latitudeDelta = radians(second.latitude - first.latitude);
  const longitudeDelta = radians(second.longitude - first.longitude);
  const h =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(first.latitude)) * Math.cos(radians(second.latitude)) *
    Math.sin(longitudeDelta / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
};

const travelMinutes = (first: PatientListDto, second: PatientListDto): number => {
  const distance = distanceKm(first, second);
  return distance === null ? 25 : Math.ceil(distance * 1.35 / 30 * 60 * 1.25 + 5);
};

const RouteAppointmentOptimizer: React.FC<RouteAppointmentOptimizerProps> = ({
  show,
  personnelId,
  date,
  appointments,
  onHide,
  onSaved,
}) => {
  const { t } = useTranslation();
  const [routeDate, setRouteDate] = useState(date);
  const [patients, setPatients] = useState<PatientListDto[]>([]);
  const [day, setDay] = useState<DayAvailability | null>(null);
  const [plans, setPlans] = useState<PatientPlan[]>([]);
  const [search, setSearch] = useState('');
  const [proposal, setProposal] = useState<ProposedVisit[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [savedCount, setSavedCount] = useState(0);

  useEffect(() => {
    if (!show) return;
    let active = true;
    setLoading(true);
    setError('');
    setProposal([]);
    setDay(null);
    setSavedCount(0);
    if (!routeDate) return;
    Promise.all([PatientService.getAll(), fetchDayAvailability(personnelId, routeDate)])
      .then(([patientData, dayData]) => {
        if (!active) return;
        const alreadyScheduled = new Set(appointments
          .filter((appointment) =>
            appointment.date === routeDate && appointment.status !== 'Cancelled')
          .map((appointment) => appointment.patientId));
        setPatients(patientData.filter((patient) => !alreadyScheduled.has(patient.id)));
        setDay(dayData);
        setPlans([]);
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(translateApiMessage(
            t,
            loadError instanceof Error ? loadError.message : 'Kunne ikke laste planleggingsdata. Prøv igjen.',
          ));
        }
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [appointments, date, personnelId, routeDate, show, t]);

  useEffect(() => {
    if (show) setRouteDate(date || new Date().toISOString().slice(0, 10));
  }, [date, show]);

  const freeSlots = useMemo<RouteSlot[]>(() => (day?.windows ?? [])
    .filter((window) => window.isAvailable)
    .flatMap((window) => (window.slots ?? [])
      .filter((slot) => !slot.isBooked)
      .map((slot) => ({
        id: slot.id,
        startTime: slot.startTime,
        windowEndTime: window.endTime,
      })))
    .sort((a, b) => a.startTime.localeCompare(b.startTime)), [day]);

  const filteredPatients = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return patients.filter((patient) =>
      !query || [patient.fullName, patient.address, patient.phoneNumber]
        .some((value) => value?.toLocaleLowerCase().includes(query)),
    );
  }, [patients, search]);

  const addPatient = (patient: PatientListDto) => {
    setPlans((current) => current.some((plan) => plan.patient.id === patient.id)
      ? current
      : [...current, {
        patient,
        taskIds: [APPOINTMENT_TASKS[0].id],
        customTasks: [],
        customName: '',
        customDuration: '',
        fixedSlotId: '',
      }]);
    setProposal([]);
    setSearch('');
  };

  const updatePlan = (patientId: string, change: (plan: PatientPlan) => PatientPlan) => {
    setPlans((current) => current.map((plan) =>
      plan.patient.id === patientId ? change(plan) : plan,
    ));
    setProposal([]);
  };

  const addCustomTask = (plan: PatientPlan) => {
    const name = plan.customName.trim();
    const durationMinutes = Number(plan.customDuration);
    if (!name || !Number.isInteger(durationMinutes) || durationMinutes < 1) {
      setError(t('Enter a task name and a duration of at least one minute.'));
      return;
    }
    if (
      getTaskDurationMinutes(name) > 0 ||
      plan.customTasks.some((task) => task.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    ) {
      setError(t('Custom task names must be unique and cannot match a standard task.'));
      return;
    }
    updatePlan(plan.patient.id, (current) => ({
      ...current,
      customTasks: [...current.customTasks, { name, durationMinutes }],
      customName: '',
      customDuration: '',
    }));
    setError('');
  };

  const generateProposal = (optimizedOrder?: string[]) => {
    setError('');
    if (plans.length === 0 || !day) {
      setError(t('Select at least one patient.'));
      return;
    }
    const patientWithoutTasks = plans.find((plan) =>
      plan.taskIds.length === 0 && plan.customTasks.length === 0);
    if (patientWithoutTasks) {
      setError(t('Select at least one task for {{name}}.', { name: patientWithoutTasks.patient.fullName }));
      return;
    }

    const proposals: ProposedVisit[] = [];
    const busy = appointments
      .filter((appointment) => appointment.date === routeDate && appointment.status !== 'Cancelled')
      .map((appointment) => ({
        patient: patients.find((patient) => patient.id === appointment.patientId) ?? {
          id: appointment.patientId,
          fullName: appointment.patientName ?? '',
          address: appointment.patientAddress ?? '',
          email: '',
          phoneNumber: '',
          latitude: appointment.patientLatitude,
          longitude: appointment.patientLongitude,
          totalAppointments: 0,
          lastAppointmentDate: '',
        },
        start: minutesOf(appointment.startTime),
        end: minutesOf(appointment.endTime),
      }))
      .filter((item) => Number.isFinite(item.start) && Number.isFinite(item.end));

    const visitDetails = new Map(plans.map((plan) => {
      const taskLabels = [
        ...APPOINTMENT_TASKS
          .filter((task) => plan.taskIds.includes(task.id))
          .map((task) => task.label),
        ...plan.customTasks.map((task) => task.name),
      ];
      const additionalDurationMinutes = plan.customTasks
        .reduce((total, task) => total + task.durationMinutes, 0);
      const durationMinutes = 10 +
        taskLabels.reduce((total, task) => total + getTaskDurationMinutes(task), 0) +
        additionalDurationMinutes;
      return [plan.patient.id, { taskLabels, additionalDurationMinutes, durationMinutes }] as const;
    }));

    const fixedPlans = plans.filter((plan) => plan.fixedSlotId);
    const optimizedPlans = plans.filter((plan) => !plan.fixedSlotId);
    const selectedSlotIds = new Set<number>();
    for (const plan of fixedPlans) {
      const slot = freeSlots.find((candidate) => candidate.id === Number(plan.fixedSlotId));
      const details = visitDetails.get(plan.patient.id);
      if (!slot || !details) {
        setError(t('A manually fixed time is no longer available.'));
        return;
      }
      const start = minutesOf(slot.startTime);
      const end = start + details.durationMinutes;
      const previous = [...busy]
        .filter((item) => item.end <= start)
        .sort((a, b) => b.end - a.end)[0];
      const next = [...busy]
        .filter((item) => item.start >= end)
        .sort((a, b) => a.start - b.start)[0];
      if (
        end > minutesOf(slot.windowEndTime) ||
        selectedSlotIds.has(slot.id) ||
        busy.some((item) => item.start < end && start < item.end) ||
        previous && start - previous.end < travelMinutes(previous.patient, plan.patient) ||
        next && next.start - end < travelMinutes(plan.patient, next.patient)
      ) {
        setError(t('The fixed times conflict with one another or exceed availability.'));
        return;
      }
      selectedSlotIds.add(slot.id);
      proposals.push({
        patient: plan.patient,
        availabilityId: slot.id,
        startTime: slot.startTime,
        endTime: formatTime(end),
        tasks: details.taskLabels.join(', '),
        additionalDurationMinutes: details.additionalDurationMinutes,
        isFixed: true,
      });
      busy.push({ patient: plan.patient, start, end });
    }

    let remaining = optimizedOrder
      ? optimizedOrder.flatMap((id) => optimizedPlans.filter((plan) => plan.patient.id === id))
      : [...optimizedPlans];
    if (!optimizedOrder) {
      const lastVisit = [...busy].sort((a, b) => a.start - b.start).at(-1)?.patient;
      const ordered: PatientPlan[] = [];
      let from = lastVisit;
      while (remaining.length > 0) {
        const nextIndex = from
          ? remaining.reduce((bestIndex, plan, index) => {
            const bestDistance = distanceKm(from!, remaining[bestIndex].patient) ?? Number.POSITIVE_INFINITY;
            const candidateDistance = distanceKm(from!, plan.patient) ?? Number.POSITIVE_INFINITY;
            return candidateDistance < bestDistance ? index : bestIndex;
          }, 0)
          : remaining.reduce((bestIndex, plan, index) =>
            plan.patient.fullName.localeCompare(remaining[bestIndex].patient.fullName) < 0
              ? index
              : bestIndex, 0);
        const [next] = remaining.splice(nextIndex, 1);
        ordered.push(next);
        from = next.patient;
      }
      remaining = ordered;
    }

    for (const plan of remaining) {
      const details = visitDetails.get(plan.patient.id);
      if (!details) continue;
      const choices = freeSlots
        .filter((slot) => !selectedSlotIds.has(slot.id))
        .flatMap((slot) => {
          const start = minutesOf(slot.startTime);
          const end = start + details.durationMinutes;
          if (end > minutesOf(slot.windowEndTime)) return [];
          const previous = [...busy]
            .filter((item) => item.end <= start)
            .sort((a, b) => b.end - a.end)[0];
          const next = [...busy]
            .filter((item) => item.start >= end)
            .sort((a, b) => a.start - b.start)[0];
          if (busy.some((item) => item.start < end && start < item.end)) return [];
          if (previous && start - previous.end < travelMinutes(previous.patient, plan.patient)) return [];
          if (next && next.start - end < travelMinutes(plan.patient, next.patient)) return [];
          const distanceScore =
            (previous ? distanceKm(previous.patient, plan.patient) ?? 1000 : 0) +
            (next ? distanceKm(plan.patient, next.patient) ?? 1000 : 0);
          return [{ slot, start, end, score: distanceScore + start / 100000 }];
        })
        .sort((a, b) => a.score - b.score || a.start - b.start);
      const choice = choices[0];
      if (!choice) {
        setError(t('No suitable time is available for {{name}}.', { name: plan.patient.fullName }));
        return;
      }
      selectedSlotIds.add(choice.slot.id);
      busy.push({ patient: plan.patient, start: choice.start, end: choice.end });
      proposals.push({
        patient: plan.patient,
        availabilityId: choice.slot.id,
        startTime: choice.slot.startTime,
        endTime: formatTime(choice.end),
        tasks: details.taskLabels.join(', '),
        additionalDurationMinutes: details.additionalDurationMinutes,
        isFixed: false,
      });
    }

    setProposal(proposals.sort((a, b) => a.startTime.localeCompare(b.startTime)));
  };

  const moveProposal = (patientId: string, direction: -1 | 1) => {
    const order = proposal.filter((visit) => !visit.isFixed).map((visit) => visit.patient.id);
    const index = order.indexOf(patientId);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= order.length) return;
    [order[index], order[nextIndex]] = [order[nextIndex], order[index]];
    generateProposal(order);
  };

  const saveProposal = async () => {
    setSaving(true);
    setError('');
    setSavedCount(0);
    try {
      for (const visit of proposal) {
        await AppointmentService.create({
          patientId: visit.patient.id,
          availabilityId: visit.availabilityId,
          tasks: visit.tasks,
          additionalDurationMinutes: visit.additionalDurationMinutes,
          startTime: visit.startTime,
          endTime: visit.endTime,
        });
        setSavedCount((count) => count + 1);
      }
      onSaved();
      onHide();
    } catch (saveError: unknown) {
      setError(translateApiMessage(
        t,
        saveError instanceof Error ? saveError.message : 'Kunne ikke lagre avtalen',
      ));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal show={show} onHide={onHide} centered size="xl">
      <Modal.Header closeButton>
        <Modal.Title>{t('Optimize daily route')}</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {error && <Alert variant="danger">{error}{savedCount > 0 ? ` (${t('Saved {{count}} appointments before the error.', { count: savedCount })})` : ''}</Alert>}
        {loading ? (
          <div className="text-center py-4"><Spinner animation="border" /></div>
        ) : (
          <>
            <Form.Group className="mb-3">
            <Form.Label>{t('Date')}</Form.Label>
            <Form.Control type="date" value={routeDate} onChange={(event) => {
              setRouteDate(event.target.value);
              setPlans([]);
              setProposal([]);
            }} />
            </Form.Group>
            <p className="text-muted">{t('Select patients for this nurse and day. Existing appointments and manually fixed times remain locked.')}</p>
            <Form.Group className="mb-3">
              <Form.Label>{t('Search patient')}</Form.Label>
              <Form.Control type="search" value={search} onChange={(event) => setSearch(event.target.value)} />
              {search && (
                <div className="list-group mt-1 route-optimizer-search-results">
                  {filteredPatients.slice(0, 8).map((patient) => (
                    <button className="list-group-item list-group-item-action" type="button" key={patient.id} onClick={() => addPatient(patient)}>
                      {patient.fullName}{patient.address ? ` · ${patient.address}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </Form.Group>

            {plans.length > 0 && (
              <div className="route-optimizer-patients">
                {plans.map((plan) => (
                  <section className="route-optimizer-patient" key={plan.patient.id}>
                    <header className="d-flex justify-content-between align-items-start gap-2">
                      <div><strong>{plan.patient.fullName}</strong>{plan.patient.address && <div className="small text-muted">{plan.patient.address}</div>}</div>
                      <Button size="sm" variant="outline-danger" onClick={() => {
                        setPlans((current) => current.filter((item) => item.patient.id !== plan.patient.id));
                        setProposal([]);
                      }}>{t('Remove')}</Button>
                    </header>
                    <div className="route-optimizer-task-list">
                      {APPOINTMENT_TASKS.map((task) => (
                        <Form.Check
                          key={task.id}
                          inline
                          type="checkbox"
                          id={`route-${plan.patient.id}-${task.id}`}
                          label={`${t(task.label)} (+${getTaskDurationMinutes(task.label)} min)`}
                          checked={plan.taskIds.includes(task.id)}
                          onChange={(event) => updatePlan(plan.patient.id, (current) => ({
                            ...current,
                            taskIds: event.target.checked
                              ? [...current.taskIds, task.id]
                              : current.taskIds.filter((id) => id !== task.id),
                          }))}
                        />
                      ))}
                    </div>
                    <div className="row g-2 align-items-center mt-1">
                      <div className="col-md-4">
                        <Form.Control
                          aria-label={t('Custom task name')}
                          placeholder={t('Custom task name')}
                          value={plan.customName}
                          onChange={(event) => updatePlan(plan.patient.id, (current) => ({ ...current, customName: event.target.value }))}
                        />
                      </div>
                      <div className="col-md-2">
                        <Form.Control
                          aria-label={t('Duration in minutes')}
                          type="number"
                          min={1}
                          step={1}
                          placeholder={t('Minutes')}
                          value={plan.customDuration}
                          onChange={(event) => updatePlan(plan.patient.id, (current) => ({ ...current, customDuration: event.target.value }))}
                        />
                      </div>
                      <div className="col-md-2">
                        <Button type="button" variant="outline-primary" onClick={() => addCustomTask(plan)}>{t('Add task')}</Button>
                      </div>
                      <div className="col-md-4">
                        <Form.Select
                          aria-label={t('Manually fix appointment time')}
                          value={plan.fixedSlotId}
                          onChange={(event) => updatePlan(plan.patient.id, (current) => ({ ...current, fixedSlotId: event.target.value }))}
                        >
                          <option value="">{t('Optimize time automatically')}</option>
                          {freeSlots.map((slot) => (
                            <option key={slot.id} value={slot.id}>{slot.startTime}</option>
                          ))}
                        </Form.Select>
                      </div>
                    </div>
                    {plan.customTasks.length > 0 && (
                      <div className="small mt-2">
                        {plan.customTasks.map((task, index) => (
                          <span className="badge text-bg-light me-1" key={`${task.name}-${index}`}>
                            {task.name} · {task.durationMinutes} min
                            <button
                              type="button"
                              className="btn-close ms-2"
                              aria-label={t('Remove custom task')}
                              onClick={() => updatePlan(plan.patient.id, (current) => ({
                                ...current,
                                customTasks: current.customTasks.filter((_, taskIndex) => taskIndex !== index),
                              }))}
                            />
                          </span>
                        ))}
                      </div>
                    )}
                  </section>
                ))}
              </div>
            )}

            {proposal.length > 0 && (
              <section className="mt-4">
                <h6>{t('Review proposed route')}</h6>
                <ol className="list-group list-group-numbered">
                  {proposal.map((visit, index) => (
                    <li className="list-group-item d-flex justify-content-between align-items-center gap-2" key={visit.patient.id}>
                      <span>
                        <strong>{visit.startTime}–{visit.endTime} · {visit.patient.fullName}</strong>
                        <span className="d-block small text-muted">{visit.tasks}{visit.isFixed ? ` · ${t('Fixed')}` : ''}</span>
                      </span>
                      {!visit.isFixed && (
                        <span className="d-flex gap-1">
                          <Button size="sm" variant="outline-secondary" aria-label={t('Move up')} disabled={index === 0} onClick={() => moveProposal(visit.patient.id, -1)}><i className="bi bi-arrow-up" /></Button>
                          <Button size="sm" variant="outline-secondary" aria-label={t('Move down')} disabled={index === proposal.length - 1} onClick={() => moveProposal(visit.patient.id, 1)}><i className="bi bi-arrow-down" /></Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="outline-secondary" onClick={onHide} disabled={saving}>{t('Cancel')}</Button>
        <Button variant="outline-primary" onClick={() => generateProposal()} disabled={loading || plans.length === 0}>
          <i className="bi bi-calculator me-2" aria-hidden="true"></i>{t('Calculate')}
        </Button>
        <Button variant="primary" onClick={saveProposal} disabled={saving || proposal.length === 0}>
          {saving ? <Spinner size="sm" animation="border" className="me-2" /> : <i className="bi bi-check2 me-2" aria-hidden="true" />}
          {t('Save appointments')}
        </Button>
      </Modal.Footer>
    </Modal>
  );
};

export default RouteAppointmentOptimizer;
