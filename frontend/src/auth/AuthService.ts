import { API_URL } from '../config/config';
import type { LoginDto, RegisterDto } from '../types';

export interface UserInfo {
  userName: string;
  fullName: string;
  role: string;
  userId: string;
}

interface SessionResponse extends UserInfo {
  token: string;
}

let refreshPromise: Promise<void> | null = null;

// stores JWT token in localStorage
export function setToken(token: string): void {
  localStorage.setItem('jwt', token);
}

// retrieves JWT token from localStorage
export function getToken(): string | null {
  return localStorage.getItem('jwt');
}

// stores user info in localStorage
export function setUserInfo(userInfo: UserInfo): void {
  localStorage.setItem('userInfo', JSON.stringify(userInfo));
}

// retrieves user info from localStorage
export function getUserInfo(): UserInfo | null {
  const userInfo = localStorage.getItem('userInfo');
  if (!userInfo) return null;
  
  try {
    return JSON.parse(userInfo);
  } catch {
    localStorage.removeItem('userInfo');
    return null;
  }
}
// removes JWT token and user info from localStorage
export function logout(): void {
  localStorage.removeItem('jwt');
  localStorage.removeItem('userInfo');
}

// checks if user is currently authenticated
export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;

  try {
    const payloadPart = token.split('.')[1];
    if (!payloadPart) throw new Error('Invalid JWT');

    const base64 = payloadPart.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const payload = JSON.parse(atob(padded)) as { exp?: number };

    if (typeof payload.exp !== 'number' || payload.exp <= Date.now() / 1000) {
      logout();
      return false;
    }

    return true;
  } catch {
    // The backend always issues a JWT. Treat malformed stored values as an
    // expired session instead of leaving every API request failing with 401.
    logout();
    return false;
  }
}

const storeSession = (data: SessionResponse): void => {
  setToken(data.token);
  setUserInfo({
    userName: data.userName,
    fullName: data.fullName,
    role: data.role,
    userId: data.userId,
  });
};

/**
 * Refreshes browser session metadata from the authoritative user record.
 * This transparently upgrades older Personnel sessions after the nurse-role
 * migration, so Nora receives the Head Nurse UI without clearing storage by
 * hand. A temporary network/server error leaves the valid local session alone.
 */
export function refreshSession(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  const token = getToken();
  if (!token) return Promise.resolve();

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: getAuthHeader(),
      });

      if (response.status === 401 || response.status === 403) {
        logout();
        return;
      }
      if (!response.ok) return;

      const data = await response.json() as Partial<SessionResponse>;
      if (typeof data.token !== 'string' || typeof data.userName !== 'string'
        || typeof data.fullName !== 'string' || typeof data.role !== 'string'
        || typeof data.userId !== 'string') {
        return;
      }

      storeSession(data as SessionResponse);
    } catch {
      // Offline development should not destroy a locally valid session. API
      // requests will report the connection problem through their normal UI.
    }
  })().finally(() => {
    refreshPromise = null;
  });

  return refreshPromise;
}

// logs in user and stores JWT token; returns a result with a reason on failure
export async function login(
  loginDto: LoginDto
): Promise<{ success: boolean; message?: string }> {
  try {
    const response = await fetch(`${API_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loginDto),
    });

    if (!response.ok) {
      // 401 => bad credentials; 403 => valid credentials but the account is not personnel
      // (patients sign in through Supabase on the TV app); anything else is a server-side issue
      const message =
        response.status === 401
          ? 'Feil brukernavn eller passord'
          : response.status === 403
          ? 'Denne portalen er kun for helsepersonell.'
          : 'Noe gikk galt på serveren. Prøv igjen senere.';
      return { success: false, message };
    }

    const data = await response.json();

    if (!data?.token) {
      return { success: false, message: 'Uventet svar fra serveren.' };
    }

    storeSession(data as SessionResponse);

    return { success: true };
  } catch {
    // fetch throws on connection-refused / CORS block => backend not reachable
    return {
      success: false,
      message: 'Får ikke kontakt med serveren. Sjekk at backend kjører (port 5084).',
    };
  }
}

/**
 * Registers a new user account.
 * Sends user information to backend and returns result with error details if applicable.
 * 
 * @param registerDto - User registration data including username, email, password, etc.
 * The public endpoint always assigns the normal Nurse role; only a signed-in
 * head nurse can create another head-nurse account.
 * @returns Promise with success status and optional error message
 */
export async function register(registerDto: RegisterDto): Promise<{ success: boolean; message?: string }> {
  try {
    // sends POST request to registration endpoint
    const response = await fetch(`${API_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(registerDto),
    });

    // handles successful registration
    if (response.ok) {
      return { success: true };
    }

    // extracts error details from response
    const errorData: unknown = await response.json().catch(() => null);

    if (Array.isArray(errorData)) {
      const messages = errorData.map((error) => (
        error && typeof error === 'object' && 'description' in error
          ? String(error.description)
          : ''
      )).filter(Boolean);
      if (messages.length > 0) return { success: false, message: messages.join(', ') };
    }

    const errorObject = errorData && typeof errorData === 'object' && !Array.isArray(errorData)
      ? errorData as { errors?: Record<string, string[]>; message?: string }
      : null;
    
    // formats validation errors if present
    if (errorObject?.errors) {
      const errorMessages = Object.values(errorObject.errors).flat().join(', ');
      return { success: false, message: errorMessages };
    }

    // returns generic error message
    return { success: false, message: errorObject?.message || 'Registration failed' };
  } catch {
    return { success: false, message: 'Nettverksfeil. Vennligst prøv igjen.' };
  }
}

// gets authorization header for authenticated requests
export function getAuthHeader(): Record<string, string> {
  const token = getToken();
  if (token) {
    return {
      'Authorization': `Bearer ${token}`,
    };
  }
  return {};
}
