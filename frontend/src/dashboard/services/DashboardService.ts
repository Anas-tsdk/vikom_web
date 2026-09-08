import { API_URL } from "../../config/config";
import { getAuthHeader } from '../../auth/AuthService';
import type { PersonnelViewModel } from '../types/dashboard';

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

// fetches personnel dashboard data
export async function fetchPersonnelDashboard(): Promise<PersonnelViewModel> {
  const response = await fetch(`${API_URL}/api/dashboard/personnel`, {
    headers: { ...headers, ...getAuthHeader() },
  });
  return handleResponse(response);
}
