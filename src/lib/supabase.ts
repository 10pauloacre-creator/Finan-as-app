'use client';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  return url.startsWith('https://') && key.length > 20;
}

declare global {
  // eslint-disable-next-line no-var
  var _supabaseClient: SupabaseClient | undefined;
}

export function getSupabase(): SupabaseClient {
  if (!globalThis._supabaseClient) {
    if (!isSupabaseConfigured()) throw new Error('Supabase não configurado');
    globalThis._supabaseClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return globalThis._supabaseClient;
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_t, prop) {
    return getSupabase()[prop as keyof SupabaseClient];
  },
});
