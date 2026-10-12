# Gilded Client Base

On photo you can find main page account page login page and etc...

I want to create web page with same design as on photo several pages 
Main page / login / client page and admin / must looks like 1 to 1 as on photo...

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1ecae126-f5ea-4186-b6df-657d22b077d5).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```


## Real multi-chain wallet status

The current client dashboard is an account/balance prototype, not a blockchain wallet. Its `balances` and `tokens` database records are not on-chain balances, and the Send/Receive/Swap dialogs do not broadcast transactions.

Before presenting this as a real wallet, implement and independently test:
- Client-side key generation and encrypted local key storage/recovery for BTC, EVM chains (Ethereum and BNB Smart Chain), and Solana.
- Chain-specific RPC/indexer providers for address balances, token balances, fees, and transaction history.
- Transaction construction, local signing, broadcast, and confirmation tracking for each chain.
- Token price sources with clear stale/unavailable states.
- Security review, dependency audit, recovery tests, and testnet end-to-end tests before mainnet funds are used.

Never use the existing admin-assigned `balances` table as proof of on-chain funds. Never collect or store seed phrases/private keys on the application server.

### Disable email confirmation (Supabase)

The signup UI cannot override a server-side email-confirmation requirement. In the Supabase project dashboard, open **Authentication → Sign In / Providers → Email** and turn off **Confirm email**, if that is the policy you want. Verify the setting on your actual project and test signup in a fresh session. This code now reports whether signup returned a session or still requires confirmation.


## Netlify deployment

See [NETLIFY_DEPLOYMENT.md](./NETLIFY_DEPLOYMENT.md) for build settings, required Supabase environment variables, and auth setup. This project is currently an account dashboard prototype; it is not yet a real BTC/ETH/SOL/BNB wallet and must not be used to hold mainnet funds.
