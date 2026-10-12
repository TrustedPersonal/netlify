export function getSupabaseConfig() {
  const serverEnv = typeof window === 'undefined' && typeof process !== 'undefined'
    ? process.env
    : undefined;

  return {
    url: import.meta.env['VITE_SUPABASE_URL'] || serverEnv?.['SUPABASE_URL'],
    publishableKey: import.meta.env['VITE_SUPABASE_PUBLISHABLE_KEY'] || serverEnv?.['SUPABASE_PUBLISHABLE_KEY'],
  };
}

export function isSupabaseConfigured() {
  const { url, publishableKey } = getSupabaseConfig();
  return Boolean(url && publishableKey);
}
