import { HDKey } from '@scure/bip32';
import { mnemonicToSeed } from '@scure/bip39';
import { p2wpkh, TEST_NETWORK, type Transaction as BitcoinTransaction } from '@scure/btc-signer';
import { hmac } from '@noble/hashes/hmac.js';
import { sha512 } from '@noble/hashes/sha2.js';
import { privateKeyToAccount } from 'viem/accounts';
import { toHex, type Hex, type TransactionSerializable } from 'viem';
import { PublicKey } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519.js';
import { networks, type Addresses } from './networks';
import { normalizeMnemonic } from './vault';

export function deriveSolanaSeed(seed: Uint8Array) {
  let digest = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed);
  try {
    for (const index of [44, 501, 0, 0]) {
      const data = new Uint8Array(37);
      data.set(digest.subarray(0, 32), 1);
      new DataView(data.buffer).setUint32(33, index + 0x80000000, false);
      const next = hmac(sha512, digest.subarray(32), data);
      digest.fill(0);
      data.fill(0);
      digest = next;
    }
    return digest.slice(0, 32);
  } finally {
    digest.fill(0);
  }
}

export type WalletKeys = { addresses: Addresses; bitcoinPublic: Uint8Array; signBitcoin: (transaction: BitcoinTransaction) => void; signSolana: (message: Uint8Array) => Uint8Array; signEvm: (transaction: TransactionSerializable) => Promise<Hex>; isUnlocked: () => boolean; destroy: () => void };

export async function deriveWallet(mnemonic: string): Promise<WalletKeys> {
  const seed = await mnemonicToSeed(normalizeMnemonic(mnemonic));
  mnemonic = '';
  const root = HDKey.fromMasterSeed(seed);
  const bitcoinNode = root.derive(networks.BTC.path);
  const evmNode = root.derive(networks.ETH.path);
  try {
    if (!bitcoinNode.privateKey || !bitcoinNode.publicKey || !evmNode.privateKey) throw new Error('Wallet derivation failed.');
    const bitcoin = bitcoinNode.privateKey.slice();
    const bitcoinPublic = bitcoinNode.publicKey.slice();
    const evm = evmNode.privateKey.slice();
    const solana = deriveSolanaSeed(seed);
    const bitcoinAddress = p2wpkh(bitcoinPublic, TEST_NETWORK).address;
    if (!bitcoinAddress) throw new Error('Unable to derive the Bitcoin address.');
    const evmAddress = privateKeyToAccount(toHex(evm)).address;
    const addresses = { BTC: bitcoinAddress, ETH: evmAddress, BNB: evmAddress, SOL: new PublicKey(ed25519.getPublicKey(solana)).toBase58() };
    let unlocked = true;
    const requireUnlocked = () => { if (!unlocked) throw new Error('The wallet is locked.'); };
    return Object.freeze({
      addresses: Object.freeze(addresses),
      bitcoinPublic,
      signBitcoin(transaction: BitcoinTransaction) { requireUnlocked(); transaction.sign(bitcoin); },
      signSolana(message: Uint8Array) { requireUnlocked(); return ed25519.sign(message, solana); },
      async signEvm(transaction: TransactionSerializable) { requireUnlocked(); return privateKeyToAccount(toHex(evm)).signTransaction(transaction); },
      isUnlocked: () => unlocked,
      destroy() { unlocked = false; bitcoin.fill(0); evm.fill(0); solana.fill(0); },
    });
  } finally {
    seed.fill(0);
    root.wipePrivateData();
    bitcoinNode.wipePrivateData();
    evmNode.wipePrivateData();
  }
}
