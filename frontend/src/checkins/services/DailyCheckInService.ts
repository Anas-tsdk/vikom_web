import { API_URL } from '../../config/config';
import { getAuthHeader } from '../../auth/AuthService';
import { readErrorMessage } from '../../patients/services/PatientService';

export interface DailyCheckInAlert {
  patientId: string;
  patientName: string;
  phoneNumber: string | null;
  address: string | null;
  lastCheckInAt: string | null;
  missedDays: number;
}

async function ensureSuccess(response: Response): Promise<Response> {
  if (!response.ok) throw new Error(await readErrorMessage(response));
  return response;
}

const DailyCheckInService = {
  async getAlerts(): Promise<DailyCheckInAlert[]> {
    const response = await ensureSuccess(await fetch(`${API_URL}/api/check-ins/alerts`, {
      headers: { ...getAuthHeader() },
    }));
    return response.json();
  },

  async confirmPatientIsOkay(patientId: string): Promise<void> {
    await ensureSuccess(await fetch(
      `${API_URL}/api/check-ins/patients/${encodeURIComponent(patientId)}/confirm`,
      { method: 'POST', headers: { ...getAuthHeader() } }
    ));
    window.dispatchEvent(new Event('vikom-check-in-updated'));
  },
};

export default DailyCheckInService;
