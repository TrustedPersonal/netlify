# Netlify deployment checklist

## Build configuration

This project uses TanStack Start server rendering and server functions. It must be deployed with the Nitro Netlify preset, not as a static-only SPA. `netlify.toml` sets the build command, publish directory, Node version, and `NITRO_PRESET=netlify`.

## Netlify environment variables

In **Site configuration → Environment variables**, add these values from your own Supabase project:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`

The `VITE_` values are exposed to the browser; only use Supabase's publishable/anon key, never a service-role or secret key. `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are also used by server-side code. Do not upload `.env` or private credentials to source control.

## Supabase setup

1. In **Authentication → URL Configuration**, set the Site URL to your Netlify production URL and add the production URL plus any preview URLs you use to Redirect URLs.
2. In **Authentication → Sign In / Providers → Email**, turn off **Confirm email** if you intentionally want password signup to create a session without email verification. This is a server-side setting; the website cannot override it.
3. Apply the SQL migrations in `supabase/migrations` and verify Row Level Security policies for your project.
4. Test signup, login, logout, password reset, refresh, and protected routes on the deployed URL.

## Critical wallet status

The existing application is an account dashboard prototype, not a production cryptocurrency wallet. The database `balances` table is not blockchain data. BTC, ETH, SOL and BNB key generation, recovery, live on-chain balance lookup, fee estimation, transaction signing/broadcast, swaps, and fiat purchases have not been implemented or security-audited. Do not accept or send mainnet funds through this build. Netlify deployment configuration alone cannot make these services real; they require chain-specific implementations, RPC/indexer providers, end-to-end testing, and an independent security review.
