import React, { useState, useEffect } from 'react';
import { Form, Button, Spinner, Alert } from 'react-bootstrap';
import { getAuthHeader } from '../../auth/AuthService';
import { API_URL } from '../../config/config';
import PatientService from '../../patients/services/PatientService';
import { fetchWeekAvailability } from '../../availability/services/AvailabilityService';
import type { Appointment } from '../types/appointment';
import type { PatientListDto } from '../../patients/types/patient';
import type { AvailabilitySlot, DayAvailability } from '../../availability/types/availability';

interface User {
  id: number;
  personnelId: number;
  fullName: string;
}

// Helper function to fetch personnel
const fetchPersonnel = async (): Promise<User[]> => {
  const response = await fetch(`${API_URL}/api/personnel`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() }
  });
  if (!response.ok) throw new Error('Failed to fetch personnel');
  return response.json();
};

interface AppointmentFormProps {
  initialData?: Appointment;
  onSubmit: (data: Appointment) => void;
  onCancel: () => void;
}

const AppointmentForm: React.FC<AppointmentFormProps> = ({ initialData, onSubmit, onCancel }) => {

  // Mock tasks available for booking, localized to Norwegian
  const allTasks = [
    { id: 'medisin', label: 'Medisin', description: 'Hjelp med medisinering og dosering' },
    { id: 'bading', label: 'Bading', description: 'Hjelp med personlig hygiene og bading' },
    { id: 'matlaging', label: 'Matlaging', description: 'Hjelp med måltider og matlaging' },
    { id: 'handel', label: 'Handel', description: 'Hjelp med å handle mat og nødvendigheter' },
    { id: 'husholdning', label: 'Husholdning', description: 'Lett husarbeid og rengjøring' },
    { id: 'digitalhjelp', label: 'Digital hjelp', description: 'Hjelp med telefon, nettbrett eller PC' },
    { id: 'transport', label: 'Transport', description: 'Støtte til avtaler og ærender' },
  ];

  // Mock permission mapping - which tasks the selected personnel has approved
  const allowedTasksByPersonnel: Record<string, string[]> = {
    // Personnel ID '1' can handle medication and bathing
    '1': ['medisin', 'bading', 'husholdning'],
    // Personnel ID '2' can handle digital help and shopping
    '2': ['digitalhjelp', 'handel', 'transport'],
  };

  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);


  // Form state
  const [formData, setFormData] = useState<Appointment>({
    id: initialData?.id,
    patientId: initialData?.patientId || '',
    availabilityId: initialData?.availabilityId || 0,
    tasks: initialData?.tasks || '',
    startTime: '',
    endTime: '',
    status: 'Booked',
  });

  // When editing an existing appointment, prefill selected tasks based on the stored task string
  useEffect(() => {
    if (!initialData?.tasks) return;

    const taskLabels = initialData.tasks
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    const selectedIds = allTasks
      .filter((task) => taskLabels.includes(task.label))
      .map((task) => task.id);

    setSelectedTaskIds(selectedIds);
  }, [initialData]);

  // Dropdown options
  const [patients, setPatients] = useState<PatientListDto[]>([]);
  const [personnel, setPersonnel] = useState<User[]>([]);
  const [selectedPersonnelId, setSelectedPersonnelId] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [availableDates, setAvailableDates] = useState<string[]>([]);
  const [availableSlots, setAvailableSlots] = useState<AvailabilitySlot[]>([]);
  const [allDaysData, setAllDaysData] = useState<DayAvailability[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [loadingDates, setLoadingDates] = useState<boolean>(false);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Loads initial data on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        
        // Personnel book on the patient's behalf, so the picker is always needed
        const patientList = await PatientService.getAll();
        setPatients(patientList);

        // Loads all personnel for selection
        const personnelList = await fetchPersonnel();
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
    const loadAvailableDates = async () => {
      if (!selectedPersonnelId) {
        setAvailableDates([]);
        setAllDaysData([]);
        return;
      }

      try {
        setLoadingDates(true);
        
        // Fetches next 4 weeks of availability data
        const today = new Date();
        const startDate = today.toISOString().split('T')[0];
        const weekData = await fetchWeekAvailability(selectedPersonnelId, startDate);
        
        // Extracts dates that have available (unbooked) slots
        const datesWithSlots = weekData.days
          .filter(day => {
            // Checks if day has windows with available slots
            const hasAvailableSlots = day.windows.some(window => 
              window.isAvailable && 
              window.slots && 
              window.slots.some(slot => !slot.isBooked)
            );
            return hasAvailableSlots;
          })
          .map(day => day.date);
        
        setAvailableDates(datesWithSlots);
        setAllDaysData(weekData.days);
      } catch {
        setAvailableDates([]);
        setAllDaysData([]);
      } finally {
        setLoadingDates(false);
      }
    };

    loadAvailableDates();
  }, [selectedPersonnelId]);

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
      dayData.windows.forEach(window => {
        if (window.isAvailable && window.slots) {
          const unbookedSlots = window.slots.filter(slot => !slot.isBooked);
          slots.push(...unbookedSlots);
        }
      });

      setAvailableSlots(slots);
    } catch {
      setAvailableSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  }, [selectedDate, allDaysData]);

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

  // Determines which tasks are allowed based on selected personnel
  const allowedTaskIds = selectedPersonnelId && allowedTasksByPersonnel[selectedPersonnelId]
    ? allowedTasksByPersonnel[selectedPersonnelId]
    : allTasks.map((t) => t.id);

  const allowedTasks = allTasks.filter((task) => allowedTaskIds.includes(task.id));

  // Validates form before submission
  const validate = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.patientId) {
      newErrors.patientId = 'Vennligst velg en pasient';
    }

    if (!selectedPersonnelId) {
      newErrors.personnelId = 'Vennligst velg en ansatt';
    }

    if (!selectedDate) {
      newErrors.date = 'Vennligst velg en dato';
    }

    if (!formData.availabilityId || formData.availabilityId === 0) {
      newErrors.availabilityId = 'Vennligst velg et tidspunkt';
    }

    // Validates that at least one task is selected
    if (selectedTaskIds.length === 0) {
      newErrors.tasks = 'Velg minst én oppgave';
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
      .map((id) => allTasks.find((t) => t.id === id)?.label)
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
            <span className="visually-hidden">Laster...</span>
        </Spinner>
      </div>
    );
  }

  return (
    <Form onSubmit={handleSubmit}>
      {/* Patient selection */}
      <Form.Group className="mb-3">
        <Form.Label>Klient <span className="text-danger">*</span></Form.Label>
        {errors.patientId && <div className="text-danger small mb-1">{errors.patientId}</div>}
        <Form.Select
          value={formData.patientId}
          onChange={handlePatientChange}
          isInvalid={!!errors.patientId}
        >
          <option value="">-- Velg pasient --</option>
          {patients.map((patient) => (
            <option key={patient.id} value={patient.id}>
              {patient.fullName}
            </option>
          ))}
        </Form.Select>
      </Form.Group>

      {/* Personnel selection */}
      <Form.Group className="mb-3">
        <Form.Label>Ansatt <span className="text-danger">*</span></Form.Label>
        {errors.personnelId && <div className="text-danger small mb-1">{errors.personnelId}</div>}
        <Form.Select
          value={selectedPersonnelId}
          onChange={handlePersonnelChange}
          isInvalid={!!errors.personnelId}
        >
          <option value="">-- Velg ansatt --</option>
          {personnel.map((person) => (
            <option key={person.id} value={person.id}>
              {person.fullName}
            </option>
          ))}
        </Form.Select>
      </Form.Group>

      {/* Date selection - populated after personnel selection */}
      <Form.Group className="mb-3">
        <Form.Label>Dato <span className="text-danger">*</span></Form.Label>
        {errors.date && <div className="text-danger small mb-1">{errors.date}</div>}
        {loadingDates ? (
          <div className="text-center py-2">
            <Spinner animation="border" size="sm" role="status">
              <span className="visually-hidden">Laster datoer...</span>
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
                  ? '-- Velg Dato --' 
                  : '-- Velg Ansatt --'}
              </option>
              {availableDates.map((date) => (
                <option key={date} value={date}>
                  {new Date(date).toLocaleDateString('nb-NO', { 
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
                  Ingen tilgjengelige datoer for denne ansatte.
              </Form.Text>
            )}
          </>
        )}
      </Form.Group>

      {/* Time slot selection - populated after date selection */}
      <Form.Group className="mb-3">
        <Form.Label>Tidspunkt <span className="text-danger">*</span></Form.Label>
        {errors.availabilityId && <div className="text-danger small mb-1">{errors.availabilityId}</div>}
        {loadingSlots ? (
          <div className="text-center py-2">
            <Spinner animation="border" size="sm" role="status">
              <span className="visually-hidden">Laster tidspunkter...</span>
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
                  ? '-- Velg Tidspunkt --' 
                  : '-- Velg Dato --'}
              </option>
              {availableSlots.map((slot) => (
                <option key={slot.id} value={slot.id}>
                  {slot.startTime} - {slot.endTime}
                </option>
              ))}
            </Form.Select>
            {selectedDate && availableSlots.length === 0 && !loadingSlots && (
              <Form.Text className="text-muted">
                Ingen ledige tidspunkter for denne datoen.
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
            Avtalen er planlagt fra <strong>{selectedSlot.startTime}</strong> til <strong>{selectedSlot.endTime}</strong>
          </small>
        </Alert>
      )}

      {/* Tasks selection (based on what the selected personnel has approved) */}
      <Form.Group className="mb-3">
        <Form.Label>Oppgaver <span className="text-danger">*</span></Form.Label>
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
                    <strong>{task.label}</strong>
                    <div className="text-muted" style={{ fontSize: '0.9rem' }}>{task.description}</div>
                  </div>
                }
                checked={selectedTaskIds.includes(task.id)}
                onChange={(e) => handleTaskToggle(task.id, e.target.checked)}
              />
            ))}
          </div>
        ) : (
          <Form.Text className="text-muted">
            Ingen oppgaver er tilgjengelig for denne ansatte. Velg en annen ansatt for å se tilgjengelige oppgaver.
          </Form.Text>
        )}

        <Form.Text className="text-muted">
          Oppgavene som vises er basert på hva sykepleier har godkjent.
        </Form.Text>
      </Form.Group>

      {/* Buttons */}
      <div className="d-flex gap-2">
        <Button variant="primary" type="submit">
          {initialData ? 'Oppdater' : 'Opprett'}
        </Button>
        <Button variant="outline-secondary" onClick={onCancel}>
          Avbryt
        </Button>
      </div>
    </Form>
  );
};

export default AppointmentForm;
