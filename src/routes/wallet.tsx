import { createFileRoute } from '@tanstack/react-router';
import { LocalWalletPage } from '@/components/local-wallet';
import { pageHead } from '@/lib/page-head';

export const Route = createFileRoute('/wallet')({
  ssr: false,
  head: () => pageHead('Self-custody Wallet', 'A device-only encrypted wallet for Bitcoin Signet, Ethereum Sepolia, Solana Devnet, and BNB Testnet.'),
  component: LocalWalletPage,
  errorComponent: () => <div className="wallet-panel empty-state"><h1>The wallet could not open safely.</h1><p>No transaction confirmation is implied. Reload to unlock your local vault, or check your public address on its explorer.</p><a href="/wallet">Reload wallet</a></div>,
});
