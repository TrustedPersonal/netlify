import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { PublicKey } from '@solana/web3.js';
import { describe, expect, it } from 'vitest';
import { deriveWallet } from './keys';
import { formatAmount, networks, parseAmount } from './networks';

describe('Wallet derivation and amounts', () => {
  it('derives deterministic chain addresses without exposing secret fields', async () => {
    const phrase = entropyToMnemonic(new Uint8Array(16), wordlist);
    const first = await deriveWallet(phrase);
    const restored = await deriveWallet(phrase.toUpperCase().replaceAll(' ', '  '));
    expect(restored.addresses).toEqual(first.addresses);
    expect(first.addresses.ETH).toBe('0x9858EfFD232B4033E47d90003D41EC34EcaEda94');
    expect(first.addresses.BNB).toBe(first.addresses.ETH);
    expect(first.addresses.BTC).toMatch(/^tb1q/);
    expect(PublicKey.isOnCurve(new PublicKey(first.addresses.SOL))).toBe(true);
    expect(Object.keys(first)).not.toEqual(expect.arrayContaining(['bitcoin', 'evm', 'solana', 'mnemonic', 'privateKey']));
    first.destroy();
    expect(first.isUnlocked()).toBe(false);
    expect(() => first.signSolana(new Uint8Array(32))).toThrow('locked');
    restored.destroy();
  });

  it.each(['0', '-1', '1e3', '1,000', ' 1', '1.', '.1', 'NaN', '0.000000001'])('rejects unsafe BTC amount %s', value => {
    expect(() => parseAmount(value, networks.BTC.decimals)).toThrow();
  });

  it('preserves integer precision across all native assets', () => {
    expect(parseAmount('0.00000001', 8)).toBe(1n);
    expect(parseAmount('1.123456789012345678', 18)).toBe(1123456789012345678n);
    expect(formatAmount(1123456789012345678n, 18)).toBe('1.123456789012345678');
    expect(formatAmount(-1n, 9)).toBe('-0.000000001');
  });
});
