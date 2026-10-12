import { createFileRoute, redirect } from '@tanstack/react-router';
import { pageHead } from '@/lib/page-head';
export const Route = createFileRoute('/login')({ head:()=>pageHead('Account Login','Access your Trusted Wallet account.'), beforeLoad:()=>{throw redirect({to:'/auth'});} });