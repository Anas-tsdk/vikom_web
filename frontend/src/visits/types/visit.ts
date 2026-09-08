import type { PatientClinical } from '../../patients/types/patient';

export type { PatientClinical };

export type VisitType = 'Physical' | 'Digital';
export type VisitStatus = 'Active' | 'Completed' | 'Incomplete' | 'Cancelled';
export type VisitTaskStatus = 'Pending' | 'Completed' | 'Skipped';

export interface VisitTask {
  id: number;
  visitId: number;
  title: string;
  category?: string | null;
  status: VisitTaskStatus;
  skippedReason?: string | null;
  completedAt?: string | null;
}

/** One digital call attempt within a visit (backend CallLogDto shape). */
export interface VisitCallAttempt {
  id: number;
  patientId: string;
  personnelId: string;
  personnelName: string;
  startedAt: string;
  status: string; // Initiated | Answered | Declined | Ended | Missed | Failed
  visitId?: number | null;
  appointmentId?: number | null;
  attemptNumber?: number | null;
  endedAt?: string | null;
  durationSeconds?: number | null;
  failureReason?: string | null;
}

export interface Visit {
  id: number;
  appointmentId: number;
  patientId: string;
  patientName: string;
  patientAddress?: string | null;
  patientPhone?: string | null;
  supabaseProfileId?: string | null;
  responsibleUserId: string;
  responsibleUserName: string;
  visitType: VisitType;
  status: VisitStatus;
  startedAt: string;
  endedAt?: string | null;
  completedAt?: string | null;
  notes?: string | null;
  followUpRequired: boolean;
  outcomeReason?: string | null;
  date?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  tasks: VisitTask[];
  callAttempts: VisitCallAttempt[];
  patientClinical: PatientClinical;
}

/** Compact visit info used in lists/history. */
export interface VisitSummary {
  id: number;
  appointmentId: number;
  patientId: string;
  patientName: string;
  date?: string | null;
  startTime?: string | null;
  visitType: VisitType;
  status: VisitStatus;
  startedAt: string;
  endedAt?: string | null;
  completedAt?: string | null;
  outcomeReason?: string | null;
  callAttemptCount: number;
  lastCallAttemptAt?: string | null;
}
