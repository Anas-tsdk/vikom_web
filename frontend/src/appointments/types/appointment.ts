// Appointment model based on backend.DTOs.AppointmentDto
export interface Appointment {
  id?: number;
  patientId: string;
  patientName?: string;
  patientAddress?: string;
  patientAccessInstructions?: string | null;
  patientMedicationEquipmentNotes?: string | null;
  patientLatitude?: number | null;
  patientLongitude?: number | null;
  availabilityId: number;
  personnelId?: string;
  personnelName?: string;
  date?: string;
  availabilityNotes?: string;
  additionalDurationMinutes?: number;
  // Stores comma-separated list of tasks (e.g., "Medication, Vitals, Exercises")
  tasks: string;
  startTime: string; // TimeSpan represented as string "HH:mm:ss" or "HH:mm"
  endTime: string;
  status: 'Booked' | 'InProgress' | 'Completed' | 'NotCompleted' | 'Cancelled';
  patientResponseStatus?: 'Pending' | 'Accepted' | 'Declined';
  patientRespondedAt?: string | null;
  patientProposedDate?: string | null;
  patientProposedStartTime?: string | null;
  patientProposedEndTime?: string | null;
  /** Form-only snapshot used to prevent choosing a time the patient already declined. */
  declinedSlotDate?: string;
  declinedSlotStartTime?: string;
  declinedSlotEndTime?: string;
  patientSupabaseProfileId?: string | null;
  // Summary of the actual visit for this appointment, if one was started.
  visitId?: number | null;
  visitStatus?: 'Active' | 'Completed' | 'Incomplete' | 'Cancelled' | null;
  visitType?: 'Physical' | 'Digital' | null;
}

// Appointment create DTO
export interface AppointmentCreateDto {
  patientId?: string;
  availabilityId: number;
  // Stores comma-separated list of tasks (e.g., "Medication, Vitals, Exercises")
  tasks: string;
  additionalDurationMinutes?: number;
  startTime: string;
  endTime: string;
  status?: string;
}

// Appointment summary for dashboard display
export interface AppointmentSummary {
  id: number;
  patientName: string;
  patientId?: string;
  patientUsername?: string | null;
  patientAddress?: string | null;
  patientAccessInstructions?: string | null;
  patientMedicationEquipmentNotes?: string | null;
  personnelId?: string;
  personnelName: string;
  // Stores comma-separated list of tasks (e.g., "Medication, Vitals, Exercises")
  tasks: string;
  date: string; // ISO date string
  startTime: string;
  endTime: string;
  status: string;
  patientResponseStatus?: 'Pending' | 'Accepted' | 'Declined';
  patientRespondedAt?: string | null;
  patientProposedDate?: string | null;
  patientProposedStartTime?: string | null;
  patientProposedEndTime?: string | null;
  formattedDateTime?: string;
  availabilityNotes?: string;
  visitId?: number | null;
  visitStatus?: string | null;
  visitType?: string | null;
}
