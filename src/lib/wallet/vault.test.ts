import { webcrypto } from 'node:crypto';
import 'fake-indexeddb/auto';
import { entropyToMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptVault, deleteVault, encryptVault, newRecoveryPhrase, normalizeMnemonic, readVault, writeVault } from './vault';

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(async () => { await deleteVault(); vi.unstubAllGlobals(); });
const fixturePhrase = () => entropyToMnemonic(new Uint8Array(16), wordlist);

describe('Encrypted device vault', () => {
  it('generates a valid 24-word BIP39 phrase', () => {
    const phrase = newRecoveryPhrase();
    expect(phrase.split(' ')).toHaveLength(24);
    expect(normalizeMnemonic(phrase)).toBe(phrase);
  });

  it('rejects invalid recovery phrases and weak passwords', async () => {
    expect(() => normalizeMnemonic('not a recovery phrase')).toThrow('valid English BIP39');
    await expect(encryptVault(fixturePhrase(), 'short')).rejects.toThrow('12–1024');
  });

  it('stores only authenticated ciphertext and restores the same phrase', async () => {
    const vault = await encryptVault(fixturePhrase(), 'fixture-wallet-password');
    await writeVault(vault);
    const stored = await readVault();
    expect(Object.keys(stored!)).toEqual(['version', 'iterations', 'salt', 'iv', 'ciphertext']);
    expect(new TextDecoder().decode(stored!.ciphertext)).not.toContain(fixturePhrase());
    expect(await decryptVault(stored!, 'fixture-wallet-password')).toBe(fixturePhrase());
    await expect(decryptVault(stored!, 'incorrect-fixture-password')).rejects.toThrow('incorrect or the vault is damaged');
    await deleteVault();
    expect(await readVault()).toBeUndefined();
  });

  it('uses fresh salt and IV and rejects ciphertext tampering', async () => {
    const first = await encryptVault(fixturePhrase(), 'fixture-wallet-password');
    const second = await encryptVault(fixturePhrase(), 'fixture-wallet-password');
    expect(new Uint8Array(first.salt)).not.toEqual(new Uint8Array(second.salt));
    expect(new Uint8Array(first.iv)).not.toEqual(new Uint8Array(second.iv));
    new Uint8Array(first.ciphertext)[0]! ^= 1;
    await expect(decryptVault(first, 'fixture-wallet-password')).rejects.toThrow('vault is damaged');
    await expect(decryptVault({ ...second, iterations: 1 }, 'fixture-wallet-password')).rejects.toThrow('Unsupported or damaged');
  });
});
