import { getAuthHeader } from '../../auth/AuthService';
import { API_URL } from '../../config/config';

export interface NurseSummary {
  id: string;
  userName: string;
  email: string;
  fullName: string;
  role: 'HeadNurse' | 'Nurse' | 'Personnel';
  phoneNumber?: string | null;
  address?: string | null;
}

export interface PersonnelScheduleOption {
  id: string;
  fullName: string;
}

export interface PersonnelCallOption {
  id: string;
  fullName: string;
  role: 'HeadNurse' | 'Nurse' | 'Personnel';
}

export interface CreateNurseRequest {
  userName: string;
  email: string;
  password: string;
  fullName: string;
  role: 'HeadNurse' | 'Nurse';
  phoneNumber?: string;
  address?: string;
}

const PersonnelService = {
  getAll: async (): Promise<NurseSummary[]> => {
    const response = await fetch(`${API_URL}/api/personnel`, {
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    });
    if (!response.ok) throw new Error('Kunne ikke laste sykepleiere');
    return response.json();
  },

  getScheduleOptions: async (): Promise<PersonnelScheduleOption[]> => {
    const response = await fetch(`${API_URL}/api/personnel/schedule-options`, {
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    });
    if (!response.ok) throw new Error('Kunne ikke laste sykepleiere');
    return response.json();
  },

  getCallOptions: async (): Promise<PersonnelCallOption[]> => {
    const response = await fetch(`${API_URL}/api/personnel/call-options`, {
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    });
    if (!response.ok) throw new Error('Kunne ikke laste sykepleiere');
    return response.json();
  },

  create: async (request: CreateNurseRequest): Promise<NurseSummary> => {
    const response = await fetch(`${API_URL}/api/personnel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(request),
    });
    if (!response.ok) {
      const body: unknown = await response.json().catch(() => null);
      const topLevelErrors = Array.isArray(body)
        ? body.map((error) => (
            error && typeof error === 'object' && 'description' in error
              ? String(error.description)
              : ''
          )).filter(Boolean)
        : [];
      const objectBody = body && typeof body === 'object' && !Array.isArray(body) ? body as {
        message?: string;
        errors?: Array<{ description?: string }> | Record<string, string[]>;
      } : null;
      const nestedErrors = Array.isArray(objectBody?.errors)
        ? objectBody.errors.map((error) => error.description).filter(Boolean)
        : objectBody?.errors
          ? Object.values(objectBody.errors).flat()
          : [];
      throw new Error(
        objectBody?.message
        || [...topLevelErrors, ...nestedErrors].join(', ')
        || 'Kunne ikke registrere sykepleieren',
      );
    }
    return response.json();
  },
};

export default PersonnelService;
