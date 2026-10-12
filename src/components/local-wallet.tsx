import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownToLine, ArrowUpRight, Check, CheckCircle2, Copy, ExternalLink, Fingerprint, KeyRound, LockKeyhole, RefreshCw, Send, ShieldCheck, TriangleAlert, Wallet } from 'lucide-react';
import QRCode from 'qrcode';
import { Button } from '@/components/ui/button';
import { Coin, LocalWalletShell } from '@/components/wallet-shell';
import { deriveWallet, type WalletKeys } from '@/lib/wallet/keys';
import { decryptVault, deleteVault, encryptVault, newRecoveryPhrase, normalizeMnemonic, readVault, writeVault } from '@/lib/wallet/vault';
import { explorerLink, formatAmount, networkIds, networks, parseAmount, type Network } from '@/lib/wallet/networks';
import { readBalance, readHistory, readPrices, readStatus } from '@/lib/wallet/api';
import { prepareTransfer, type PreparedTransfer } from '@/lib/wallet/transfers';

function message(error: unknown) {
  return error instanceof Error ? error.message : 'This operation could not be completed.';
}

function NetworkNotice() {
  return <div className="testnet-notice"><TriangleAlert size={19}/><div><strong>Testnet-only release</strong><span>Real blockchain transactions. Test assets have no monetary value. Never deposit mainnet funds.</span></div></div>;
}

function Onboarding({ existing, onReady }: { existing: boolean; onReady: (keys: WalletKeys) => void }) {
  const [mode, setMode] = useState<'choose' | 'create' | 'restore' | 'unlock'>(existing ? 'unlock' : 'choose');
  const [phrase, setPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [answers, setAnswers] = useState(['', '', '']);
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const hide = () => {
      if (document.visibilityState !== 'hidden') return;
      setPhrase('');
      setPassword('');
      setConfirm('');
      setAnswers(['', '', '']);
      setAcknowledged(false);
      setMode(existing ? 'unlock' : 'choose');
    };
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, [existing]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    let keys: WalletKeys | undefined;
    try {
      let mnemonic: string;
      if (mode === 'unlock') {
        const vault = await readVault();
        if (!vault) throw new Error('No local vault was found. Restore your recovery phrase.');
        mnemonic = await decryptVault(vault, password);
      } else {
        if (password !== confirm) throw new Error('The wallet passwords do not match.');
        if (!acknowledged) throw new Error('Confirm your recovery backup and the testnet-only warning.');
        mnemonic = normalizeMnemonic(phrase);
        if (mode === 'create' && [3, 10, 19].some((index, answer) => answers[answer]?.trim().toLowerCase() !== mnemonic.split(' ')[index])) throw new Error('Check the requested recovery words against your written backup.');
      }
      keys = await deriveWallet(mnemonic);
      if (mode !== 'unlock') await writeVault(await encryptVault(mnemonic, password));
      setPhrase('');
      setPassword('');
      setConfirm('');
      setAnswers(['', '', '']);
      onReady(keys);
    } catch (failure) {
      keys?.destroy();
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  }

  function choose(next: 'create' | 'restore') {
    setError('');
    setAcknowledged(false);
    if (next === 'create') {
      try { setPhrase(newRecoveryPhrase()); } catch { setError('Secure randomness is unavailable. Use a current browser over HTTPS.'); return; }
    } else setPhrase('');
    setMode(next);
  }

  return <div className="vault-onboarding"><div className="vault-intro"><span className="eyebrow">A DIFFERENT KIND OF CONTROL</span><h1>Your keys.<br/><span>Your wallet.</span></h1><p>Four networks. One recovery phrase. A private, encrypted vault that stays on this device.</p><div className="vault-assurance"><ShieldCheck/><div><strong>No server-held keys</strong><span>Transactions are signed in your browser.</span></div></div><div className="vault-assurance"><Fingerprint/><div><strong>A separate wallet password</strong><span>Your email account cannot recover this wallet.</span></div></div><div className="vault-supported">{networkIds.map(network => <div key={network}><Coin symbol={network}/><span>{network}</span></div>)}</div></div><section className="wallet-panel vault-card"><div className="vault-card-icon"><KeyRound/></div><span className="eyebrow">DEVICE VAULT</span><h2>{mode === 'unlock' ? 'Welcome back.' : mode === 'create' ? 'Back up your recovery phrase.' : mode === 'restore' ? 'Restore your wallet.' : 'Make it yours.'}</h2>{mode === 'choose' ? <><p>Create a new wallet or restore an existing English BIP39 phrase. Mainnet and BIP39 passphrases are not supported in this release.</p><Button className="w-full" onClick={() => choose('create')}><Wallet/>Create a wallet<ArrowUpRight/></Button><Button variant="outline" className="w-full mt-3" onClick={() => choose('restore')}><KeyRound/>Restore a wallet</Button></> : <form onSubmit={submit} autoComplete="off">{mode === 'create' && <><p>Write these 24 words down in order, offline and in private. Never share them, enter them on another website, or store a screenshot. Anyone with them can control the wallet.</p><ol className="recovery-grid" aria-label="Recovery phrase">{phrase.split(' ').map((word, index) => <li key={index}><span>{index + 1}</span>{word}</li>)}</ol><div className="recovery-challenge">{[3, 10, 19].map((index, answer) => <label key={index}>Word {index + 1}<input aria-label={`Recovery word ${index + 1}`} value={answers[answer] ?? ''} onChange={event => setAnswers(current => current.map((value, position) => position === answer ? event.target.value : value))} autoComplete="off" spellCheck={false} required/></label>)}</div></>}{mode === 'restore' && <div className="form-field"><label htmlFor="restore-phrase">English recovery phrase</label><textarea id="restore-phrase" className="wallet-textarea" value={phrase} onChange={event => setPhrase(event.target.value)} spellCheck={false} autoComplete="off" autoCapitalize="none" required rows={4}/><small>Standard derivation paths only. BIP39 passphrase wallets are not supported. {existing && 'This replaces the vault on this device after successful restoration. Back up the current wallet first.'}</small></div>}<div className="form-field"><label htmlFor="vault-password">{mode === 'unlock' ? 'Wallet password' : 'New wallet password'}</label><input id="vault-password" type="password" value={password} onChange={event => setPassword(event.target.value)} minLength={mode === 'unlock' ? 1 : 12} maxLength={1024} autoComplete={mode === 'unlock' ? 'current-password' : 'new-password'} required/></div>{mode !== 'unlock' && <><div className="form-field"><label htmlFor="confirm-vault-password">Confirm wallet password</label><input id="confirm-vault-password" type="password" value={confirm} onChange={event => setConfirm(event.target.value)} minLength={12} maxLength={1024} autoComplete="new-password" required/></div><label className="wallet-check"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} required/><span>I backed up my recovery phrase and understand this wallet uses test networks only. Clearing browser data without my phrase loses access.</span></label></>}{error && <p role="alert" className="form-error">{error}</p>}<Button type="submit" className="w-full" disabled={busy}>{busy ? 'Securing your vault…' : mode === 'unlock' ? 'Unlock wallet' : mode === 'create' ? 'Verify backup & create wallet' : 'Restore & encrypt wallet'}<LockKeyhole/></Button><Button className="w-full mt-3" type="button" variant="ghost" disabled={busy} onClick={() => { setPhrase(''); setPassword(''); setConfirm(''); setAnswers(['', '', '']); setError(''); if (existing) { setMode(mode === 'unlock' ? 'restore' : 'unlock'); setAcknowledged(false); } else setMode('choose'); }}>{existing ? mode === 'unlock' ? 'Forgot password? Restore with your phrase' : 'Back to unlock' : 'Back'}</Button></form>}{error && mode === 'choose' && <p role="alert" className="form-error">{error}</p>}<div className="vault-card-foot"><LockKeyhole size={14}/>AES-GCM encrypted · Local signing · No key uploads</div></section></div>;
}

function AssetRow({ network, address, selected, onSelect }: { network: Network; address: string; selected: boolean; onSelect: () => void }) {
  const balance = useQuery({ queryKey: ['chain-balance', network, address], queryFn: () => readBalance(network, address), refetchInterval: 30_000, retry: 1 });
  return <button className={`local-asset-row ${selected ? 'selected' : ''}`} onClick={onSelect} type="button"><Coin symbol={network}/><div><strong>{networks[network].name}</strong><small>{networks[network].network}</small></div><div className="asset-value"><strong>{balance.isPending ? 'Reading chain…' : balance.isError ? 'Unavailable' : `${formatAmount(BigInt(balance.data.confirmed), networks[network].decimals)} ${network}`}</strong><small>{balance.isError ? 'Provider error · select to retry' : 'On-chain balance'}</small></div><ArrowUpRight size={16}/></button>;
}

function Receive({ network, address }: { network: Network; address: string }) {
  const [qr, setQr] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true;
    setQr('');
    QRCode.toDataURL(address, { width: 256, margin: 3, errorCorrectionLevel: 'M' }).then(value => { if (active) setQr(value); }).catch(() => { if (active) setNotice('Unable to create the address QR code. Use the full address below.'); });
    return () => { active = false; };
  }, [address]);
  async function copy() {
    try { await navigator.clipboard.writeText(address); setNotice('Address copied. Verify the recipient address after pasting.'); } catch { setNotice('Clipboard access is unavailable. Select and copy the full address manually.'); }
  }
  return <section className="wallet-panel receive-card"><div className="receive-heading"><Coin symbol={network}/><div><h2>Receive {network}</h2><p>{networks[network].name} · {networks[network].network} only</p></div></div>{qr ? <img className="address-qr" src={qr} alt={`${network} receive address QR code`} width={256} height={256}/> : <div className="address-qr qr-placeholder">Generating address QR…</div>}<label className="eyebrow" htmlFor="receive-address">YOUR PUBLIC ADDRESS</label><textarea id="receive-address" className="wallet-textarea address-text" readOnly value={address} rows={2}/><div className="wallet-button-row"><Button onClick={copy}><Copy size={16}/>Copy address</Button><Button variant="outline" asChild><a href={explorerLink(network, 'address', address)} target="_blank" rel="noopener noreferrer">Explorer<ExternalLink size={16}/></a></Button>{qr && <Button variant="outline" asChild><a href={qr} download={`${network}-${networks[network].network}-address.png`}>Save QR</a></Button>}</div>{notice && <p className="wallet-inline-note" role="status">{notice}</p>}<div className="wallet-warning">Only send {networks[network].network} test assets to this address. EVM and Solana addresses do not identify their network; confirm the network with the sender. This wallet does not support mainnet deposits.</div></section>;
}

function ActivityView({ network, address }: { network: Network; address: string }) {
  const history = useQuery({ queryKey: ['chain-history', network, address], queryFn: () => readHistory(network, address), refetchInterval: 30_000, retry: 1 });
  return <section className="wallet-panel activity-panel"><div className="panel-title"><span>Latest on-chain activity</span><Button variant="ghost" size="sm" disabled={history.isFetching} onClick={() => void history.refetch()}><RefreshCw size={14}/>Refresh</Button></div>{history.isPending ? <div className="empty-state"><RefreshCw/>Reading {networks[network].network} history…</div> : history.isError ? <div className="empty-state"><TriangleAlert/><p role="alert">{message(history.error)}</p><p>No placeholder transactions are shown.</p></div> : history.data.length === 0 ? <div className="empty-state"><ArrowDownToLine/>The provider returned no transactions for this address.</div> : <div>{history.data.map(transaction => <a key={transaction.hash} className="activity-row" href={explorerLink(network, 'tx', transaction.hash)} target="_blank" rel="noopener noreferrer"><span className={`activity-icon ${transaction.direction}`}><ArrowUpRight size={17}/></span><div><strong>{transaction.direction === 'sent' ? 'Sent' : transaction.direction === 'received' ? 'Received' : 'Chain activity'} {network}</strong><small>{transaction.timestamp ? new Date(transaction.timestamp * 1000).toLocaleString() : 'Awaiting block time'} · {transaction.hash.slice(0, 10)}…{transaction.hash.slice(-6)}</small></div><div className="activity-value">{transaction.amount !== undefined && <strong>{formatAmount(BigInt(transaction.amount), networks[network].decimals)} {network}</strong>}<small className={`transaction-status ${transaction.status}`}>{transaction.status}</small></div><ExternalLink size={14}/></a>)}</div>}<div className="activity-foot"><span>Latest 25 records. SOL shows signature activity; BTC sent amounts include fees.</span><a href={explorerLink(network, 'address', address)} target="_blank" rel="noopener noreferrer">Full explorer history<ExternalLink size={13}/></a></div></section>;
}

function Submission({ network, hash }: { network: Network; hash: string }) {
  const status = useQuery({ queryKey: ['transaction-status', network, hash], queryFn: () => readStatus(network, hash), refetchInterval: query => query.state.data === 'confirmed' || query.state.data === 'failed' ? false : 8_000, retry: 1 });
  return <div className="submission-panel" role="status"><div><CheckCircle2 size={21}/><strong>Broadcast accepted</strong><span className={`transaction-status ${status.data ?? 'unknown'}`}>{status.isError ? 'Status unavailable' : status.data ?? 'Checking chain status'}</span></div><p>{status.data === 'confirmed' ? 'The chain provider reported the required confirmations or finality.' : status.data === 'failed' ? 'The chain reported that this transaction failed.' : 'A transaction ID is not a successful confirmation. Wait for the chain status.'}</p><a href={explorerLink(network, 'tx', hash)} target="_blank" rel="noopener noreferrer">{hash}<ExternalLink size={14}/></a>{status.isError && <p>{message(status.error)}</p>}</div>;
}

function SendView({ keys, network, isActive, onSubmitted }: { keys: WalletKeys; network: Network; isActive: () => boolean; onSubmitted: (network: Network, hash: string) => void }) {
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [prepared, setPrepared] = useState<PreparedTransfer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!prepared) return; const timer = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(timer); }, [prepared]);

  async function review(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const transaction = await prepareTransfer(keys, network, recipient.trim(), parseAmount(amount, networks[network].decimals));
      if (isActive()) { setPrepared(transaction); setNow(Date.now()); }
    } catch (failure) { if (isActive()) setError(message(failure)); } finally { setBusy(false); }
  }

  async function sign(event: FormEvent) {
    event.preventDefault();
    if (!prepared || !accepted) return;
    setBusy(true);
    setError('');
    try {
      const vault = await readVault();
      if (!vault) throw new Error('The local vault is unavailable.');
      await decryptVault(vault, password);
      setPassword('');
      if (!isActive()) throw new Error('The wallet locked before signing.');
      const hash = await prepared.broadcast();
      onSubmitted(network, hash);
      setPrepared(null);
      setRecipient('');
      setAmount('');
      setAccepted(false);
    } catch (failure) { setError(message(failure)); } finally { setPassword(''); setBusy(false); }
  }

  return <section className="wallet-panel transfer-card"><div className="receive-heading"><div className="vault-card-icon"><Send/></div><div><h2>{prepared ? 'Review before signing.' : `Send ${network}`}</h2><p>{networks[network].name} · {networks[network].network}</p></div></div>{!prepared ? <form onSubmit={review}><div className="form-field"><label htmlFor="send-recipient">Recipient address</label><input id="send-recipient" value={recipient} onChange={event => setRecipient(event.target.value)} autoComplete="off" spellCheck={false} required placeholder={`A ${networks[network].network} recipient`}/></div><div className="form-field"><label htmlFor="send-amount">Amount ({network})</label><input id="send-amount" value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" autoComplete="off" required placeholder="0.00"/></div><div className="wallet-warning">Native asset transfers only. Check the recipient and test network carefully. Transactions cannot be reversed.</div><Button disabled={busy} type="submit" className="w-full mt-5">{busy ? 'Verifying funds & estimating fee…' : 'Review transaction'}<ArrowUpRight/></Button></form> : <form onSubmit={sign}><dl className="transaction-review"><div><dt>Network</dt><dd>{networks[network].name} · {networks[network].network}</dd></div><div><dt>From</dt><dd>{keys.addresses[network]}</dd></div><div><dt>To</dt><dd>{prepared.to}</dd></div><div><dt>Amount</dt><dd>{formatAmount(prepared.amount, networks[network].decimals)} {network}</dd></div><div><dt>Network fee / maximum fee</dt><dd>{formatAmount(prepared.fee, networks[network].decimals)} {network}</dd></div><div><dt>Total / maximum debit</dt><dd>{formatAmount(prepared.amount + prepared.fee, networks[network].decimals)} {network}</dd></div><div><dt>Quote expires</dt><dd>{Math.max(0, Math.ceil((prepared.expiresAt - now) / 1000))} seconds</dd></div></dl><label className="wallet-check"><input type="checkbox" checked={accepted} onChange={event => setAccepted(event.target.checked)} required/><span>I verified the full recipient address and the {networks[network].network} test network.</span></label><div className="form-field"><label htmlFor="sign-password">Wallet password to authorize signing</label><input id="sign-password" type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required/></div><Button type="submit" className="w-full" disabled={busy || now >= prepared.expiresAt || !accepted}>{busy ? 'Signing locally & broadcasting…' : 'Sign & broadcast'}<LockKeyhole/></Button><Button className="w-full mt-3" type="button" variant="outline" disabled={busy} onClick={() => { setPrepared(null); setPassword(''); setAccepted(false); setError(''); }}>Cancel / get a new quote</Button></form>}{error && <p className="form-error mt-4" role="alert">{error}</p>}<p className="wallet-inline-note">If a broadcast times out, its outcome is unknown. Check the address on the explorer before trying again; sending twice can create two transfers.</p></section>;
}

function SecurityView({ onLock, onRemoved }: { onLock: () => void; onRemoved: () => void }) {
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function remove(event: FormEvent) {
    event.preventDefault();
    if (confirmation !== 'DELETE') return;
    setBusy(true);
    try { await deleteVault(); onRemoved(); } catch (failure) { setError(message(failure)); } finally { setBusy(false); }
  }
  return <div className="security-columns"><section className="wallet-panel security-card"><ShieldCheck className="text-primary" size={30}/><h2>Security, without shortcuts.</h2><dl className="security-list"><div><dt>Vault encryption</dt><dd>AES-256-GCM · PBKDF2-SHA256, 600,000 iterations</dd></div><div><dt>Automatic lock</dt><dd>After 5 minutes of inactivity, hiding this tab, or another wallet tab changing the vault</dd></div><div><dt>Recovery</dt><dd>Your recovery phrase only. Account password resets cannot recover keys.</dd></div><div><dt>Network access</dt><dd>Verified testnet chain IDs and genesis hashes. No mainnet switch.</dd></div></dl><p>Device malware, browser extensions, compromised application code, and a lost recovery phrase remain risks. Use a clean device. JavaScript cannot guarantee complete erasure of secrets from memory. This release is not independently audited.</p><Button variant="outline" onClick={onLock}><LockKeyhole/>Lock now</Button></section><section className="wallet-panel security-card"><TriangleAlert className="text-destructive" size={28}/><h2>Remove this device vault</h2><p>This removes the encrypted vault from this browser, not from the blockchain. Without a verified recovery backup, you lose access. Write <strong>DELETE</strong> only after securing your backup.</p><form onSubmit={remove}><div className="form-field"><label htmlFor="delete-vault">Confirmation</label><input id="delete-vault" value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" required/></div><Button variant="destructive" disabled={busy || confirmation !== 'DELETE'} type="submit">Remove encrypted vault</Button></form>{error && <p className="form-error" role="alert">{error}</p>}</section></div>;
}

export function LocalWalletPage() {
  const [keys, setKeys] = useState<WalletKeys | null>(null);
  const activeKeys = useRef<WalletKeys | null>(null);
  const [existing, setExisting] = useState<boolean | null>(null);
  const [storageError, setStorageError] = useState('');
  const [section, setSection] = useState('Overview');
  const [network, setNetwork] = useState<Network>('ETH');
  const [submission, setSubmission] = useState<{ network: Network; hash: string } | null>(null);
  const channel = useRef<BroadcastChannel | null>(null);
  const queryClient = useQueryClient();
  const lock = useCallback(() => {
    activeKeys.current?.destroy();
    activeKeys.current = null;
    setKeys(null);
    setSection('Overview');
  }, []);

  useEffect(() => {
    let active = true;
    readVault().then(vault => { if (active) setExisting(Boolean(vault)); }).catch(() => { if (active) setStorageError('Local vault storage is unavailable. Enable browser storage and use HTTPS.'); });
    if (typeof BroadcastChannel !== 'undefined') {
      const current = new BroadcastChannel('trusted-wallet-vault');
      current.onmessage = () => { lock(); void readVault().then(vault => setExisting(Boolean(vault))).catch(() => setStorageError('Unable to check this device vault. Reload before continuing.')); };
      channel.current = current;
    }
    return () => { active = false; activeKeys.current?.destroy(); activeKeys.current = null; channel.current?.close(); channel.current = null; };
  }, [lock]);

  useEffect(() => {
    if (!keys) return;
    let timer = window.setTimeout(lock, 5 * 60_000);
    const reset = () => { window.clearTimeout(timer); timer = window.setTimeout(lock, 5 * 60_000); };
    const hidden = () => { if (document.visibilityState === 'hidden') lock(); };
    window.addEventListener('pointerdown', reset);
    window.addEventListener('keydown', reset);
    document.addEventListener('visibilitychange', hidden);
    return () => { window.clearTimeout(timer); window.removeEventListener('pointerdown', reset); window.removeEventListener('keydown', reset); document.removeEventListener('visibilitychange', hidden); };
  }, [keys, lock]);

  const balance = useQuery({ queryKey: ['chain-balance', network, keys?.addresses[network]], queryFn: () => readBalance(network, keys!.addresses[network]), enabled: Boolean(keys), refetchInterval: keys ? 30_000 : false, retry: 1 });
  const prices = useQuery({ queryKey: ['market-prices'], queryFn: readPrices, enabled: Boolean(keys), refetchInterval: keys ? 60_000 : false, retry: 1 });

  function ready(next: WalletKeys) {
    activeKeys.current?.destroy();
    if (document.visibilityState === 'hidden') { next.destroy(); setExisting(true); setKeys(null); return; }
    activeKeys.current = next;
    setExisting(true);
    setKeys(next);
    channel.current?.postMessage('vault-changed');
  }

  function select(next: Network) { setNetwork(next); setSection('Overview'); }
  function submitted(selected: Network, hash: string) {
    setSubmission({ network: selected, hash });
    void queryClient.invalidateQueries({ queryKey: ['chain-balance'] });
    void queryClient.invalidateQueries({ queryKey: ['chain-history'] });
  }

  return <LocalWalletShell section={section} onSection={setSection} onLock={lock} unlocked={Boolean(keys)}><NetworkNotice/>{storageError ? <section className="wallet-panel empty-state"><TriangleAlert/><p role="alert">{storageError}</p></section> : existing === null ? <div className="wallet-panel empty-state"><LockKeyhole/>Checking this device for an encrypted vault…</div> : !keys ? <Onboarding existing={existing} onReady={ready}/> : <><div className="page-heading"><div><span className="eyebrow">YOUR PRIVATE VAULT</span><h1>{section === 'Overview' ? 'Wallet overview' : section}</h1><p>Independent of your email account. Connected to real test networks.</p></div><Button variant="outline" disabled={balance.isFetching} onClick={() => { void queryClient.invalidateQueries({ queryKey: ['chain-balance'] }); void queryClient.invalidateQueries({ queryKey: ['chain-history'] }); void prices.refetch(); }}><RefreshCw size={15}/>Refresh</Button></div><div className="network-switcher" role="group" aria-label="Select blockchain">{networkIds.map(selected => <button type="button" aria-pressed={network === selected} key={selected} className={network === selected ? 'selected' : ''} onClick={() => select(selected)}><Coin symbol={selected}/><span><strong>{selected}</strong><small>{networks[selected].network}</small></span>{network === selected && <Check size={15}/>}</button>)}</div>{submission && <Submission network={submission.network} hash={submission.hash}/>}<div key={network}>{section === 'Overview' ? <><section className="local-balance-card"><div><span className="eyebrow">{networks[network].name} · {networks[network].network}</span><h2>{balance.isPending ? 'Reading chain…' : balance.isError ? 'Balance unavailable' : formatAmount(BigInt(balance.data.confirmed), networks[network].decimals)}<span>{network}</span></h2>{balance.isError ? <p role="alert">{message(balance.error)}</p> : balance.data && BigInt(balance.data.pending) !== 0n ? <p>Pending change: {formatAmount(BigInt(balance.data.pending), networks[network].decimals)} {network}</p> : <p>Confirmed balance from the blockchain provider.</p>}<div className="wallet-button-row"><Button onClick={() => setSection('Send')}><Send size={16}/>Send</Button><Button variant="outline" onClick={() => setSection('Receive')}><ArrowDownToLine size={17}/>Receive</Button></div></div><div className="balance-watermark" aria-hidden="true"><Coin symbol={network}/></div><div className="balance-network-label"><span className="status-dot"/>{networks[network].network} · Mainnet disabled</div></section><div className="local-overview-grid"><section className="wallet-panel"><div className="panel-title">Native assets<span>4 test networks</span></div>{networkIds.map(selected => <AssetRow key={selected} network={selected} address={keys.addresses[selected]} selected={network === selected} onSelect={() => select(selected)}/>)}</section><section className="wallet-panel token-detail"><span className="eyebrow">ASSET DETAILS</span><div className="receive-heading"><Coin symbol={network}/><h2>{networks[network].name}</h2></div><dl><div><dt>Network</dt><dd>{networks[network].network}</dd></div><div><dt>Derivation</dt><dd>{networks[network].path}</dd></div><div><dt>Decimals</dt><dd>{networks[network].decimals}</dd></div><div><dt>Mainnet market reference</dt><dd>{prices.isPending ? 'Loading…' : prices.isError ? 'Unavailable' : prices.data[network].usd.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}</dd></div>{prices.data && <div><dt>Quote updated</dt><dd>{new Date(prices.data[network].updatedAt * 1000).toLocaleTimeString()}</dd></div>}</dl>{prices.isError && <p role="alert">Live market quotes are unavailable.</p>}<p>CoinGecko mainnet reference prices are not valuations of your test assets. No simulated or cached fallback price is used.</p><a href={explorerLink(network, 'address', keys.addresses[network])} target="_blank" rel="noopener noreferrer">Verify address on explorer<ExternalLink size={14}/></a></section></div><div className="mt-6"><ActivityView network={network} address={keys.addresses[network]}/></div></> : section === 'Receive' ? <Receive network={network} address={keys.addresses[network]}/> : section === 'Send' ? <SendView keys={keys} network={network} isActive={() => activeKeys.current === keys} onSubmitted={submitted}/> : section === 'Activity' ? <ActivityView network={network} address={keys.addresses[network]}/> : <SecurityView onLock={lock} onRemoved={() => { lock(); setExisting(false); setSubmission(null); channel.current?.postMessage('vault-removed'); }}/>}</div></>}</LocalWalletShell>;
}
