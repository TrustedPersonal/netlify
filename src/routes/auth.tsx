import { createFileRoute } from '@tanstack/react-router';
import { AuthForm } from '@/components/auth-form';
import { pageHead } from '@/lib/page-head';
export const Route = createFileRoute('/auth')({ head:()=>pageHead('Login','Sign in to your Trusted Wallet VIP account.'), component:()=> <AuthForm mode="login"/> });