// Appointment model based on backend.DTOs.AppointmentDto
export interface Appointment {
  id?: number;
  patientId: string;
  patientName?: string;
  patientAddress?: string;
  availabilityId: number;
  personnelId?: string;
  personnelName?: string;
  date?: string;
  availabilityNotes?: string;
  // Stores comma-separated list of tasks (e.g., "Medication, Vitals, Exercises")
  tasks: string;
  startTime: string; // TimeSpan represented as string "HH:mm:ss" or "HH:mm"
  endTime: string;
  status: 'Booked' | 'InProgress' | 'Completed' | 'NotCompleted' | 'Cancelled';
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
  startTime: string;
  endTime: string;
  status?: string;
}

// Appointment summary for dashboard display
export interface AppointmentSummary {
  id: number;
  patientName: string;
  personnelName: string;
  // Stores comma-separated list of tasks (e.g., "Medication, Vitals, Exercises")
  tasks: string;
  date: string; // ISO date string
  startTime: string;
  endTime: string;
  status: string;
  formattedDateTime?: string;
  availabilityNotes?: string;
  visitId?: number | null;
  visitStatus?: string | null;
  visitType?: string | null;
}
