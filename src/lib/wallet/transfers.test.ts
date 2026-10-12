import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { Transaction as BitcoinTransaction, TEST_NETWORK } from '@scure/btc-signer';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { base58 } from '@scure/base';
import { Transaction as SolanaTransaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { keccak256, parseTransaction, recoverTransactionAddress, type Hex, type TransactionSerialized } from 'viem';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { bitcoinApi, rpc } from './api';
import { deriveWallet, type WalletKeys } from './keys';
import { prepareTransfer, selectBitcoinInputs, validateRecipient } from './transfers';

vi.mock('./api', () => ({ bitcoinApi: vi.fn(), rpc: vi.fn() }));
let keys: WalletKeys;
let recipient: WalletKeys;
beforeEach(async () => {
  vi.stubGlobal('Uint8Array', Object.getPrototypeOf(Buffer.prototype).constructor);
  keys = await deriveWallet(entropyToMnemonic(new Uint8Array(16), wordlist));
  recipient = await deriveWallet(entropyToMnemonic(new Uint8Array(16).fill(1), wordlist));
});
afterEach(() => { keys.destroy(); recipient.destroy(); vi.resetAllMocks(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function evmFixture(network: 'ETH' | 'BNB', override: Record<string, unknown> = {}) {
  const values: Record<string, unknown> = { eth_chainId: network === 'ETH' ? '0xaa36a7' : '0x61', eth_getTransactionCount: '0x0', eth_gasPrice: '0x3b9aca00', eth_getBalance: '0xde0b6b3a7640000', eth_getCode: '0x', eth_estimateGas: '0x5208', ...override };
  let signed: Hex | undefined;
  vi.mocked(rpc).mockImplementation(async (_network, method, params) => {
    if (method === 'eth_sendRawTransaction') { signed = params![0] as Hex; return keccak256(signed); }
    return values[method];
  });
  return () => signed;
}

describe('Local native transfer signing', () => {
  it.each(['ETH', 'BNB'] as const)('signs real %s transaction bytes locally with the correct chain ID', async network => {
    const signed = evmFixture(network);
    const prepared = await prepareTransfer(keys, network, recipient.addresses[network], 1000n);
    expect(signed()).toBeUndefined();
    expect(prepared.fee).toBe(21_000_000_000_000n);
    const hash = await prepared.broadcast();
    expect(hash).toBe(keccak256(signed()!));
    expect(await recoverTransactionAddress({ serializedTransaction: signed()! as TransactionSerialized })).toBe(keys.addresses[network]);
    expect(parseTransaction(signed()!).chainId).toBe(network === 'ETH' ? 11155111 : 97);
    expect(parseTransaction(signed()!).value).toBe(1000n);
    await expect(prepared.broadcast()).rejects.toThrow('already attempted');
  });

  it('fails closed on a mainnet provider, insufficient funds, and contract recipients', async () => {
    evmFixture('ETH', { eth_chainId: '0x1' });
    await expect(prepareTransfer(keys, 'ETH', recipient.addresses.ETH, 1000n)).rejects.toThrow('wrong chain');
    evmFixture('ETH', { eth_getBalance: '0x0' });
    await expect(prepareTransfer(keys, 'ETH', recipient.addresses.ETH, 1000n)).rejects.toThrow('Insufficient');
    evmFixture('ETH', { eth_getCode: '0x6000' });
    await expect(prepareTransfer(keys, 'ETH', recipient.addresses.ETH, 1000n)).rejects.toThrow('Contract interactions are disabled');
    expect(vi.mocked(rpc).mock.calls.some(([, method]) => method === 'eth_sendRawTransaction')).toBe(false);
  });

  it('prevents signing locked wallets and expired quotes', async () => {
    evmFixture('ETH');
    const prepared = await prepareTransfer(keys, 'ETH', recipient.addresses.ETH, 1000n);
    vi.spyOn(Date, 'now').mockReturnValue(prepared.expiresAt + 1);
    await expect(prepared.broadcast()).rejects.toThrow('expired');
    vi.restoreAllMocks();
    keys.destroy();
    await expect(prepared.broadcast()).rejects.toThrow('locked');
  });

  it('signs a valid SOL transfer and verifies its signature before broadcast', async () => {
    let raw = '';
    vi.mocked(rpc).mockImplementation(async (_network, method, params) => {
      if (method === 'getLatestBlockhash') return { value: { blockhash: '11111111111111111111111111111111', lastValidBlockHeight: 100 } };
      if (method === 'getBalance') return { value: 1_000_000_000 };
      if (method === 'getFeeForMessage') return { value: 5000 };
      if (method === 'sendTransaction') { raw = params![0] as string; return base58.encode(SolanaTransaction.from(Buffer.from(raw, 'base64')).signature!); }
      throw new Error('Unexpected fixture method');
    });
    const prepared = await prepareTransfer(keys, 'SOL', recipient.addresses.SOL, 1_000_000n);
    expect(raw).toBe('');
    expect(prepared.fee).toBe(5000n);
    await prepared.broadcast();
    const transaction = SolanaTransaction.from(Buffer.from(raw, 'base64'));
    expect(transaction.verifySignatures()).toBe(true);
    expect(transaction.feePayer!.toBase58()).toBe(keys.addresses.SOL);
    expect(transaction.instructions[0]!.data.readBigUInt64LE(4)).toBe(1_000_000n);
  });

  it('verifies BTC previous outputs and signs a finalized SegWit transfer', async () => {
    const funding = new BitcoinTransaction();
    funding.addInput({ txid: '00'.repeat(32), index: 0 });
    funding.addOutputAddress(keys.addresses.BTC, 100_000n, TEST_NETWORK);
    let raw = '';
    vi.mocked(bitcoinApi).mockImplementation(async action => {
      if (action === 'utxos') return [{ txid: funding.id, vout: 0, value: 100_000, status: { confirmed: true } }];
      if (action === 'fees') return { '6': 2 };
      if (action === 'raw') return bytesToHex(funding.toBytes());
      if (action === 'broadcast') throw new Error('Fixture must capture raw bytes');
      throw new Error('Unexpected fixture action');
    });
    const prepared = await prepareTransfer(keys, 'BTC', recipient.addresses.BTC, 10_000n);
    vi.mocked(bitcoinApi).mockImplementation(async (_action, params) => { raw = params!['raw'] as string; return BitcoinTransaction.fromRaw(hexToBytes(raw)).id; });
    await prepared.broadcast();
    const transaction = BitcoinTransaction.fromRaw(hexToBytes(raw));
    expect(transaction.isFinal).toBe(true);
    expect(transaction.getOutputAddress(0, TEST_NETWORK)).toBe(recipient.addresses.BTC);
    expect(transaction.getOutput(0).amount).toBe(10_000n);
    expect(transaction.getOutput(1).amount).toBe(100_000n - 10_000n - prepared.fee);
  });

  it('rejects mainnet BTC addresses, dust, invalid fees, and unconfirmed inputs', () => {
    expect(() => validateRecipient('BTC', 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu')).toThrow('Signet');
    expect(() => selectBitcoinInputs([], 1000n, 0)).toThrow('unsafe');
    expect(() => selectBitcoinInputs([{ txid: '11'.repeat(32), vout: 0, value: 100_000, status: { confirmed: false } }], 1000n, 1)).toThrow('Insufficient confirmed');
  });
});
