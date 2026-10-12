import { type Activity, type Network, type TransactionStatus } from './networks';
import { z } from 'zod';

const endpoint = '/.netlify/functions/wallet-api';

export async function walletApi<Result>(operation: string, parameters: Record<string, unknown> = {}): Promise<Result> {
  let response: Response;
  try {
    response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operation, ...parameters }), credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(20_000) });
  } catch {
    throw new Error('The blockchain provider is unavailable. No transaction confirmation can be assumed.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.error) throw new Error(typeof data?.error === 'string' ? data.error : 'The wallet service is unavailable.');
  return data.result as Result;
}

export const rpc = <Result>(network: Network, method: string, params: unknown[] = []) => walletApi<Result>('rpc', { network, method, params });
export const bitcoinApi = <Result>(action: string, parameters: Record<string, unknown> = {}) => walletApi<Result>('bitcoin', { action, ...parameters });
export async function readBalance(network: Network, address: string) {
  const data = await walletApi('balance', { network, address });
  const parsed = z.object({ confirmed: z.string().regex(/^\d+$/).max(80), pending: z.string().regex(/^-?\d+$/).max(80) }).safeParse(data);
  if (!parsed.success) throw new Error('The provider returned an invalid balance.');
  return parsed.data;
}

export async function readHistory(network: Network, address: string): Promise<Activity[]> {
  const data = await walletApi('history', { network, address });
  const parsed = z.array(z.object({ hash: z.string().min(1).max(100), status: z.enum(['pending', 'confirming', 'confirmed', 'failed', 'unknown']), timestamp: z.number().nullable(), direction: z.enum(['sent', 'received', 'activity']), amount: z.string().regex(/^\d+$/).max(80).optional() })).max(25).safeParse(data);
  if (!parsed.success) throw new Error('The provider returned invalid transaction history.');
  return parsed.data.map(item => ({ ...item, ...(item.amount === undefined ? {} : { amount: item.amount }) })) as Activity[];
}

export async function readStatus(network: Network, hash: string): Promise<TransactionStatus> {
  const data = await walletApi('status', { network, hash });
  const parsed = z.enum(['pending', 'confirming', 'confirmed', 'failed', 'unknown']).safeParse(data);
  if (!parsed.success) throw new Error('The provider returned an invalid transaction status.');
  return parsed.data;
}
export type MarketPrices = Record<Network, { usd: number; updatedAt: number }>;
export const readPrices = () => walletApi<MarketPrices>('prices');
