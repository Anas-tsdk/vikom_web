import type { AppointmentSummary } from '../../appointments/types/appointment';

// Patient list item for table display
export interface PatientListDto {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  address: string;
  supabaseProfileId?: string | null;
  username?: string | null;
  totalAppointments: number;
  lastAppointmentDate: string;
}

// A single logged call to a patient's TV profile
export interface CallLogDto {
  id: number;
  patientId: string;
  personnelId: string;
  personnelName: string;
  startedAt: string; // ISO date-time string
  status: string; // "Initiated" | "Answered" | "Declined" | "Ended" | "Missed"
}

// A single current medication (name + dosage + schedule)
export interface Medication {
  name: string;
  dosage?: string | null;
  schedule?: string | null;
}

// Read-only clinical profile shown on the visit workspace and patient page
export interface PatientClinical {
  dateOfBirth?: string | null;
  nextOfKinName?: string | null;
  nextOfKinRelation?: string | null;
  generalPractitioner?: string | null;
  allergies?: string | null;
  diagnoses: string[];
  medications: Medication[];
  conditionFlags: string[];
  treatmentPlan?: string | null;
}

// Patient details with appointments
export interface PatientDetailsDto {
  id: string;
  fullName: string;
  email: string;
  phoneNumber: string;
  address?: string;
  supabaseProfileId?: string | null;
  username?: string | null;
  totalAppointments: number;
  lastAppointmentDate: string;
  notes?: string | null;
  notesUpdatedAt?: string | null;
  upcomingAppointments: AppointmentSummary[];
  pastAppointments: AppointmentSummary[];
  recentCalls: CallLogDto[];
  clinical: PatientClinical;
}

// Payload for updating a patient's contact details and Supabase (TV) link.
// Note there is no profileUsername: `username` on the details DTO is the local
// URL handle, and linking or unlinking a TV account must never rewrite it.
export interface PatientUpdateDto {
  fullName: string;
  email: string;
  phoneNumber?: string | null;
  address?: string;
  supabaseProfileId?: string | null;
}

// Payload for registering a new patient from the portal. supabaseProfileId
// is what lets the patient use the TV app; it is optional so a patient can be
// linked later. New patients get no URL handle and are addressed by their GUID.
export interface PatientCreateDto {
  fullName: string;
  email: string;
  phoneNumber?: string | null;
  address?: string;
  supabaseProfileId?: string | null;
}
