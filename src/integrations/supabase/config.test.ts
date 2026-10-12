import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSupabaseConfig, isSupabaseConfigured } from './config';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('Supabase configuration', () => {
  it.each([
    ['', ''],
    ['https://example.invalid', ''],
    ['', 'test-publishable-key'],
  ])('requires both browser settings', (url, publishableKey) => {
    vi.stubEnv('VITE_SUPABASE_URL', url);
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', publishableKey);

    expect(isSupabaseConfigured()).toBe(false);
  });

  it('does not use server-only settings in the browser', () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('SUPABASE_URL', 'https://example.invalid');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');

    expect(getSupabaseConfig()).toEqual({ url: undefined, publishableKey: undefined });
  });

  it('uses runtime settings on the server when browser settings are absent', () => {
    vi.stubGlobal('window', undefined);
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('SUPABASE_URL', 'https://example.invalid');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');

    expect(isSupabaseConfigured()).toBe(true);
    expect(getSupabaseConfig().url).toBe('https://example.invalid');
  });
});
