import { createFileRoute } from '@tanstack/react-router';
import { AuthForm } from '@/components/auth-form';
import { pageHead } from '@/lib/page-head';
export const Route = createFileRoute('/forgot-password')({ head:()=>pageHead('Forgot Password','Recover access to your Trusted Wallet account.'), component:()=> <AuthForm mode="forgot"/> });