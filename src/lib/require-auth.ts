import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

// ログイン済みであることを確認する（ロール不問）
export async function requireAuth(): Promise<{ error: NextResponse } | { error: null }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ message: '認証が必要です' }, { status: 401 }) };
  }

  return { error: null };
}
