// An empty base URL keeps API requests same-origin. Vite dev/preview proxy
// forwards them to the local backend; deployed frontends can set VITE_API_URL
// when the API is hosted on a different origin.
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
export const API_URL = (configuredApiUrl || '').replace(/\/+$/, '');
