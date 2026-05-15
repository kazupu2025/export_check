import { createClient } from '@supabase/supabase-js';

// サーバーサイド専用（service role key使用 — 管理用APIルートのみ）
export function createServerClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
}
