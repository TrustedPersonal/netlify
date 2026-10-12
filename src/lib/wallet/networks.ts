export const networks = {
  BTC: { symbol: 'BTC', name: 'Bitcoin', network: 'Signet', decimals: 8, path: "m/84'/1'/0'/0/0", coinId: 'bitcoin', explorer: 'https://mempool.space/signet', finality: 6 },
  ETH: { symbol: 'ETH', name: 'Ethereum', network: 'Sepolia', decimals: 18, path: "m/44'/60'/0'/0/0", coinId: 'ethereum', explorer: 'https://sepolia.etherscan.io', chainId: 11155111, finality: 12 },
  SOL: { symbol: 'SOL', name: 'Solana', network: 'Devnet', decimals: 9, path: "m/44'/501'/0'/0'", coinId: 'solana', explorer: 'https://explorer.solana.com', finality: 1 },
  BNB: { symbol: 'BNB', name: 'BNB Smart Chain', network: 'Testnet', decimals: 18, path: "m/44'/60'/0'/0/0", coinId: 'binancecoin', explorer: 'https://testnet.bscscan.com', chainId: 97, finality: 12 },
} as const;

export type Network = keyof typeof networks;
export const networkIds = Object.keys(networks) as Network[];
export type Addresses = Record<Network, string>;
export type TransactionStatus = 'pending' | 'confirming' | 'confirmed' | 'failed' | 'unknown';
export type Activity = { hash: string; status: TransactionStatus; timestamp: number | null; direction: 'sent' | 'received' | 'activity'; amount?: string };

export function explorerLink(network: Network, kind: 'address' | 'tx', value: string) {
  return `${networks[network].explorer}/${kind}/${encodeURIComponent(value)}${network === 'SOL' ? '?cluster=devnet' : ''}`;
}

export function parseAmount(value: string, decimals: number): bigint {
  if (!/^\d+(\.\d+)?$/.test(value) || value.length > 80) throw new Error('Enter a positive amount without exponents or separators.');
  const [whole = '0', fraction = ''] = value.split('.');
  if (fraction.length > decimals) throw new Error(`This asset supports at most ${decimals} decimal places.`);
  const amount = BigInt(whole) * 10n ** BigInt(decimals) + BigInt(fraction.padEnd(decimals, '0') || '0');
  if (amount <= 0n) throw new Error('The amount must be greater than zero.');
  return amount;
}

export function formatAmount(value: bigint, decimals: number) {
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0');
  const fraction = digits.slice(-decimals).replace(/0+$/, '');
  return `${negative ? '-' : ''}${digits.slice(0, -decimals)}${fraction ? `.${fraction}` : ''}`;
}
