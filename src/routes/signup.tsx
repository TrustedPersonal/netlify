import { createFileRoute } from '@tanstack/react-router';
import { AuthForm } from '@/components/auth-form';
import { pageHead } from '@/lib/page-head';
export const Route = createFileRoute('/signup')({ head:()=>pageHead('Create Account','Create your personal Trusted Wallet VIP account.'), component:()=> <AuthForm mode="signup"/> });