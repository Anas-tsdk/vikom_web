import { API_URL } from '../../config/config';
import { getAuthHeader } from '../../auth/AuthService';
import type { Appointment, AppointmentCreateDto } from '../types/appointment';

const BASE_URL = `${API_URL}/api/appointments`;

const headers = {
  'Content-Type': 'application/json',
};

// handles API response
async function handleResponse(response: Response) {
  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || 'Network response was not ok');
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

const AppointmentService = {
  // Get all appointments (role-filtered by backend)
  getAll: async (): Promise<Appointment[]> => {
    const response = await fetch(BASE_URL, {
      headers: { ...headers, ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  // Get appointment by ID
  getById: async (id: number): Promise<Appointment> => {
    const response = await fetch(`${BASE_URL}/${id}`, {
      headers: { ...headers, ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  // Get appointments by patient ID
  getByPatientId: async (patientId: string): Promise<Appointment[]> => {
    const response = await fetch(`${BASE_URL}/patient/${patientId}`, {
      headers: { ...headers, ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  // Get appointments by personnel ID
  getByPersonnelId: async (personnelId: string): Promise<Appointment[]> => {
    const response = await fetch(`${BASE_URL}/personnel/${personnelId}`, {
      headers: { ...headers, ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  // Create new appointment
  create: async (appointment: AppointmentCreateDto): Promise<Appointment> => {
    const response = await fetch(BASE_URL, {
      method: 'POST',
      headers: { ...headers, ...getAuthHeader() },
      body: JSON.stringify(appointment),
    });
    return handleResponse(response);
  },

  // Update existing appointment
  update: async (id: number, appointment: Appointment): Promise<void> => {
    const response = await fetch(`${BASE_URL}/${id}`, {
      method: 'PUT',
      headers: { ...headers, ...getAuthHeader() },
      body: JSON.stringify(appointment),
    });
    return handleResponse(response);
  },

  // Delete appointment
  delete: async (id: number): Promise<void> => {
    const response = await fetch(`${BASE_URL}/${id}`, {
      method: 'DELETE',
      headers: { ...headers, ...getAuthHeader() },
    });
    return handleResponse(response);
  },
};

export default AppointmentService;
