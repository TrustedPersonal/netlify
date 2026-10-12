import { createFileRoute } from '@tanstack/react-router';
import { InfoPage } from '@/components/info-page';
import { pageHead } from '@/lib/page-head';
export const Route=createFileRoute('/features')({head:()=>pageHead("Wallet Features","A clear view of your digital asset account."),component:()=> <InfoPage {...{"title": "Wallet Features", "subtitle": "A clear view of your digital asset account.", "sections": [{"heading": "Your wallet overview", "copy": "View your assigned asset balances, token details and account totals in one place."}, {"heading": "Custom tokens", "copy": "Administrators can add custom token records and assign account balances."}, {"heading": "Account access", "copy": "Email and password or Google sign-in gives you access to your personal account."}]}}/>});
