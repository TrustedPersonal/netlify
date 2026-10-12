import { Address, p2wpkh, TEST_NETWORK, Transaction as BitcoinTransaction } from '@scure/btc-signer';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { PublicKey, SystemProgram, Transaction as SolanaTransaction } from '@solana/web3.js';
import { Buffer } from 'buffer';
import { isAddress, keccak256, toHex, type Hex } from 'viem';
import { base58 } from '@scure/base';
import { bitcoinApi, rpc } from './api';
import { networks, type Network } from './networks';
import { type WalletKeys } from './keys';

export type Utxo = { txid: string; vout: number; value: number; status: { confirmed: boolean } };
export type PreparedTransfer = { network: Network; to: string; amount: bigint; fee: bigint; expiresAt: number; broadcast: () => Promise<string> };

export function validateRecipient(network: Network, value: string) {
  if (network === 'BTC') {
    try { Address(TEST_NETWORK).decode(value); } catch { throw new Error('Enter a Bitcoin Signet address, not a mainnet address.'); }
  } else if (network === 'SOL') {
    try { if (!PublicKey.isOnCurve(new PublicKey(value))) throw new Error(); } catch { throw new Error('Enter a valid Solana account address. Program-derived accounts are not supported.'); }
  } else if (!isAddress(value, { strict: true }) || /^0x0{40}$/i.test(value)) {
    throw new Error('Enter a valid, nonzero EVM address with a correct checksum.');
  }
}

export function selectBitcoinInputs(utxos: Utxo[], amount: bigint, feeRate: number) {
  if (!Number.isFinite(feeRate) || feeRate < 1 || feeRate > 1000) throw new Error('The provider returned an unsafe Bitcoin fee rate.');
  const selected: Utxo[] = [];
  let total = 0n;
  for (const utxo of utxos.filter(item => item.status.confirmed).sort((left, right) => right.value - left.value)) {
    if (!Number.isSafeInteger(utxo.value) || utxo.value <= 0 || !Number.isSafeInteger(utxo.vout) || utxo.vout < 0 || !/^[0-9a-f]{64}$/i.test(utxo.txid)) throw new Error('Invalid Bitcoin UTXO data.');
    selected.push(utxo);
    total += BigInt(utxo.value);
    const fee = BigInt(Math.ceil((12 + selected.length * 69 + 2 * 43) * feeRate));
    if (total >= amount + fee) {
      const leftover = total - amount - fee;
      return { selected, fee: leftover >= 546n ? fee : total - amount, change: leftover >= 546n ? leftover : 0n };
    }
  }
  throw new Error('Insufficient confirmed BTC to cover the amount and network fee.');
}

export async function prepareTransfer(keys: WalletKeys, network: Network, to: string, amount: bigint): Promise<PreparedTransfer> {
  if (amount <= 0n) throw new Error('The amount must be greater than zero.');
  validateRecipient(network, to);
  if (to.toLowerCase() === keys.addresses[network].toLowerCase() && network !== 'SOL') throw new Error('Choose a recipient other than this wallet.');
  if (network === 'SOL' && to === keys.addresses.SOL) throw new Error('Choose a recipient other than this wallet.');
  let fee: bigint;
  let signAndBroadcast: () => Promise<string>;
  if (network === 'BTC') {
    if (amount < 546n) throw new Error('Send at least 546 satoshis to avoid a dust output.');
    const [utxos, rates] = await Promise.all([bitcoinApi<Utxo[]>('utxos', { address: keys.addresses.BTC }), bitcoinApi<Record<string, number>>('fees')]);
    const feeRate = rates['6'] ?? rates['3'] ?? rates['1'];
    if (feeRate === undefined) throw new Error('No live Bitcoin fee estimate is available.');
    const selected = selectBitcoinInputs(utxos, amount, feeRate);
    if (selected.selected.length > 20) throw new Error('This transfer requires too many inputs. Use a specialist Bitcoin wallet to consolidate them.');
    const payment = p2wpkh(keys.bitcoinPublic, TEST_NETWORK);
    const transaction = new BitcoinTransaction();
    for (const utxo of selected.selected) {
      const raw = await bitcoinApi<string>('raw', { hash: utxo.txid });
      const previous = BitcoinTransaction.fromRaw(hexToBytes(raw));
      const output = previous.getOutput(utxo.vout);
      if (previous.id !== utxo.txid || output.amount !== BigInt(utxo.value) || !output.script || bytesToHex(output.script) !== bytesToHex(payment.script)) throw new Error('Bitcoin input verification failed.');
      transaction.addInput({ txid: utxo.txid, index: utxo.vout, witnessUtxo: { amount: BigInt(utxo.value), script: payment.script } });
    }
    transaction.addOutputAddress(to, amount, TEST_NETWORK);
    if (selected.change) transaction.addOutputAddress(keys.addresses.BTC, selected.change, TEST_NETWORK);
    fee = selected.fee;
    signAndBroadcast = async () => {
      keys.signBitcoin(transaction);
      transaction.finalize();
      const hash = await bitcoinApi<string>('broadcast', { raw: bytesToHex(transaction.extract()) });
      if (hash !== transaction.id) throw new Error('Broadcast returned an unexpected transaction ID. Check the explorer before retrying.');
      return hash;
    };
  } else if (network === 'SOL') {
    if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('The Solana amount is too large.');
    const [block, balance] = await Promise.all([
      rpc<{ value: { blockhash: string; lastValidBlockHeight: number } }>('SOL', 'getLatestBlockhash', [{ commitment: 'confirmed' }]),
      rpc<{ value: number }>('SOL', 'getBalance', [keys.addresses.SOL, { commitment: 'confirmed' }]),
    ]);
    const transaction = new SolanaTransaction({ recentBlockhash: block.value.blockhash, feePayer: new PublicKey(keys.addresses.SOL) });
    transaction.add(SystemProgram.transfer({ fromPubkey: new PublicKey(keys.addresses.SOL), toPubkey: new PublicKey(to), lamports: amount }));
    const estimate = await rpc<{ value: number | null }>('SOL', 'getFeeForMessage', [Buffer.from(transaction.serializeMessage()).toString('base64'), { commitment: 'confirmed' }]);
    if (estimate.value === null || !Number.isSafeInteger(estimate.value) || estimate.value <= 0) throw new Error('Unable to obtain a valid Solana fee estimate.');
    fee = BigInt(estimate.value);
    if (BigInt(balance.value) < amount + fee) throw new Error('Insufficient SOL to cover the amount and network fee.');
    signAndBroadcast = async () => {
      transaction.addSignature(new PublicKey(keys.addresses.SOL), Buffer.from(keys.signSolana(transaction.serializeMessage())));
      if (!transaction.verifySignatures()) throw new Error('Local Solana signature validation failed.');
      const hash = await rpc<string>('SOL', 'sendTransaction', [Buffer.from(transaction.serialize()).toString('base64'), { encoding: 'base64', skipPreflight: false, preflightCommitment: 'confirmed', maxRetries: 3 }]);
      if (!transaction.signature || hash !== base58.encode(transaction.signature)) throw new Error('Unexpected Solana signature returned. Check the explorer before retrying.');
      return hash;
    };
  } else {
    const from = keys.addresses[network] as Hex;
    const [chainId, nonce, gasPriceHex, balanceHex, code] = await Promise.all([
      rpc<Hex>(network, 'eth_chainId'), rpc<Hex>(network, 'eth_getTransactionCount', [from, 'pending']),
      rpc<Hex>(network, 'eth_gasPrice'), rpc<Hex>(network, 'eth_getBalance', [from, 'pending']),
      rpc<Hex>(network, 'eth_getCode', [to, 'latest']),
    ]);
    if (Number(BigInt(chainId)) !== networks[network].chainId) throw new Error('The provider is connected to the wrong chain.');
    if (code !== '0x') throw new Error('Only native transfers to ordinary accounts are supported. Contract interactions are disabled.');
    const gas = BigInt(await rpc<Hex>(network, 'eth_estimateGas', [{ from, to, value: toHex(amount) }]));
    const gasPrice = BigInt(gasPriceHex);
    if (gas <= 0n || gas > 100_000n || gasPrice <= 0n || gasPrice > 1_000_000_000_000n || BigInt(nonce) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('The provider returned unsafe transaction parameters.');
    fee = gas * gasPrice;
    if (BigInt(balanceHex) < amount + fee) throw new Error(`Insufficient ${network} to cover the amount and maximum network fee.`);
    signAndBroadcast = async () => {
      const raw = await keys.signEvm({ type: 'legacy', chainId: networks[network].chainId, nonce: Number(BigInt(nonce)), to: to as Hex, value: amount, gas, gasPrice });
      if (!keys.isUnlocked()) throw new Error('The wallet locked before broadcast.');
      const hash = await rpc<string>(network, 'eth_sendRawTransaction', [raw]);
      if (hash.toLowerCase() !== keccak256(raw).toLowerCase()) throw new Error('Unexpected transaction hash returned. Check the explorer before retrying.');
      return hash;
    };
  }
  const expiresAt = Date.now() + 60_000;
  let broadcastAttempted = false;
  return { network, to, amount, fee, expiresAt, async broadcast() {
    if (Date.now() > expiresAt) throw new Error('The fee quote expired. Review a new transaction before signing.');
    if (broadcastAttempted) throw new Error('Broadcast was already attempted. Check transaction history before preparing another transfer.');
    if (!keys.isUnlocked()) throw new Error('The wallet is locked.');
    broadcastAttempted = true;
    return signAndBroadcast();
  } };
}
