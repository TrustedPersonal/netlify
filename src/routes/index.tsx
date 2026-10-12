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
  return <><Header signedIn={signedIn}/><section className="home-hero"><img className="hero-image" src={hero} alt="Gold VIP shield with Bitcoin, Ethereum and Solana coins" width={1536} height={1024}/><div className="hero-content"><span className="eyebrow">WELCOME TO TRUSTED WALLET VIP</span><h1>Secure. Personal.<br/>Yours.</h1><p>Your digital asset account, with protected access, a clear balance overview and a seamless VIP experience.</p><div className="hero-buttons"><Button size="lg" asChild><Link to={signedIn?'/client':'/signup'}>{signedIn?'Open My Wallet':'Create Account'}<ArrowUpRight/></Link></Button><Button size="lg" variant="outline" asChild><Link to="/auth">Login</Link></Button></div><div className="hero-points">{[{icon:Coins,title:'Multi-Chain Support',copy:'ETH · SOL · BTC · More'},{icon:ShieldCheck,title:'Bank-Grade Security',copy:'Your Account, Protected'},{icon:Zap,title:'Easy to Use',copy:'Simple & Powerful'}].map(p=><div className="hero-point" key={p.title}><p.icon/><div><strong>{p.title}</strong><small>{p.copy}</small></div></div>)}</div></div></section><section className="home-bottom"><div className="section-label"><div><span className="eyebrow">THE VIP STANDARD</span><h2 className="mt-2">One wallet. Every possibility.</h2></div><span className="flex items-center gap-2 text-primary text-xs"><Crown size={17}/> Built for your world</span></div><div className="overview-grid"><article className="wallet-panel overview-item"><Globe/><h3>Your assets, all in one place.</h3><p>A clear overview of your wallet balances and custom tokens, in one beautifully simple account.</p><div className="mini-coins"><Coin symbol="ETH"/><Coin symbol="SOL"/><Coin symbol="BTC"/><Coin symbol="USDT"/></div></article><article className="wallet-panel overview-item"><ShieldCheck/><h3>Security at every step.</h3><p>Protected account access and private balance records. Your account, your peace of mind.</p><Button variant="link" asChild className="px-0 mt-3"><Link to="/security">Explore security <ArrowUpRight/></Link></Button></article><article className="wallet-panel overview-item"><UserRound/><h3>A truly VIP experience.</h3><p>From your first account to managing your tokens, every detail is designed around you.</p><Button variant="link" asChild className="px-0 mt-3"><Link to="/signup">Join Trusted Wallet <ArrowUpRight/></Link></Button></article></div><FeatureStrip/></section><Footer/></>;
}
