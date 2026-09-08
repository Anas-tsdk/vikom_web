import { API_URL } from '../config/config';
import type { LoginDto, RegisterDto } from '../types';

interface UserInfo {
  userName: string;
  fullName: string;
  role: string;
  userId: string;
}

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
  return getToken() !== null;
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

    setToken(data.token);
    setUserInfo({
      userName: data.userName,
      fullName: data.fullName,
      role: data.role,
      userId: data.userId,
    });

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
 * The backend always assigns the Personnel role; the portal has no patient accounts.
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
    const errorData = await response.json();
    
    // formats validation errors if present
    if (errorData.errors) {
      const errorMessages = Object.values(errorData.errors).flat().join(', ');
      return { success: false, message: errorMessages };
    }

    // returns generic error message
    return { success: false, message: errorData.message || 'Registration failed' };
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
