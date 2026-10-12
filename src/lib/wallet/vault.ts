import { generateMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

export type EncryptedVault = { version: 1; iterations: number; salt: ArrayBuffer; iv: ArrayBuffer; ciphertext: ArrayBuffer };
const iterations = 600_000;
const databaseName = 'trusted-wallet-vault';
const additionalData = new TextEncoder().encode('trusted-wallet:v1:testnets');

export function normalizeMnemonic(value: string) {
  const mnemonic = value.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' ');
  if (!validateMnemonic(mnemonic, wordlist)) throw new Error('Enter a valid English BIP39 recovery phrase.');
  return mnemonic;
}

export function newRecoveryPhrase() {
  return generateMnemonic(wordlist, 256);
}

function assertCrypto() {
  if (!globalThis.crypto?.subtle) throw new Error('Wallet encryption requires HTTPS and Web Crypto support.');
}

async function encryptionKey(password: string, salt: ArrayBuffer, rounds: number) {
  assertCrypto();
  const encoded = new TextEncoder().encode(password);
  try {
    const material = await crypto.subtle.importKey('raw', encoded, 'PBKDF2', false, ['deriveKey']);
    return await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  } finally {
    encoded.fill(0);
  }
}

export async function encryptVault(mnemonic: string, password: string): Promise<EncryptedVault> {
  assertCrypto();
  if (password.length < 12 || password.length > 1024) throw new Error('Use a unique wallet password of 12–1024 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(32)).buffer;
  const iv = crypto.getRandomValues(new Uint8Array(12)).buffer;
  const plaintext = new TextEncoder().encode(normalizeMnemonic(mnemonic));
  try {
    const key = await encryptionKey(password, salt, iterations);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData }, key, plaintext);
    return { version: 1, iterations, salt, iv, ciphertext };
  } finally {
    plaintext.fill(0);
  }
}

export async function decryptVault(vault: EncryptedVault, password: string) {
  assertCrypto();
  if (vault.version !== 1 || vault.iterations !== iterations || vault.salt.byteLength !== 32 || vault.iv.byteLength !== 12 || vault.ciphertext.byteLength > 4096) {
    throw new Error('Unsupported or damaged wallet vault. Restore using your recovery phrase.');
  }
  let plaintext: ArrayBuffer | undefined;
  try {
    const key = await encryptionKey(password, vault.salt, vault.iterations);
    plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: vault.iv, additionalData }, key, vault.ciphertext);
    return normalizeMnemonic(new TextDecoder().decode(plaintext));
  } catch {
    throw new Error('The wallet password is incorrect or the vault is damaged.');
  } finally {
    if (plaintext) new Uint8Array(plaintext).fill(0);
  }
}

function openVaultDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) return Promise.reject(new Error('This browser does not support secure local wallet storage.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(databaseName, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('vault');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Local wallet storage is unavailable.'));
    request.onblocked = () => reject(new Error('Close other wallet tabs before accessing local storage.'));
  });
}

async function vaultRequest(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<EncryptedVault | undefined> {
  const database = await openVaultDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction('vault', mode);
      const request = operation(transaction.objectStore('vault'));
      transaction.oncomplete = () => resolve(request.result);
      transaction.onerror = transaction.onabort = () => reject(new Error('Unable to access the encrypted local vault.'));
    });
  } finally {
    database.close();
  }
}

export const readVault = () => vaultRequest('readonly', store => store.get('active'));
export const writeVault = (vault: EncryptedVault) => vaultRequest('readwrite', store => store.put(vault, 'active'));
export const deleteVault = () => vaultRequest('readwrite', store => store.delete('active'));
