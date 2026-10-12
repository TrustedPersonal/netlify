import { createFileRoute } from '@tanstack/react-router';
import { AuthForm } from '@/components/auth-form';
import { pageHead } from '@/lib/page-head';
export const Route = createFileRoute('/reset-password')({ head:()=>pageHead('Reset Password','Set a new password for your Trusted Wallet account.'), component:()=> <AuthForm mode="reset"/> });