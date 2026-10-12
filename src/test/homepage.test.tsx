import { QueryClient } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { routeTree } from '@/routeTree.gen';
import { supabase } from '@/integrations/supabase/client';

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...await importOriginal<typeof import('@tanstack/react-router')>(),
  HeadContent: () => null,
  Scripts: () => null,
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('Public homepage', () => {
  it('opens the homepage without authentication configuration', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', '');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', '');
    vi.stubEnv('SUPABASE_URL', '');
    vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', '');

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      context: { queryClient: new QueryClient() },
    });
    await router.load();
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: 'Secure. Personal. Yours.' })).toBeInTheDocument();
    expect(screen.queryByText("This page didn't load")).not.toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
    expect(screen.getAllByRole('link', { name: 'Create Account' })[0]).toHaveAttribute('href', '/signup');
  });

  it('keeps the homepage visible when the optional session check fails', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.invalid');
    vi.stubEnv('VITE_SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
    vi.spyOn(supabase.auth, 'getUser').mockRejectedValue(new Error('Authentication service unavailable'));

    const router = createRouter({
      routeTree,
      history: createMemoryHistory({ initialEntries: ['/'] }),
      context: { queryClient: new QueryClient() },
    });
    await router.load();
    render(<RouterProvider router={router} />);

    expect(await screen.findByRole('heading', { name: 'Secure. Personal. Yours.' })).toBeInTheDocument();
    expect(screen.queryByText("This page didn't load")).not.toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Login' })[0]).toHaveAttribute('href', '/auth');
  });
});
