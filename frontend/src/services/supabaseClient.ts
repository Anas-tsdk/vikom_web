import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

if (!isSupabaseConfigured) {
    console.error(
        'Supabase is not configured: VITE_SUPABASE_URL and/or VITE_SUPABASE_ANON_KEY are missing. ' +
        'Calling features will be unavailable. Add them to frontend/.env.local.'
    );
}

// Lazily create a single supabase client for call signaling. Patient profile
// lookups go through the backend instead. We must NOT call createClient at
// module load with empty strings: supabase-js throws "supabaseUrl is required."
// on a falsy url, which would crash app startup whenever the env vars are
// missing (the whole module graph imports this transitively). Creating it on
// first use lets the isSupabaseConfigured guards degrade gracefully instead.
let supabaseClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
    if (!isSupabaseConfigured) {
        throw new Error(
            'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.'
        );
    }
    if (!supabaseClient) {
        supabaseClient = createClient(supabaseUrl as string, supabaseKey as string);
    }
    return supabaseClient;
}
