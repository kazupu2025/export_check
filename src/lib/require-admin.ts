import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createServerClient } from '@/lib/supabase';

// admin権限を確認し、非adminなら401/403レスポンスを返す
// 戻り値が NextResponse の場合はそのまま return する
export async function requireAdmin(): Promise<{ error: NextResponse } | { error: null }> {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return { error: NextResponse.json({ message: '認証が必要です' }, { status: 401 }) };
  }

  const db = createServerClient();
  const { data } = await db.from('profiles').select('role').eq('id', user.id).single();

  if (data?.role !== 'admin') {
    return { error: NextResponse.json({ message: '管理者権限が必要です' }, { status: 403 }) };
  }

  return { error: null };
}
