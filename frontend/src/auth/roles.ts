/** Canonical portal roles issued by the backend. */
export type PortalRole = 'HeadNurse' | 'Nurse' | 'Personnel';

/**
 * `Personnel` is kept as a login-compatible legacy role. Existing accounts are
 * migrated by the backend, but accepting it here prevents an old browser session
 * from being thrown out before the user has had a chance to sign in again.
 */
export const isPortalRole = (role: string | undefined): role is PortalRole =>
  role === 'HeadNurse' || role === 'Nurse' || role === 'Personnel';

export const isHeadNurseRole = (role: string | undefined): boolean =>
  role === 'HeadNurse';

