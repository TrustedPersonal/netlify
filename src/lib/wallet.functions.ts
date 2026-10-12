import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

export const getWallet = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const [profile, roles, balances, tokens] = await Promise.all([
    context.supabase.from('profiles').select('*').eq('id', context.userId).single(),
    context.supabase.from('user_roles').select('role').eq('user_id', context.userId),
    context.supabase.from('balances').select('*, tokens(*)').eq('user_id', context.userId),
    context.supabase.from('tokens').select('*'),
  ]);
  if (profile.error) throw new Error(profile.error.message);
  if (balances.error) throw new Error(balances.error.message);
  return { profile: profile.data, admin: roles.data?.some(r => r.role === 'admin') ?? false, balances: balances.data ?? [], tokens: tokens.data ?? [] };
});

export const getAdmin = createServerFn({ method: 'GET' }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  const { data: allowed, error } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
  if (error || !allowed) throw new Error('Administrator access required.');
  const [profiles, tokens, balances] = await Promise.all([context.supabase.from('profiles').select('*'), context.supabase.from('tokens').select('*'), context.supabase.from('balances').select('*, tokens(*)')]);
  if (profiles.error || tokens.error || balances.error) throw new Error('Unable to load account records.');
  return { profiles: profiles.data ?? [], tokens: tokens.data ?? [], balances: balances.data ?? [] };
});

export const saveToken = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ name: z.string().min(1).max(80), symbol: z.string().min(1).max(12), network: z.string().min(1), contract_address: z.string().max(200), decimals: z.number().int().min(0).max(30), price: z.number().min(0) })).handler(async ({ data, context }) => {
  const { data: allowed } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
  if (!allowed) throw new Error('Administrator access required.');
  const { error } = await context.supabase.from('tokens').insert(data);
  if (error) throw new Error(error.message);
  return { success: true };
});

export const assignBalance = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth]).inputValidator(z.object({ user_id: z.string().uuid(), token_id: z.string().uuid(), amount: z.number().min(0).finite() })).handler(async ({ data, context }) => {
  const { data: allowed } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
  if (!allowed) throw new Error('Administrator access required.');
  const { error } = await context.supabase.from('balances').upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: 'user_id,token_id' });
  if (error) throw new Error(error.message);
  return { success: true };
});