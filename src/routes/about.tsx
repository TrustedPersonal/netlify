import { createFileRoute } from '@tanstack/react-router';
import { InfoPage } from '@/components/info-page';
import { pageHead } from '@/lib/page-head';
export const Route=createFileRoute('/about')({head:()=>pageHead("About Trusted Wallet","The Trusted Wallet VIP experience."),component:()=> <InfoPage {...{"title": "About Trusted Wallet", "subtitle": "The Trusted Wallet VIP experience.", "sections": [{"heading": "One simple account", "copy": "Trusted Wallet brings account balances and custom token records into a refined black-and-gold workspace."}, {"heading": "Current availability", "copy": "Real account registration, profile management and administrator tools are available. Blockchain custody and financial services are not connected."}]}}/>});
