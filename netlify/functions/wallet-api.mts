import type { Config } from '@netlify/functions';
import { z } from 'zod';
import { parseTransaction } from 'viem';
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { Address, TEST_NETWORK } from '@scure/btc-signer';
import { networks, networkIds, type Network, type Activity, type TransactionStatus } from '../../src/lib/wallet/networks';

function providerUrl(network: Network) {
  const defaults = {
    BTC: 'https://mempool.space/signet/api',
    ETH: 'https://ethereum-sepolia-rpc.publicnode.com',
    SOL: 'https://api.devnet.solana.com',
    BNB: 'https://data-seed-prebsc-1-s1.bnbchain.org:8545',
  };
  const variables = { BTC: 'BTC_SIGNET_API_URL', ETH: 'ETH_SEPOLIA_RPC_URL', SOL: 'SOL_DEVNET_RPC_URL', BNB: 'BNB_TESTNET_RPC_URL' };
  const value = process.env[variables[network]] || defaults[network];
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
    return value.replace(/\/$/, '');
  } catch {
    throw new Error('The blockchain provider configuration is invalid.');
  }
}

async function providerFetch(url: string, options: RequestInit = {}) {
  try {
    const response = await fetch(url, { ...options, signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new Error();
    return response;
  } catch {
    throw new Error('The blockchain provider is unavailable or rejected the request. Check the explorer before retrying a send.');
  }
}

async function upstreamRpc(network: Network, method: string, params: unknown[] = []) {
  const response = await providerFetch(providerUrl(network), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }) });
  const body = await response.json();
  if (body.error || !Object.hasOwn(body, 'result')) throw new Error('The blockchain provider rejected this operation. Check your balance, network, and explorer before retrying.');
  return body.result;
}

async function verifyNetwork(network: Network) {
  if (network === 'BTC') {
    const genesis = await (await providerFetch(`${providerUrl(network)}/block-height/0`)).text();
    if (genesis.trim() !== '00000008819873e925422c1ff0f99f7cc9bbb232af63a077a480a3633bee1ef6') throw new Error('Bitcoin provider must use Signet. Mainnet is disabled.');
  } else if (network === 'SOL') {
    if (await upstreamRpc(network, 'getGenesisHash') !== 'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG') throw new Error('Solana provider must use Devnet. Mainnet is disabled.');
  } else {
    const chainId = await upstreamRpc(network, 'eth_chainId');
    if (typeof chainId !== 'string' || Number(BigInt(chainId)) !== networks[network].chainId) throw new Error('The EVM provider is on the wrong chain. Mainnet is disabled.');
  }
}

function validateAddress(network: Network, address: string) {
  if (network === 'BTC') {
    try { Address(TEST_NETWORK).decode(address); } catch { throw new Error('Invalid Bitcoin Signet address.'); }
  } else if (network === 'SOL') {
    try { new PublicKey(address); } catch { throw new Error('Invalid Solana address.'); }
  } else if (!/^0x[0-9a-f]{40}$/i.test(address)) throw new Error('Invalid EVM address.');
}

function validateHash(network: Network, hash: string) {
  const pattern = network === 'SOL' ? /^[1-9A-HJ-NP-Za-km-z]{64,90}$/ : network === 'BTC' ? /^[0-9a-f]{64}$/i : /^0x[0-9a-f]{64}$/i;
  if (!pattern.test(hash)) throw new Error('Invalid transaction identifier.');
}

function rpcParameters(network: Network, method: string, params: unknown[]) {
  const evmAddress = z.string().regex(/^0x[0-9a-f]{40}$/i);
  const hex = z.string().regex(/^0x[0-9a-f]+$/i).max(80);
  const hash = z.string().regex(/^0x[0-9a-f]{64}$/i);
  const solAddress = z.string().max(44).refine(value => { try { new PublicKey(value); return true; } catch { return false; } });
  const commitment = z.object({ commitment: z.literal('confirmed') }).strict();
  const empty = z.tuple([]);
  const evm = {
    eth_chainId: empty,
    eth_gasPrice: empty,
    eth_getBalance: z.tuple([evmAddress, z.enum(['latest', 'pending'])]),
    eth_getCode: z.tuple([evmAddress, z.literal('latest')]),
    eth_getTransactionCount: z.tuple([evmAddress, z.literal('pending')]),
    eth_estimateGas: z.tuple([z.object({ from: evmAddress, to: evmAddress, value: hex }).strict()]),
    eth_getTransactionReceipt: z.tuple([hash]),
    eth_blockNumber: empty,
    eth_sendRawTransaction: z.tuple([z.string().regex(/^0x[0-9a-f]+$/i).max(4096)]),
  };
  const sol = {
    getGenesisHash: empty,
    getBalance: z.tuple([solAddress, commitment]),
    getLatestBlockhash: z.tuple([commitment]),
    getFeeForMessage: z.tuple([z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(4096), commitment]),
    getSignaturesForAddress: z.tuple([solAddress, z.object({ limit: z.literal(25), commitment: z.literal('confirmed') }).strict()]),
    getSignatureStatuses: z.tuple([z.array(z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{64,90}$/)).min(1).max(25), z.object({ searchTransactionHistory: z.literal(true) }).strict()]),
    sendTransaction: z.tuple([z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/).max(4096), z.object({ encoding: z.literal('base64'), skipPreflight: z.literal(false), preflightCommitment: z.literal('confirmed'), maxRetries: z.literal(3) }).strict()]),
  };
  const allowed: Record<string, z.ZodTypeAny> = network === 'SOL' ? sol : network === 'BTC' ? {} : evm;
  if (!Object.hasOwn(allowed, method)) throw new Error('This RPC method is not supported.');
  const validated = allowed[method]!.safeParse(params);
  if (!validated.success) throw new Error('Invalid RPC parameters.');
  if (method === 'eth_sendRawTransaction') {
    const transaction = parseTransaction(params[0] as `0x${string}`);
    if (network !== 'ETH' && network !== 'BNB') throw new Error('Invalid network.');
    if (transaction.chainId !== networks[network].chainId || !transaction.to || transaction.data && transaction.data !== '0x' || !transaction.value || transaction.value <= 0n || !transaction.r || !transaction.s || !transaction.gas || transaction.gas > 100_000n) throw new Error('Only signed native transfers on supported testnets are allowed.');
  }
  if (method === 'sendTransaction') {
    const transaction = Transaction.from(Buffer.from(params[0] as string, 'base64'));
    const instruction = transaction.instructions[0];
    if (transaction.instructions.length !== 1 || !instruction?.programId.equals(SystemProgram.programId) || instruction.data.length !== 12 || instruction.data.readUInt32LE(0) !== 2 || instruction.data.readBigUInt64LE(4) <= 0n || transaction.signatures.length !== 1 || !transaction.verifySignatures() || !instruction.keys[0] || !transaction.feePayer?.equals(instruction.keys[0].pubkey)) throw new Error('Only signed native SOL transfers are allowed.');
  }
  return validated.data;
}

async function bitcoin(action: string, input: { address?: string | undefined; hash?: string | undefined; raw?: string | undefined }) {
  const root = providerUrl('BTC');
  if (input.address) validateAddress('BTC', input.address);
  if (input.hash) validateHash('BTC', input.hash);
  if (action === 'broadcast') {
    if (!input.raw || !/^[0-9a-f]+$/i.test(input.raw) || input.raw.length > 24_000 || input.raw.length % 2 !== 0) throw new Error('Invalid signed Bitcoin transaction.');
    return (await (await providerFetch(`${root}/tx`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: input.raw })).text()).trim();
  }
  const path = action === 'fees' ? '/fee-estimates' : action === 'tip' ? '/blocks/tip/height' : action === 'utxos' && input.address ? `/address/${input.address}/utxo` : action === 'address' && input.address ? `/address/${input.address}` : action === 'history' && input.address ? `/address/${input.address}/txs` : action === 'raw' && input.hash ? `/tx/${input.hash}/hex` : action === 'status' && input.hash ? `/tx/${input.hash}/status` : undefined;
  if (!path) throw new Error('Unsupported Bitcoin operation.');
  const response = await providerFetch(root + path);
  return action === 'raw' ? response.text() : response.json();
}

async function balance(network: Network, address: string) {
  if (network === 'BTC') {
    const data = await bitcoin('address', { address });
    return { confirmed: String(data.chain_stats.funded_txo_sum - data.chain_stats.spent_txo_sum), pending: String(data.mempool_stats.funded_txo_sum - data.mempool_stats.spent_txo_sum) };
  }
  if (network === 'SOL') {
    const data = await upstreamRpc(network, 'getBalance', [address, { commitment: 'confirmed' }]);
    if (!Number.isSafeInteger(data.value) || data.value < 0) throw new Error('Invalid provider balance.');
    return { confirmed: String(data.value), pending: '0' };
  }
  const [confirmed, pending] = await Promise.all([upstreamRpc(network, 'eth_getBalance', [address, 'latest']), upstreamRpc(network, 'eth_getBalance', [address, 'pending'])]);
  return { confirmed: String(BigInt(confirmed)), pending: String(BigInt(pending) - BigInt(confirmed)) };
}

async function history(network: Network, address: string): Promise<Activity[]> {
  if (network === 'BTC') {
    const [data, height] = await Promise.all([bitcoin('history', { address }), bitcoin('tip', {})]);
    return data.map((transaction: any) => {
      const spent = transaction.vin.reduce((sum: number, input: any) => sum + (input.prevout?.scriptpubkey_address === address ? input.prevout.value : 0), 0);
      const received = transaction.vout.reduce((sum: number, output: any) => sum + (output.scriptpubkey_address === address ? output.value : 0), 0);
      return { hash: transaction.txid, status: !transaction.status.confirmed ? 'pending' : height - transaction.status.block_height + 1 >= networks.BTC.finality ? 'confirmed' : 'confirming', timestamp: transaction.status.block_time ?? null, direction: spent > received ? 'sent' : 'received', amount: String(Math.abs(received - spent)) };
    });
  }
  if (network === 'SOL') {
    const signatures = await upstreamRpc(network, 'getSignaturesForAddress', [address, { limit: 25, commitment: 'confirmed' }]);
    return signatures.map((item: any) => ({ hash: item.signature, status: item.err ? 'failed' : item.confirmationStatus === 'finalized' ? 'confirmed' : 'confirming', timestamp: item.blockTime, direction: 'activity' }));
  }
  const key = process.env['ETHERSCAN_API_KEY'];
  if (!key) throw new Error('EVM history requires an Etherscan V2 API key. Balances and sending remain available through RPC.');
  const url = new URL('https://api.etherscan.io/v2/api');
  url.search = new URLSearchParams({ chainid: String(networks[network].chainId), module: 'account', action: 'txlist', address, startblock: '0', endblock: '999999999', page: '1', offset: '25', sort: 'desc', apikey: key }).toString();
  const data = await (await providerFetch(url.href)).json();
  if (data.status === '0' && data.message === 'No transactions found' && Array.isArray(data.result)) return [];
  if (data.status !== '1' || !Array.isArray(data.result)) throw new Error('The EVM history provider is unavailable or does not support this chain on the configured plan.');
  return data.result.map((item: any) => ({ hash: item.hash, status: item.isError === '1' || item.txreceipt_status === '0' ? 'failed' : Number(item.confirmations) >= networks[network].finality ? 'confirmed' : 'confirming', timestamp: Number(item.timeStamp), direction: item.from.toLowerCase() === address.toLowerCase() ? 'sent' : 'received', amount: item.value }));
}

async function status(network: Network, hash: string): Promise<TransactionStatus> {
  if (network === 'BTC') {
    const [data, height] = await Promise.all([bitcoin('status', { hash }), bitcoin('tip', {})]);
    return !data.confirmed ? 'pending' : height - data.block_height + 1 >= networks.BTC.finality ? 'confirmed' : 'confirming';
  }
  if (network === 'SOL') {
    const data = await upstreamRpc(network, 'getSignatureStatuses', [[hash], { searchTransactionHistory: true }]);
    const transaction = data.value[0];
    return !transaction ? 'unknown' : transaction.err ? 'failed' : transaction.confirmationStatus === 'finalized' ? 'confirmed' : 'confirming';
  }
  const receipt = await upstreamRpc(network, 'eth_getTransactionReceipt', [hash]);
  if (!receipt) return 'pending';
  if (receipt.status === '0x0') return 'failed';
  if (receipt.status !== '0x1') return 'unknown';
  const head = await upstreamRpc(network, 'eth_blockNumber');
  return BigInt(head) - BigInt(receipt.blockNumber) + 1n >= BigInt(networks[network].finality) ? 'confirmed' : 'confirming';
}

async function prices() {
  const headers: Record<string, string> = {};
  if (process.env['COINGECKO_DEMO_API_KEY']) headers['x-cg-demo-api-key'] = process.env['COINGECKO_DEMO_API_KEY'];
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana,binancecoin&vs_currencies=usd&include_last_updated_at=true';
  const data = await (await providerFetch(url, { headers })).json();
  return Object.fromEntries(networkIds.map(network => {
    const quote = data[networks[network].coinId];
    if (!quote || !Number.isFinite(quote.usd) || quote.usd <= 0 || !Number.isFinite(quote.last_updated_at) || Date.now() / 1000 - quote.last_updated_at > 300) throw new Error('Fresh market prices are unavailable. No fallback prices are used.');
    return [network, { usd: quote.usd, updatedAt: quote.last_updated_at }];
  }));
}

export default async (request: Request) => {
  const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (request.method !== 'POST') return Response.json({ error: 'Use a JSON POST request.' }, { status: 405, headers: { ...headers, Allow: 'POST' } });
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') return Response.json({ error: 'Cross-origin wallet requests are not allowed.' }, { status: 403, headers });
  if (!request.headers.get('content-type')?.startsWith('application/json')) return Response.json({ error: 'JSON content is required.' }, { status: 415, headers });
  try {
    const body = await request.text();
    if (body.length > 32_768) return Response.json({ error: 'Request too large.' }, { status: 413, headers });
    const schema = z.object({ operation: z.enum(['rpc', 'bitcoin', 'balance', 'history', 'status', 'prices']), network: z.enum(['BTC', 'ETH', 'SOL', 'BNB']).optional(), method: z.string().max(64).optional(), params: z.array(z.unknown()).max(4).optional(), action: z.string().max(32).optional(), address: z.string().max(100).optional(), hash: z.string().max(100).optional(), raw: z.string().max(24_000).optional() }).strict();
    const parsed = schema.safeParse(JSON.parse(body));
    if (!parsed.success) return Response.json({ error: 'Invalid wallet request. Never send wallet secrets to this endpoint.' }, { status: 400, headers });
    const input = parsed.data;
    if (input.operation === 'prices') return Response.json({ result: await prices() }, { headers });
    const network = input.operation === 'bitcoin' ? 'BTC' : input.network;
    if (!network) return Response.json({ error: 'Select a supported test network.' }, { status: 400, headers });
    if (input.address) validateAddress(network, input.address);
    if (input.hash) validateHash(network, input.hash);
    let params: unknown[] = [];
    if (input.operation === 'rpc') {
      if (!input.method || !input.params) throw new Error('RPC method and parameters are required.');
      params = rpcParameters(network, input.method, input.params);
    }
    await verifyNetwork(network);
    const result = input.operation === 'rpc' ? await upstreamRpc(network, input.method!, params) : input.operation === 'bitcoin' ? await bitcoin(input.action ?? '', input) : input.operation === 'balance' && input.address ? await balance(network, input.address) : input.operation === 'history' && input.address ? await history(network, input.address) : input.operation === 'status' && input.hash ? await status(network, input.hash) : undefined;
    if (result === undefined) return Response.json({ error: 'The operation is missing required parameters.' }, { status: 400, headers });
    return Response.json({ result }, { headers });
  } catch (error) {
    const safeMessages = [
      'The blockchain provider configuration is invalid.', 'The blockchain provider is unavailable or rejected the request. Check the explorer before retrying a send.',
      'The blockchain provider rejected this operation. Check your balance, network, and explorer before retrying.',
      'Bitcoin provider must use Signet. Mainnet is disabled.', 'Solana provider must use Devnet. Mainnet is disabled.',
      'The EVM provider is on the wrong chain. Mainnet is disabled.', 'EVM history requires an Etherscan V2 API key. Balances and sending remain available through RPC.',
      'The EVM history provider is unavailable or does not support this chain on the configured plan.', 'Fresh market prices are unavailable. No fallback prices are used.',
      'This RPC method is not supported.', 'Invalid RPC parameters.', 'Only signed native transfers on supported testnets are allowed.', 'Only signed native SOL transfers are allowed.',
    ];
    const message = error instanceof Error && safeMessages.includes(error.message) ? error.message : 'The wallet request failed validation or the provider returned invalid data.';
    return Response.json({ error: message }, { status: 502, headers });
  }
};

export const config: Config = { rateLimit: { windowLimit: 120, windowSize: 60, aggregateBy: ['ip', 'domain'] } };
