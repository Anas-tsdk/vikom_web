import { API_URL } from '../../config/config';
import { getAuthHeader } from '../../auth/AuthService';
import type {
  CallLogDto,
  PatientCreateDto,
  PatientDetailsDto,
  PatientListDto,
  PatientUpdateDto,
} from '../types/patient';

const headers = {
  'Content-Type': 'application/json',
};

// handles API response
async function handleResponse(response: Response) {
  if (!response.ok) {
    throw new Error(await readErrorMessage(response));
  }
  return response.json();
}

// Exported so the Supabase profile lookup reports server messages the same way.
// Validation failures come back either as a plain-text message
// (BadRequest(string)) or as a ModelState object. Both are written for the
// nurse, so pass them through instead of the generic error.
export async function readErrorMessage(response: Response): Promise<string> {
  const fallback = 'Network response was not ok';
  try {
    const body = (await response.text()).trim();
    if (!body) return fallback;
    if (!body.startsWith('{')) return body;

    const parsed = JSON.parse(body);
    const fieldErrors = parsed.errors ? Object.values(parsed.errors).flat() : [];
    return (fieldErrors[0] as string) ?? parsed.title ?? fallback;
  } catch {
    return fallback;
  }
}

// Service object following demo pattern
const PatientService = {
  // fetches all patients (Personnel only - now returns linked patients)
  async getAll(): Promise<PatientListDto[]> {
    const response = await fetch(`${API_URL}/api/patients`, {
      headers: { ...headers, ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  // fetches all patients regardless of links (for admin or linking purposes)
  async getAllPatients(): Promise<PatientListDto[]> {
    const response = await fetch(`${API_URL}/api/patients/all`, {
      headers: { ...headers, ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  async getById(id: string): Promise<PatientDetailsDto> {
    const response = await fetch(`${API_URL}/api/patients/${id}`, {
      headers: { ...headers, ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  // registers a new patient and links them to the logged-in nurse's list
  async create(dto: PatientCreateDto): Promise<PatientDetailsDto> {
    const response = await fetch(`${API_URL}/api/patients`, {
      method: 'POST',
      headers: { ...headers, ...getAuthHeader() },
      body: JSON.stringify(dto),
    });
    return handleResponse(response);
  },

  // updates a patient's contact details, returns the refreshed patient
  async update(id: string, dto: PatientUpdateDto): Promise<PatientDetailsDto> {
    const response = await fetch(`${API_URL}/api/patients/${id}`, {
      method: 'PUT',
      headers: { ...headers, ...getAuthHeader() },
      body: JSON.stringify(dto),
    });
    return handleResponse(response);
  },

  // updates the free-text care note for a patient
  async updateNotes(id: string, notes: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/patients/${id}/notes`, {
      method: 'PUT',
      headers: { ...headers, ...getAuthHeader() },
      body: JSON.stringify({ notes }),
    });
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
  },

  // records a new call to the patient, returns the created log entry
  async createCall(id: string): Promise<CallLogDto> {
    const response = await fetch(`${API_URL}/api/patients/${id}/calls`, {
      method: 'POST',
      headers: { ...headers, ...getAuthHeader() },
    });
    return handleResponse(response);
  },

  // updates the outcome/status of a logged call
  async updateCall(id: string, callId: number, status: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/patients/${id}/calls/${callId}`, {
      method: 'PUT',
      headers: { ...headers, ...getAuthHeader() },
      body: JSON.stringify({ status }),
    });
    if (!response.ok) {
      throw new Error('Network response was not ok');
    }
  },
};

export default PatientService;
