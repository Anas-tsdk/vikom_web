import { API_URL } from '../../config/config';
import { getAuthHeader } from '../../auth/AuthService';
import { readErrorMessage } from './PatientService';

/**
 * A patient identity in Supabase, as shown when linking a portal patient to
 * their TV account.
 *
 * These are read through our own backend, not from Supabase directly: portal
 * personnel hold a backend JWT and have no Supabase session, so a browser-side
 * query would run as `anon` and would force the `profiles` table to allow
 * anonymous SELECT. The backend uses a service-role key that never leaves the
 * server.
 */
export interface SupabaseProfile {
  id: string;
  /**
   * The Supabase account's username. Display-only — it is never stored as the
   * patient's local URL handle.
   */
  username: string | null;
  avatarUrl: string | null;
  deviceType: string | null;
  isOnline: boolean;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** True when the text is a Supabase profile UUID rather than a username. */
export function looksLikeUuid(value: string): boolean {
  return UUID_PATTERN.test(value.trim());
}

/**
 * Carries whether the failure was "this server isn't set up for Supabase
 * lookups" (503) rather than an ordinary error, so the picker can fall back to
 * manual UUID entry instead of just showing a red message.
 */
export class SupabaseLookupError extends Error {
  readonly notConfigured: boolean;

  constructor(message: string, notConfigured: boolean) {
    super(message);
    this.name = 'SupabaseLookupError';
    this.notConfigured = notConfigured;
  }
}

async function request(path: string): Promise<Response> {
  const response = await fetch(`${API_URL}/api/patients/${path}`, {
    headers: { ...getAuthHeader() },
  });

  if (!response.ok && response.status !== 404) {
    throw new SupabaseLookupError(await readErrorMessage(response), response.status === 503);
  }

  return response;
}

const SupabaseProfileService = {
  /** Profiles whose username contains the query, for the link picker. */
  async searchByUsername(query: string, limit = 8): Promise<SupabaseProfile[]> {
    const term = query.trim();
    if (!term) return [];

    const response = await request(
      `supabase-profiles?query=${encodeURIComponent(term)}&limit=${limit}`
    );
    return response.json();
  },

  /** Resolves a UUID so the nurse sees which account is linked, not just an id. */
  async getById(id: string): Promise<SupabaseProfile | null> {
    const response = await request(`supabase-profiles/${encodeURIComponent(id.trim())}`);
    return response.status === 404 ? null : response.json();
  },
};

export default SupabaseProfileService;
