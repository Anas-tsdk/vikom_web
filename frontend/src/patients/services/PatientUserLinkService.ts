import { API_URL } from '../../config/config';
import { getAuthHeader } from '../../auth/AuthService';

const headers = {
  'Content-Type': 'application/json',
};

// handles API response
async function handleResponse(response: Response) {
  if (!response.ok) {
    throw new Error('Network response was not ok');
  }
  return response.json();
}

export interface PatientUserLinkDto {
  id: number;
  patientId: string;
  patientName: string;
  secondaryUserId: string;
  secondaryUserName: string;
  relationshipType: string;
}

export interface CreatePatientUserLinkRequest {
  patientId: string;
  secondaryUserId: string;
  relationshipType: string;
}

// Service object
const PatientUserLinkService = {
  // get all links
  async getAll(): Promise<PatientUserLinkDto[]> {
    const response = await fetch(`${API_URL}/api/patientuserlinks`, {
      headers: { ...headers, ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  // get links by patient
  async getByPatient(patientId: string): Promise<PatientUserLinkDto[]> {
    const response = await fetch(`${API_URL}/api/patientuserlinks/patient/${patientId}`, {
      headers: { ...headers, ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  // get links by secondary user
  async getBySecondaryUser(secondaryUserId: string): Promise<PatientUserLinkDto[]> {
    const response = await fetch(`${API_URL}/api/patientuserlinks/secondary/${secondaryUserId}`, {
      headers: { ...headers, ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  // create link
  async create(request: CreatePatientUserLinkRequest): Promise<PatientUserLinkDto> {
    const response = await fetch(`${API_URL}/api/patientuserlinks`, {
      method: 'POST',
      headers: { ...headers, ...getAuthHeader() },
      body: JSON.stringify(request),
    });
    return handleResponse(response);
  },

  // delete link
  async delete(id: number): Promise<void> {
    const response = await fetch(`${API_URL}/api/patientuserlinks/${id}`, {
      method: 'DELETE',
      headers: { ...headers, ...getAuthHeader() },
    });
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
  },
};

export default PatientUserLinkService;