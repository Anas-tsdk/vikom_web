import React, { useState, useEffect, useMemo } from 'react';
import { Form, Button, Spinner, Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import PatientService from '../../patients/services/PatientService';
import PersonnelService, { type NurseSummary } from '../../personnel/services/PersonnelService';
import { fetchWeekAvailability } from '../../availability/services/AvailabilityService';
import AppointmentService from '../services/AppointmentService';
import type { Appointment } from '../types/appointment';
import type { PatientListDto } from '../../patients/types/patient';
import type { DayAvailability, WeekAvailability } from '../../availability/types/availability';
import { localeForLanguage } from '../../i18n';
import { addWeeks, formatDateISO, getMonday } from '../../utils/dateUtils';
import { calculateVisitDurationMinutes, getTaskDurationMinutes, recommendSlots } from '../utils/scheduling';
import { APPOINTMENT_TASKS } from '../utils/taskCatalog';
import './AppointmentForm.css';

interface AppointmentFormProps {
  initialData?: Appointment;
  defaultPersonnelId?: string;
  defaultPatientId?: string;
  lockPatientSelection?: boolean;
  onSubmit: (data: Appointment) => void;
  onCancel: () => void;
}

interface CustomTask {
  id: string;
  name: string;
  durationMinutes: number;
}

const BOOKING_WEEKS = 12;

const AppointmentForm: React.FC<AppointmentFormProps> = ({
  initialData,
  defaultPersonnelId,
  defaultPatientId,
  lockPatientSelection = false,
  onSubmit,
  onCancel,
}) => {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.resolvedLanguage);

  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [customTasks, setCustomTasks] = useState<CustomTask[]>([]);
  const [customTaskName, setCustomTaskName] = useState('');
  const [customTaskDuration, setCustomTaskDuration] = useState('');
  const [slotSelectionTouched, setSlotSelectionTouched] = useState(Boolean(initialData?.id));
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientOptions, setShowPatientOptions] = useState(false);
  const [activePatientIndex, setActivePatientIndex] = useState(0);


  // Form state
  const [formData, setFormData] = useState<Appointment>({
    id: initialData?.id,
    patientId: initialData?.patientId || defaultPatientId || '',
    availabilityId: initialData?.availabilityId || 0,
    tasks: initialData?.tasks || '',
    additionalDurationMinutes: initialData?.additionalDurationMinutes ?? 0,
    startTime: initialData?.startTime || '',
    endTime: initialData?.endTime || '',
    status: initialData?.status || 'Booked',
  });

  // When editing an existing appointment, prefill selected tasks based on the stored task string
  useEffect(() => {
    if (!initialData?.tasks) return;

    const taskLabels = initialData.tasks
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const legacyTaskAliases: Record<string, string> = {
      Medication: 'medisin',
      Bathing: 'bading',
      Matlaging: 'servering',
      Cooking: 'servering',
      'Serving Meals': 'servering',
      'Digital assistance': 'digitalhjelp',
    };

    const selectedIds = APPOINTMENT_TASKS
      .filter((task) =>
        taskLabels.includes(task.label) ||
        taskLabels.some((label) => legacyTaskAliases[label] === task.id),
      )
      .map((task) => task.id);
    const knownLabels = new Set(APPOINTMENT_TASKS.flatMap((task) =>
      [task.label, ...Object.keys(legacyTaskAliases).filter((label) => legacyTaskAliases[label] === task.id)],
    ));
    const legacyTasks = taskLabels
      .filter((label) => !knownLabels.has(label))
      .map((name, index) => ({
        id: `saved-custom-${index}`,
        name,
        durationMinutes: getTaskDurationMinutes(name),
      }));
    setCustomTasks(legacyTasks);
    setSelectedTaskIds([...selectedIds, ...legacyTasks.map((task) => task.id)]);
  }, [initialData]);

  // Dropdown options
  const [patients, setPatients] = useState<PatientListDto[]>([]);
  const [personnel, setPersonnel] = useState<NurseSummary[]>([]);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>(
    initialData?.personnelId || defaultPersonnelId || '',
  );
  const [selectedDate, setSelectedDate] = useState<string>(initialData?.date || '');
  const [allDaysData, setAllDaysData] = useState<DayAvailability[]>([]);
  const [nurseAppointments, setNurseAppointments] = useState<Appointment[]>([]);
  const [patientAppointments, setPatientAppointments] = useState<Appointment[]>([]);
  const [patientAppointmentsLoadedFor, setPatientAppointmentsLoadedFor] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingDates, setLoadingDates] = useState<boolean>(false);
  const [optionsLoadError, setOptionsLoadError] = useState<string>('');
  const [availabilityLoadError, setAvailabilityLoadError] = useState<string>('');
  const [patientAppointmentsLoadError, setPatientAppointmentsLoadError] = useState<string>('');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const currentAppointmentForPersonnel =
    selectedPersonnelId === initialData?.personnelId ? initialData : undefined;
  const selectedPatient = patients.find((patient) => patient.id === formData.patientId);
  useEffect(() => {
    if (selectedPatient) setPatientSearch(selectedPatient.fullName);
  }, [selectedPatient]);

  const filteredPatients = useMemo(() => {
    const query = patientSearch.trim().toLocaleLowerCase(locale);
    return [...patients]
      .filter((patient) => !query || [
        patient.fullName,
        patient.email,
        patient.phoneNumber,
        patient.address,
      ].some((value) => value?.toLocaleLowerCase(locale).includes(query)))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, locale, { sensitivity: 'base' }));
  }, [locale, patientSearch, patients]);
  const selectedTaskLabels = useMemo(
    () => selectedTaskIds.flatMap((id) => {
      const label = APPOINTMENT_TASKS.find((task) => task.id === id)?.label
        ?? customTasks.find((task) => task.id === id)?.name;
      return label ? [label] : [];
    }),
    [customTasks, selectedTaskIds],
  );
  const customTaskDurationMinutes = customTasks
    .filter((task) => selectedTaskIds.includes(task.id))
    .reduce((total, task) =>
      total + (getTaskDurationMinutes(task.name) === 0 ? task.durationMinutes : 0), 0);
  const additionalDurationForScheduling =
    (formData.additionalDurationMinutes ?? 0) + customTaskDurationMinutes;
  const visitDurationMinutes = calculateVisitDurationMinutes(
    selectedTaskLabels,
    additionalDurationForScheduling,
  );
  const patientSchedulingDataReady = !formData.patientId || (
    Boolean(selectedPatient) &&
    patientAppointmentsLoadedFor === formData.patientId &&
    !patientAppointmentsLoadError
  );
  const schedulingDataReady =
    !loadingDates &&
    !availabilityLoadError &&
    patientSchedulingDataReady;
  const recommendedSlots = useMemo(
    () => schedulingDataReady ? recommendSlots(
      allDaysData,
      nurseAppointments,
      patientAppointments,
      selectedPatient,
      selectedTaskLabels,
      additionalDurationForScheduling,
      new Date(),
      currentAppointmentForPersonnel,
      initialData,
    ) : [],
    [
      schedulingDataReady,
      allDaysData,
      nurseAppointments,
      patientAppointments,
      selectedPatient,
      selectedTaskLabels,
      additionalDurationForScheduling,
      currentAppointmentForPersonnel,
      initialData,
    ],
  );
  const availableDates = [...new Set(recommendedSlots.map((slot) => slot.date))];
  const availableSlots = recommendedSlots.filter((slot) => slot.date === selectedDate);
  const recommendedSlot = recommendedSlots[0];

  useEffect(() => {
    if (!schedulingDataReady) return;

    if (recommendedSlots.length === 0) {
      if (formData.availabilityId !== 0 || formData.startTime || formData.endTime) {
        setFormData((previous) => ({
          ...previous,
          availabilityId: 0,
          startTime: '',
          endTime: '',
        }));
      }
      return;
    }

    const selectedSlot = recommendedSlots.find((slot) =>
      slot.date === selectedDate && slot.id === formData.availabilityId,
    );
    if (selectedSlot && slotSelectionTouched) {
      if (formData.endTime !== selectedSlot.endTime) {
        setFormData((previous) => ({
          ...previous,
          startTime: selectedSlot.startTime,
          endTime: selectedSlot.endTime,
        }));
      }
      return;
    }

    const nextSlot = slotSelectionTouched
      ? recommendedSlots.find((slot) => slot.date === selectedDate) ?? recommendedSlot
      : recommendedSlot;
    if (!nextSlot) return;
    if (selectedDate !== nextSlot.date) setSelectedDate(nextSlot.date);
    setFormData((previous) => ({
      ...previous,
      availabilityId: nextSlot.id,
      startTime: nextSlot.startTime,
      endTime: nextSlot.endTime,
    }));
  }, [
    recommendedSlots,
    recommendedSlot,
    selectedDate,
    formData.availabilityId,
    formData.startTime,
    formData.endTime,
    slotSelectionTouched,
    schedulingDataReady,
  ]);

  useEffect(() => {
    if (!initialData?.id && defaultPersonnelId) setSelectedPersonnelId(defaultPersonnelId);
  }, [defaultPersonnelId, initialData?.id]);

  // Loads initial data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Personnel book on the patient's behalf, so the picker is always needed
        const patientList = await PatientService.getAll();
        setPatients(patientList);

        // Loads all personnel for selection
        const personnelList = await PersonnelService.getAll();
        setPersonnel(personnelList);
      } catch {
        setOptionsLoadError(t('Kunne ikke laste planleggingsdata. Prøv igjen.'));
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [t]);

  // Loads available dates when personnel is selected
  useEffect(() => {
    let active = true;
    const loadAvailableDates = async () => {
      if (!selectedPersonnelId) {
        setAllDaysData([]);
        setNurseAppointments([]);
        return;
      }

      try {
        setLoadingDates(true);
        
        // Fetch the configured booking horizon. Each request also materializes
        // recurring weekly rules into real, bookable database slots.
        const monday = getMonday(new Date());
        const weeksPromise = (async () => {
          const weeks: WeekAvailability[] = [];
          for (let offset = 0; offset < BOOKING_WEEKS; offset += 1) {
            weeks.push(await fetchWeekAvailability(
              selectedPersonnelId,
              formatDateISO(addWeeks(monday, offset)),
            ));
          }
          return weeks;
        })();
        const appointmentsPromise = AppointmentService.getByPersonnelId(selectedPersonnelId);
        // Reading a week also materializes its recurring schedule into SQLite.
        // Keep these requests sequential so a newly registered nurse's first
        // booking load cannot race concurrent database writes.
        const [weeks, appointments] = await Promise.all([weeksPromise, appointmentsPromise]);
        const allDays = weeks.flatMap((week) => week.days);
        if (!active) return;
        setAllDaysData(allDays);
        setNurseAppointments(appointments);
        setAvailabilityLoadError('');
      } catch {
        if (active) {
          setAllDaysData([]);
          setNurseAppointments([]);
          setAvailabilityLoadError(t('Kunne ikke laste planleggingsdata. Prøv igjen.'));
        }
      } finally {
        if (active) setLoadingDates(false);
      }
    };

    void loadAvailableDates();
    return () => { active = false; };
  }, [currentAppointmentForPersonnel, initialData, selectedPersonnelId, t]);

  useEffect(() => {
    let active = true;
    if (!formData.patientId) {
      setPatientAppointments([]);
      setPatientAppointmentsLoadedFor(null);
      return () => { active = false; };
    }

    setPatientAppointmentsLoadedFor(null);
    AppointmentService.getByPatientId(formData.patientId)
      .then((appointments) => {
        if (active) {
          setPatientAppointments(appointments);
          setPatientAppointmentsLoadedFor(formData.patientId);
          setPatientAppointmentsLoadError('');
        }
      })
      .catch(() => {
        if (active) {
          setPatientAppointments([]);
          setPatientAppointmentsLoadedFor(null);
          setPatientAppointmentsLoadError(t('Kunne ikke laste planleggingsdata. Prøv igjen.'));
        }
      });

    return () => { active = false; };
  }, [formData.patientId, t]);

  // Handles personnel selection
  const handlePersonnelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const personnelId = e.target.value;
    setSelectedPersonnelId(personnelId);

    // Reset dependent fields when personnel changes
    setSelectedDate('');
    setSlotSelectionTouched(false);
    setAllDaysData([]);
    setNurseAppointments([]);
    setFormData(prev => ({ ...prev, availabilityId: 0 }));

    if (errors.personnelId || errors.date || errors.availabilityId || errors.tasks) {
      setErrors(prev => ({ 
        ...prev, 
        personnelId: '', 
        date: '', 
        availabilityId: '',
        tasks: ''
      }));
    }
  };

  // Handles date selection
  const handleDateChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const date = e.target.value;
    setSelectedDate(date);
    setSlotSelectionTouched(true);
    // Resets slot selection when date changes
    setFormData(prev => ({ ...prev, availabilityId: 0 }));
    if (errors.date || errors.availabilityId) {
      setErrors(prev => ({ ...prev, date: '', availabilityId: '' }));
    }
  };

  // Handles time slot selection
  const handleSlotChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const slotId = Number(e.target.value);
    const slot = availableSlots.find((candidate) => candidate.id === slotId);
    setSlotSelectionTouched(true);
    setFormData((prev) => ({
      ...prev,
      availabilityId: slotId,
      startTime: slot?.startTime ?? prev.startTime,
      endTime: slot?.endTime ?? prev.endTime,
    }));
    if (errors.availabilityId) {
      setErrors(prev => ({ ...prev, availabilityId: '' }));
    }
  };

  // Handles toggling task checkboxes
  const handleTaskToggle = (taskId: string, checked: boolean) => {
    setSelectedTaskIds((prev) =>
      checked ? [...prev, taskId] : prev.filter((id) => id !== taskId)
    );

    if (errors.tasks) {
      setErrors((prev) => ({ ...prev, tasks: '' }));
    }
  };

  const addCustomTask = () => {
    const name = customTaskName.trim();
    const durationMinutes = Number(customTaskDuration);
    if (!name || !Number.isInteger(durationMinutes) || durationMinutes < 1) {
      setErrors((previous) => ({
        ...previous,
        customTask: t('Enter a task name and a duration of at least one minute.'),
      }));
      return;
    }
    if (
      getTaskDurationMinutes(name) > 0 ||
      customTasks.some((task) => task.name.toLocaleLowerCase() === name.toLocaleLowerCase())
    ) {
      setErrors((previous) => ({
        ...previous,
        customTask: t('Custom task names must be unique and cannot match a standard task.'),
      }));
      return;
    }

    const task = { id: `custom-${crypto.randomUUID()}`, name, durationMinutes };
    setCustomTasks((previous) => [...previous, task]);
    setSelectedTaskIds((previous) => [...previous, task.id]);
    setCustomTaskName('');
    setCustomTaskDuration('');
    setErrors((previous) => ({ ...previous, customTask: '' }));
  };

  // Handles patient selection
  const handlePatientChange = (patientId: string) => {
    if (patientId === formData.patientId) return;
    setFormData((previous) => ({ ...previous, patientId }));
    setPatientAppointments([]);
    setPatientAppointmentsLoadedFor(null);
    setSlotSelectionTouched(false);
    if (errors.patientId) {
      setErrors(prev => ({ ...prev, patientId: '' }));
    }
  };

  const selectPatient = (patient: PatientListDto) => {
    handlePatientChange(patient.id);
    setPatientSearch(patient.fullName);
    setShowPatientOptions(false);
    setActivePatientIndex(0);
  };

  const handlePatientSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setShowPatientOptions(false);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      setShowPatientOptions(true);
      setActivePatientIndex((index) => Math.max(0, Math.min(index + 1, filteredPatients.length - 1)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActivePatientIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && showPatientOptions) {
      event.preventDefault();
      const patient = filteredPatients[activePatientIndex];
      if (patient) selectPatient(patient);
    }
  };

  const handleAdditionalDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const value = rawValue === '' ? undefined : Number(rawValue);
    setFormData((previous) => ({
      ...previous,
      additionalDurationMinutes: value !== undefined && Number.isFinite(value) ? value : undefined,
    }));
  };

  // Gets selected slot details for display
  const selectedSlot = availableSlots.find(slot => slot.id === formData.availabilityId);

  // Capability data is not part of the current personnel API, so every real
  // task is offered. The previous numeric-ID mock silently mismatched Identity
  // GUIDs and gave a false impression that permissions were enforced.
  const allowedTasks = APPOINTMENT_TASKS;

  // Validates form before submission
  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.patientId) {
      newErrors.patientId = t('Vennligst velg en pasient');
    }

    if (!selectedPersonnelId) {
      newErrors.personnelId = t('Vennligst velg en ansatt');
    }

    if (!selectedDate) {
      newErrors.date = t('Vennligst velg en dato');
    }

    if (
      !formData.availabilityId ||
      formData.availabilityId === 0 ||
      !availableSlots.some((slot) => slot.id === formData.availabilityId)
    ) {
      newErrors.availabilityId = t('Vennligst velg et tidspunkt');
    }

    // Validates that at least one task is selected
    if (selectedTaskIds.length === 0) {
      newErrors.tasks = t('Velg minst én oppgave');
    }

    const additionalDuration = formData.additionalDurationMinutes ?? 0;
    if (!Number.isInteger(additionalDuration) || additionalDuration < 0) {
      newErrors.additionalDurationMinutes = t('Ekstra minutter må være et heltall på minst 0.');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) {
      return;
    }

    // Convert selected task IDs back into a comma-separated string for backend
    const selectedTaskLabels = selectedTaskIds
      .map((id) => APPOINTMENT_TASKS.find((task) => task.id === id)?.label
        ?? customTasks.find((task) => task.id === id)?.name)
      .filter(Boolean);
    const selectedSlot = availableSlots.find((slot) => slot.id === formData.availabilityId);
    if (!selectedSlot) return;

    onSubmit({
      ...formData,
      tasks: selectedTaskLabels.join(', '),
      additionalDurationMinutes: additionalDurationForScheduling,
      startTime: selectedSlot.startTime,
      endTime: selectedSlot.endTime,
    });
  };

  if (loading) {
    return (
      <div className="text-center py-4">
        <Spinner animation="border" role="status">
            <span className="visually-hidden">{t('Laster...')}</span>
        </Spinner>
      </div>
    );
  }

  return (
    <Form onSubmit={handleSubmit}>
      {(optionsLoadError || availabilityLoadError || patientAppointmentsLoadError) && (
        <Alert variant="danger">
          {optionsLoadError || availabilityLoadError || patientAppointmentsLoadError}
        </Alert>
      )}

      {initialData?.declinedSlotDate && (
        <Alert variant="warning" className="mb-3">
          <div className="fw-semibold">{t('Opprinnelig avslått tidspunkt')}</div>
          <div>
            {initialData.declinedSlotDate} · {initialData.declinedSlotStartTime}–{initialData.declinedSlotEndTime}
          </div>
          <small>{t('Dette tidspunktet kan ikke brukes igjen for denne pasienten.')}</small>
        </Alert>
      )}

      {/* Patient search and selection */}
      <Form.Group className="mb-3">
        <Form.Label>{t('Klient')} <span className="text-danger">*</span></Form.Label>
        {errors.patientId && <div className="text-danger small mb-1">{errors.patientId}</div>}
        <div className="patient-picker">
          <Form.Control
            type="search"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={showPatientOptions}
            aria-controls="appointment-patient-options"
            aria-activedescendant={
              showPatientOptions && filteredPatients[activePatientIndex]
                ? `appointment-patient-option-${filteredPatients[activePatientIndex].id}`
                : undefined
            }
            placeholder={t("Begin typing a patient's name, email or address")}
            value={patientSearch}
            onFocus={() => setShowPatientOptions(true)}
            onBlur={() => setShowPatientOptions(false)}
            onChange={(event) => {
              const value = event.target.value;
              setPatientSearch(value);
              setShowPatientOptions(true);
              setActivePatientIndex(0);
              if (formData.patientId) handlePatientChange('');
            }}
            onKeyDown={handlePatientSearchKeyDown}
            isInvalid={!!errors.patientId}
            disabled={Boolean(initialData?.id) || lockPatientSelection}
            autoComplete="off"
          />
          {showPatientOptions && !initialData?.id && !lockPatientSelection && (
            <div
              id="appointment-patient-options"
              className="patient-picker-options"
              role="listbox"
            >
              {filteredPatients.length > 0 ? filteredPatients.map((patient, index) => (
                <div
                  id={`appointment-patient-option-${patient.id}`}
                  role="option"
                  aria-selected={patient.id === formData.patientId}
                  className={`patient-picker-option${index === activePatientIndex ? ' active' : ''}`}
                  key={patient.id}
                  tabIndex={-1}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActivePatientIndex(index)}
                  onClick={() => selectPatient(patient)}
                >
                  <span className="d-block fw-semibold">{patient.fullName}</span>
                  {patient.email && <span className="d-block small text-muted">{patient.email}</span>}
                </div>
              )) : (
                <div className="patient-picker-empty">{t('Ingen pasienter samsvarer med søket.')}</div>
              )}
            </div>
          )}
        </div>
      </Form.Group>

      {/* Personnel selection */}
      <Form.Group className="mb-3">
        <Form.Label>{t('Ansatt')} <span className="text-danger">*</span></Form.Label>
        {errors.personnelId && <div className="text-danger small mb-1">{errors.personnelId}</div>}
        <Form.Select
          value={selectedPersonnelId}
          onChange={handlePersonnelChange}
          isInvalid={!!errors.personnelId}
        >
          <option value="">{t('-- Velg ansatt --')}</option>
          {personnel.map((person) => (
            <option key={person.id} value={person.id}>
              {person.fullName}{person.role === 'HeadNurse' ? ` · ${t('Ledende sykepleier')}` : ''}
            </option>
          ))}
        </Form.Select>
      </Form.Group>

      {/* Date selection - populated after personnel selection */}
      <Form.Group className="mb-3">
        <Form.Label>{t('Dato')} <span className="text-danger">*</span></Form.Label>
        {errors.date && <div className="text-danger small mb-1">{errors.date}</div>}
        {loadingDates ? (
          <div className="text-center py-2">
            <Spinner animation="border" size="sm" role="status">
              <span className="visually-hidden">{t('Laster datoer...')}</span>
            </Spinner>
          </div>
        ) : (
          <>
            <Form.Select
              value={selectedDate}
              onChange={handleDateChange}
              isInvalid={!!errors.date}
              disabled={!selectedPersonnelId}
            >
              <option value="">
                {selectedPersonnelId 
                  ? t('-- Velg Dato --')
                  : t('-- Velg Ansatt --')}
              </option>
              {availableDates.map((date) => (
                <option key={date} value={date}>
                  {date === recommendedSlot?.date ? `${t('Anbefalt')}: ` : ''}
                  {new Date(date).toLocaleDateString(locale, {
                    weekday: 'short', 
                    day: '2-digit', 
                    month: 'short', 
                    year: 'numeric' 
                  })}
                </option>
              ))}
            </Form.Select>
            {selectedPersonnelId && availableDates.length === 0 && !loadingDates && (
              <Form.Text className="text-muted">
                  {t('Ingen tilgjengelige datoer for denne ansatte.')}
              </Form.Text>
            )}
            {recommendedSlot && (
              <Form.Text className="d-block">
                {t('Anbefalt tidspunkt: {{date}} kl. {{start}}', {
                  date: new Date(recommendedSlot.date).toLocaleDateString(locale),
                  start: recommendedSlot.startTime,
                })}
              </Form.Text>
            )}
          </>
        )}
      </Form.Group>

      {/* Time slot selection - populated after date selection */}
      <Form.Group className="mb-3">
        <Form.Label>{t('Tidspunkt')} <span className="text-danger">*</span></Form.Label>
        {errors.availabilityId && <div className="text-danger small mb-1">{errors.availabilityId}</div>}
        <Form.Select
          value={formData.availabilityId}
          onChange={handleSlotChange}
          isInvalid={!!errors.availabilityId}
          disabled={!selectedDate || loadingDates}
        >
          <option value="0">
            {selectedDate
              ? t('-- Velg Tidspunkt --')
              : t('-- Velg Dato --')}
          </option>
          {availableSlots.map((slot) => (
            <option key={slot.id} value={slot.id}>
              {slot.startTime} - {slot.endTime}
              {slot.id === recommendedSlot?.id && slot.date === recommendedSlot.date
                ? ` · ${t('Anbefalt')}`
                : ''}
            </option>
          ))}
        </Form.Select>
        {selectedDate && availableSlots.length === 0 && !loadingDates && (
          <Form.Text className="text-muted">
            {t('Ingen ledige tidspunkter for denne datoen.')}
          </Form.Text>
        )}
      </Form.Group>

      {/* Display selected slot time info */}
      {selectedSlot && (
        <Alert variant="info" className="mb-3">
          <small>
            <i className="bi bi-info-circle me-2"></i>
            {t('Avtalen er planlagt fra {{start}} til {{end}}', {
              start: selectedSlot.startTime,
              end: selectedSlot.endTime,
            })}
          </small>
          <ul className="small mb-0 mt-2 ps-4">
            <li>{t('The system recommends the earliest suitable available time based on the nurse schedule, visit duration, existing appointments, and travel time.')}</li>
            <li>{t('Each selected task adds its estimated time. Additional minutes are added to the task time, along with a 10-minute visit buffer.')}</li>
            <li>{t('Estimated driving time is reserved between consecutive appointments using patient addresses. If coordinates are missing, a 25-minute estimate is used.')}</li>
          </ul>
        </Alert>
      )}

      {/* Tasks included in this appointment. */}
      <Form.Group className="mb-3">
        <Form.Label>{t('Oppgaver')} <span className="text-danger">*</span></Form.Label>
        {errors.tasks && <div className="text-danger small mb-1">{errors.tasks}</div>}

        {allowedTasks.length > 0 ? (
          <div className="task-checkboxes">
            {allowedTasks.map((task) => (
              <Form.Check
                key={task.id}
                type="checkbox"
                id={`task-${task.id}`}
                label={
                  <div>
                    <strong>{t(task.label)}</strong>
                    <div className="text-muted" style={{ fontSize: '0.9rem' }}>
                      {t(task.description)} · +{getTaskDurationMinutes(task.label)} min
                    </div>
                  </div>
                }
                checked={selectedTaskIds.includes(task.id)}
                onChange={(e) => handleTaskToggle(task.id, e.target.checked)}
              />
            ))}
            {customTasks.map((task) => (
              <div className="d-flex align-items-center gap-2" key={task.id}>
                <Form.Check
                  type="checkbox"
                  id={`task-${task.id}`}
                  label={`${task.name} · +${task.durationMinutes} min`}
                  checked={selectedTaskIds.includes(task.id)}
                  onChange={(event) => handleTaskToggle(task.id, event.target.checked)}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline-danger"
                  aria-label={t('Remove custom task')}
                  onClick={() => {
                    setCustomTasks((previous) => previous.filter((item) => item.id !== task.id));
                    setSelectedTaskIds((previous) => previous.filter((id) => id !== task.id));
                  }}
                >
                  <i className="bi bi-x-lg" aria-hidden="true" />
                </Button>
              </div>
            ))}
          </div>
        ) : null}
        <div className="row g-2 mt-2">
          <div className="col-md-6">
            <Form.Control
              aria-label={t('Custom task name')}
              placeholder={t('Custom task name')}
              value={customTaskName}
              onChange={(event) => setCustomTaskName(event.target.value)}
            />
          </div>
          <div className="col-md-3">
            <Form.Control
              aria-label={t('Duration in minutes')}
              type="number"
              min={1}
              step={1}
              placeholder={t('Minutes')}
              value={customTaskDuration}
              onChange={(event) => setCustomTaskDuration(event.target.value)}
            />
          </div>
          <div className="col-md-3">
            <Button type="button" variant="outline-primary" className="w-100" onClick={addCustomTask}>
              {t('Add task')}
            </Button>
          </div>
        </div>
        {errors.customTask && <div className="text-danger small mt-1">{errors.customTask}</div>}
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label>{t('Ekstra minutter')}</Form.Label>
        {errors.additionalDurationMinutes && (
          <div className="text-danger small mb-1">{errors.additionalDurationMinutes}</div>
        )}
        <Form.Control
          type="number"
          min={0}
          step={5}
          placeholder="0"
          value={formData.additionalDurationMinutes || ''}
          onChange={handleAdditionalDurationChange}
        />
        <Form.Text>
          {t('Planned visit duration: {{minutes}} minutes, including the 10-minute visit buffer.', {
            minutes: visitDurationMinutes,
          })}
        </Form.Text>
      </Form.Group>

      {/* Buttons */}
      <div className="d-flex gap-2">
        <Button
          variant="primary"
          type="submit"
          disabled={!schedulingDataReady || !selectedSlot}
        >
          {initialData ? t('Oppdater') : t('Opprett')}
        </Button>
        <Button variant="outline-secondary" type="button" onClick={onCancel}>
          {t('Avbryt')}
        </Button>
      </div>
    </Form>
  );
};

export default AppointmentForm;
