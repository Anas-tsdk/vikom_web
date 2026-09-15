import React, { useState, useEffect } from 'react';
import { Form, Button, Spinner, Alert } from 'react-bootstrap';
import { useTranslation } from 'react-i18next';
import PatientService from '../../patients/services/PatientService';
import PersonnelService, { type NurseSummary } from '../../personnel/services/PersonnelService';
import { fetchWeekAvailability } from '../../availability/services/AvailabilityService';
import type { Appointment } from '../types/appointment';
import type { PatientListDto } from '../../patients/types/patient';
import type { AvailabilitySlot, DayAvailability, WeekAvailability } from '../../availability/types/availability';
import { localeForLanguage } from '../../i18n';
import { addWeeks, formatDateISO, getMonday } from '../../utils/dateUtils';

interface AppointmentFormProps {
  initialData?: Appointment;
  defaultPersonnelId?: string;
  onSubmit: (data: Appointment) => void;
  onCancel: () => void;
}

const ALL_TASKS = [
  { id: 'medisin', label: 'Medisin', description: 'Hjelp med medisinering og dosering' },
  { id: 'bading', label: 'Bading', description: 'Hjelp med personlig hygiene og bading' },
  { id: 'matlaging', label: 'Matlaging', description: 'Hjelp med måltider og matlaging' },
  { id: 'handel', label: 'Handel', description: 'Hjelp med å handle mat og nødvendigheter' },
  { id: 'husholdning', label: 'Husholdning', description: 'Lett husarbeid og rengjøring' },
  { id: 'digitalhjelp', label: 'Digital hjelp', description: 'Hjelp med telefon, nettbrett eller PC' },
  { id: 'transport', label: 'Transport', description: 'Støtte til avtaler og ærender' },
] as const;

const BOOKING_WEEKS = 12;

const slotStartTimestamp = (date: string, time: string): number | null => {
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute, second = 0] = time.split(':').map(Number);
  if (![year, month, day, hour, minute, second].every(Number.isFinite)) return null;

  const value = new Date(year, month - 1, day, hour, minute, second).getTime();
  return Number.isNaN(value) ? null : value;
};

const isSelectableSlot = (
  date: string,
  slot: AvailabilitySlot,
  currentAppointment: Appointment | undefined,
  declinedAppointment: Appointment | undefined,
  now: Date,
): boolean => {
  const declinedStart = declinedAppointment?.declinedSlotStartTime?.slice(0, 5);
  const declinedEnd = declinedAppointment?.declinedSlotEndTime?.slice(0, 5);
  const isDeclinedTime =
    declinedAppointment?.declinedSlotDate === date &&
    !!declinedStart &&
    !!declinedEnd &&
    slot.startTime.slice(0, 5) < declinedEnd &&
    declinedStart < slot.endTime.slice(0, 5);
  if (isDeclinedTime) return false;

  const isCurrentAppointmentSlot =
    currentAppointment?.date === date && currentAppointment.availabilityId === slot.id;
  if (isCurrentAppointmentSlot) return true;
  if (slot.isBooked) return false;

  const startsAt = slotStartTimestamp(date, slot.startTime);
  // Mirrors the backend rule: a new booking must start strictly after now.
  return startsAt !== null && startsAt > now.getTime();
};

const AppointmentForm: React.FC<AppointmentFormProps> = ({ initialData, defaultPersonnelId, onSubmit, onCancel }) => {
  const { t, i18n } = useTranslation();
  const locale = localeForLanguage(i18n.resolvedLanguage);

  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);


  // Form state
  const [formData, setFormData] = useState<Appointment>({
    id: initialData?.id,
    patientId: initialData?.patientId || '',
    availabilityId: initialData?.availabilityId || 0,
    tasks: initialData?.tasks || '',
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

    const selectedIds = ALL_TASKS
      .filter((task) => taskLabels.includes(task.label))
      .map((task) => task.id);

    setSelectedTaskIds(selectedIds);
  }, [initialData]);

  // Dropdown options
  const [patients, setPatients] = useState<PatientListDto[]>([]);
  const [personnel, setPersonnel] = useState<NurseSummary[]>([]);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>(
    initialData?.personnelId || defaultPersonnelId || '',
  );
  const [selectedDate, setSelectedDate] = useState<string>(initialData?.date || '');
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([]);
  const [allDaysData, setAllDaysData] = useState<DayAvailability[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingDates, setLoadingDates] = useState<boolean>(false);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const currentAppointmentForPersonnel =
    selectedPersonnelId === initialData?.personnelId ? initialData : undefined;

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
        // Failed to load form data
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Loads available dates when personnel is selected
  useEffect(() => {
    let active = true;
    const loadAvailableDates = async () => {
      if (!selectedPersonnelId) {
        setAvailableDates([]);
        setAllDaysData([]);
        return;
      }

      try {
        setLoadingDates(true);
        
        // Fetch the configured booking horizon. Each request also materializes
        // recurring weekly rules into real, bookable database slots.
        const monday = getMonday(new Date());
        const weeks: WeekAvailability[] = [];
        // Reading a week also materializes its recurring schedule into SQLite.
        // Keep these requests sequential so a newly registered nurse's first
        // booking load cannot race concurrent database writes.
        for (let offset = 0; offset < BOOKING_WEEKS; offset += 1) {
          weeks.push(await fetchWeekAvailability(
            selectedPersonnelId,
            formatDateISO(addWeeks(monday, offset)),
          ));
        }
        const allDays = weeks.flatMap((week) => week.days);
        const now = new Date();
        const todayIso = formatDateISO(now);
        
        // Extracts dates that have available (unbooked) slots
        const datesWithSlots = allDays
          .filter(day => {
            // Checks if day has windows with available slots
            const hasAvailableSlots = day.windows.some(window =>
              window.isAvailable &&
              window.slots &&
              window.slots.some(slot =>
                isSelectableSlot(day.date, slot, currentAppointmentForPersonnel, initialData, now))
            );
            const isCurrentAppointmentDate = currentAppointmentForPersonnel?.date === day.date;
            return isCurrentAppointmentDate || (day.date >= todayIso && hasAvailableSlots);
          })
          .map(day => day.date);
        
        if (!active) return;
        setAvailableDates(datesWithSlots);
        setAllDaysData(allDays);
      } catch {
        if (active) {
          setAvailableDates([]);
          setAllDaysData([]);
        }
      } finally {
        if (active) setLoadingDates(false);
      }
    };

    void loadAvailableDates();
    return () => { active = false; };
  }, [currentAppointmentForPersonnel, initialData, selectedPersonnelId]);

  // Loads available time slots when date is selected
  useEffect(() => {
    if (!selectedDate || allDaysData.length === 0) {
      setAvailableSlots([]);
      return;
    }

    try {
      setLoadingSlots(true);
      
      // Finds the day data for selected date
      const dayData = allDaysData.find(day => day.date === selectedDate);
      if (!dayData) {
        setAvailableSlots([]);
        return;
      }

      // Extracts all unbooked slots from available windows
      const slots: AvailabilitySlot[] = [];
      const now = new Date();
      dayData.windows.forEach(window => {
        if (window.isAvailable && window.slots) {
          const selectableSlots = window.slots.filter((slot) =>
            isSelectableSlot(selectedDate, slot, currentAppointmentForPersonnel, initialData, now));
          slots.push(...selectableSlots);
        }
      });

      if (currentAppointmentForPersonnel?.availabilityId &&
          currentAppointmentForPersonnel.date === selectedDate &&
          !slots.some((slot) => slot.id === currentAppointmentForPersonnel.availabilityId)) {
        slots.push({
          id: currentAppointmentForPersonnel.availabilityId,
          startTime: currentAppointmentForPersonnel.startTime,
          endTime: currentAppointmentForPersonnel.endTime,
          isBooked: true,
        });
      }

      setAvailableSlots(slots);
    } catch {
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [currentAppointmentForPersonnel, initialData, selectedDate, allDaysData]);

  // Handles personnel selection
  const handlePersonnelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const personnelId = e.target.value;
    setSelectedPersonnelId(personnelId);

    // Reset dependent fields when personnel changes
    setSelectedDate('');
    setFormData(prev => ({ ...prev, availabilityId: 0, tasks: '' }));
    setSelectedTaskIds([]);

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
    // Resets slot selection when date changes
    setFormData(prev => ({ ...prev, availabilityId: 0 }));
    if (errors.date || errors.availabilityId) {
      setErrors(prev => ({ ...prev, date: '', availabilityId: '' }));
    }
  };

  // Handles time slot selection
  const handleSlotChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const slotId = Number(e.target.value);
    setFormData(prev => ({ ...prev, availabilityId: slotId }));
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

  // Handles patient selection
  const handlePatientChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = e.target;
    setFormData(prev => ({ ...prev, patientId: value }));
    if (errors.patientId) {
      setErrors(prev => ({ ...prev, patientId: '' }));
    }
  };

  // Gets selected slot details for display
  const selectedSlot = availableSlots.find(slot => slot.id === formData.availabilityId);

  // Capability data is not part of the current personnel API, so every real
  // task is offered. The previous numeric-ID mock silently mismatched Identity
  // GUIDs and gave a false impression that permissions were enforced.
  const allowedTasks = ALL_TASKS;

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

    if (!formData.availabilityId || formData.availabilityId === 0) {
      newErrors.availabilityId = t('Vennligst velg et tidspunkt');
    }

    // Validates that at least one task is selected
    if (selectedTaskIds.length === 0) {
      newErrors.tasks = t('Velg minst én oppgave');
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
      .map((id) => ALL_TASKS.find((task) => task.id === id)?.label)
      .filter(Boolean);

    onSubmit({
      ...formData,
      tasks: selectedTaskLabels.join(', '),
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
      {initialData?.declinedSlotDate && (
        <Alert variant="warning" className="mb-3">
          <div className="fw-semibold">{t('Opprinnelig avslått tidspunkt')}</div>
          <div>
            {initialData.declinedSlotDate} · {initialData.declinedSlotStartTime}–{initialData.declinedSlotEndTime}
          </div>
          <small>{t('Dette tidspunktet kan ikke brukes igjen for denne pasienten.')}</small>
        </Alert>
      )}

      {/* Patient selection */}
      <Form.Group className="mb-3">
        <Form.Label>{t('Klient')} <span className="text-danger">*</span></Form.Label>
        {errors.patientId && <div className="text-danger small mb-1">{errors.patientId}</div>}
        <Form.Select
          value={formData.patientId}
          onChange={handlePatientChange}
          isInvalid={!!errors.patientId}
          disabled={Boolean(initialData?.id)}
        >
          <option value="">{t('-- Velg pasient --')}</option>
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.fullName}
            </option>
          ))}
        </Form.Select>
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
          </>
        )}
      </Form.Group>

      {/* Time slot selection - populated after date selection */}
      <Form.Group className="mb-3">
        <Form.Label>{t('Tidspunkt')} <span className="text-danger">*</span></Form.Label>
        {errors.availabilityId && <div className="text-danger small mb-1">{errors.availabilityId}</div>}
        {loadingSlots ? (
          <div className="text-center py-2">
            <Spinner animation="border" size="sm" role="status">
              <span className="visually-hidden">{t('Laster tidspunkter...')}</span>
            </Spinner>
          </div>
        ) : (
          <>
            <Form.Select
              value={formData.availabilityId}
              onChange={handleSlotChange}
              isInvalid={!!errors.availabilityId}
              disabled={!selectedDate}
            >
              <option value="0">
                {selectedDate 
                  ? t('-- Velg Tidspunkt --')
                  : t('-- Velg Dato --')}
              </option>
              {availableSlots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.startTime} - {slot.endTime}
                </option>
              ))}
            </Form.Select>
            {selectedDate && availableSlots.length === 0 && !loadingSlots && (
              <Form.Text className="text-muted">
                {t('Ingen ledige tidspunkter for denne datoen.')}
              </Form.Text>
            )}
          </>
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
                    <div className="text-muted" style={{ fontSize: '0.9rem' }}>{t(task.description)}</div>
                  </div>
                }
                checked={selectedTaskIds.includes(task.id)}
                onChange={(e) => handleTaskToggle(task.id, e.target.checked)}
              />
            ))}
          </div>
        ) : null}
      </Form.Group>

      {/* Buttons */}
      <div className="d-flex gap-2">
        <Button variant="primary" type="submit">
          {initialData ? t('Oppdater') : t('Opprett')}
        </Button>
        <Button variant="outline-secondary" onClick={onCancel}>
          {t('Avbryt')}
        </Button>
      </div>
    </Form>
  );
};

export default AppointmentForm;
