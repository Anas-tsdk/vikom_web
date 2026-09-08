import { API_URL } from '../../config/config';
import { getAuthHeader } from '../../auth/AuthService';
import type {
  Visit,
  VisitTask,
  VisitTaskStatus,
  VisitCallAttempt,
  VisitSummary,
  VisitType,
} from '../types/visit';

const BASE_URL = `${API_URL}/api/visits`;

const headers = {
  'Content-Type': 'application/json',
};

// Handles API response (mirrors AppointmentService).
async function handleResponse(response: Response) {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Network response was not ok');
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const VisitService = {
  // Start a new visit for an appointment, or return the existing active one.
  startVisit: async (appointmentId: number, visitType: VisitType): Promise<Visit> => {
    const response = await fetch(`${BASE_URL}/start`, {
      method: 'POST',
      headers: { ...headers, ...getAuthHeader() },
      body: JSON.stringify({ appointmentId, visitType }),
    });
    return handleResponse(response);
  },

  getById: async (visitId: number): Promise<Visit> => {
    const response = await fetch(`${BASE_URL}/${visitId}`, {
      headers: { ...headers, ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  // Returns the visit for an appointment, or null when none exists yet.
  getByAppointment: async (appointmentId: number): Promise<Visit | null> => {
    const response = await fetch(`${BASE_URL}/by-appointment/${appointmentId}`, {
      headers: { ...headers, ...getAuthHeader() },
    });
    if (response.status === 404) return null;
    return handleResponse(response);
  },

  getByPatient: async (patientId: string): Promise<VisitSummary[]> => {
    const response = await fetch(`${BASE_URL}/by-patient/${patientId}`, {
      headers: { ...headers, ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  // All documented (terminal) visits for the logged-in nurse — powers the archive.
  getMine: async (): Promise<VisitSummary[]> => {
    const response = await fetch(`${BASE_URL}/mine`, {
      headers: { ...headers, ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  updateNotes: async (visitId: number, notes: string): Promise<Visit> => {
    const response = await fetch(`${BASE_URL}/${visitId}/notes`, {
      method: 'PUT',
      headers: { ...headers, ...getAuthHeader() },
      body: JSON.stringify({ notes }),
    });
    return handleResponse(response);
  },

  addTask: async (visitId: number, title: string): Promise<VisitTask> => {
    const response = await fetch(`${BASE_URL}/${visitId}/tasks`, {
      method: 'POST',
      headers: { ...headers, ...getAuthHeader() },
      body: JSON.stringify({ title }),
    });
    return handleResponse(response);
  },

  updateTask: async (
    visitId: number,
    taskId: number,
    status: VisitTaskStatus,
    skippedReason?: string | null,
  ): Promise<VisitTask> => {
    const response = await fetch(`${BASE_URL}/${visitId}/tasks/${taskId}`, {
      method: 'PUT',
      headers: { ...headers, ...getAuthHeader() },
      body: JSON.stringify({ status, skippedReason: skippedReason ?? null }),
    });
    return handleResponse(response);
  },

  complete: async (
    visitId: number,
    payload: { notes?: string | null; followUpRequired: boolean },
  ): Promise<Visit> => {
    const response = await fetch(`${BASE_URL}/${visitId}/complete`, {
      method: 'POST',
      headers: { ...headers, ...getAuthHeader() },
      body: JSON.stringify(payload),
    });
    return handleResponse(response);
  },

  cancel: async (visitId: number, reason: string, notes?: string | null): Promise<Visit> => {
    const response = await fetch(`${BASE_URL}/${visitId}/cancel`, {
      method: 'POST',
      headers: { ...headers, ...getAuthHeader() },
      body: JSON.stringify({ reason, notes: notes ?? null }),
    });
    return handleResponse(response);
  },

  logCallAttempt: async (
    visitId: number,
    payload: {
      status?: string;
      endedAt?: string | null;
      durationSeconds?: number | null;
      failureReason?: string | null;
    },
  ): Promise<VisitCallAttempt> => {
    const response = await fetch(`${BASE_URL}/${visitId}/call-attempts`, {
      method: 'POST',
      headers: { ...headers, ...getAuthHeader() },
      body: JSON.stringify({ status: 'Initiated', ...payload }),
    });
    return handleResponse(response);
  },
};

export default VisitService;
