// Local development works without configuration. Deployments can point the
// same build at their API through VITE_API_URL instead of changing source code.
const configuredApiUrl = import.meta.env.VITE_API_URL?.trim();
export const API_URL = (configuredApiUrl || 'http://localhost:5084').replace(/\/+$/, '');
