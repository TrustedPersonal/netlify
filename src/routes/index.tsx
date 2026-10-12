import { createFileRoute, Link } from '@tanstack/react-router';
import { Coins, ShieldCheck, Zap, Globe, UserRound, ArrowUpRight, Crown } from 'lucide-react';
import { Header, Footer, FeatureStrip, Coin } from '@/components/wallet-shell';
import { Button } from '@/components/ui/button';
import hero from '@/assets/wallet-hero.jpg';
import { pageHead } from '@/lib/page-head';
import { supabase } from '@/integrations/supabase/client';
import { isSupabaseConfigured } from '@/integrations/supabase/config';
import { useEffect, useState } from 'react';

export const Route = createFileRoute('/')({ head: () => pageHead('Home', 'Trusted Wallet VIP — your personal digital asset account in a premium black and gold experience.'), component: Index });
function Index() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let active = true;
    supabase.auth.getUser()
      .then(({ data }) => { if (active) setSignedIn(Boolean(data.user)); })
      .catch(() => { if (active) setSignedIn(false); });
    return () => { active = false; };
  }, []);
  return <><Header signedIn={signedIn}/><section className="home-hero"><img className="hero-image" src={hero} alt="Gold VIP shield with Bitcoin, Ethereum and Solana coins" width={1536} height={1024}/><div className="hero-content"><span className="eyebrow">WELCOME TO TRUSTED WALLET VIP</span><h1>Secure. Personal.<br/>Yours.</h1><p>Your keys stay on your device. Explore four real test networks with an encrypted local vault and a considered black-and-gold experience.</p><div className="hero-buttons"><Button size="lg" asChild><a href="/wallet">Open wallet<ArrowUpRight/></a></Button><Button size="lg" variant="outline" asChild><Link to="/auth">Login</Link></Button></div><div className="hero-points">{[{icon:Coins,title:'Four Test Networks',copy:'BTC · ETH · SOL · BNB'},{icon:ShieldCheck,title:'Local Signing',copy:'Your Keys, Your Authorization'},{icon:Zap,title:'Live Chain Data',copy:'No Simulated Balances'}].map(point=><div className="hero-point" key={point.title}><point.icon/><div><strong>{point.title}</strong><small>{point.copy}</small></div></div>)}</div></div></section><section className="home-bottom"><div className="section-label"><div><span className="eyebrow">THE VIP STANDARD</span><h2 className="mt-2">One vault. Four networks.</h2></div><span className="flex items-center gap-2 text-primary text-xs"><Crown size={17}/> Testnet-first release</span></div><div className="overview-grid"><article className="wallet-panel overview-item"><Globe/><h3>Your assets, verified on-chain.</h3><p>Read native balances directly from Bitcoin Signet, Ethereum Sepolia, Solana Devnet, and BNB Testnet.</p><div className="mini-coins"><Coin symbol="ETH"/><Coin symbol="SOL"/><Coin symbol="BTC"/><Coin symbol="BNB"/></div></article><article className="wallet-panel overview-item"><ShieldCheck/><h3>Separate keys. Separate access.</h3><p>A local wallet password protects your encrypted recovery phrase. Your email login is not your wallet recovery.</p><Button variant="link" asChild className="px-0 mt-3"><Link to="/security">Explore security <ArrowUpRight/></Link></Button></article><article className="wallet-panel overview-item"><UserRound/><h3>A clear place to begin.</h3><p>Create or restore a wallet without an email account. Test assets have no monetary value; mainnet remains disabled.</p><Button variant="link" asChild className="px-0 mt-3"><a href="/wallet">Set up your wallet <ArrowUpRight/></a></Button></article></div><FeatureStrip/></section><Footer/></>;
}
