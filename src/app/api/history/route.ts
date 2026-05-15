import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { requireAuth } from '@/lib/require-auth';

// GET /api/history — 判定履歴を新しい順に最大200件取得
export async function GET() {
  const auth = await requireAuth();
  if (auth.error) return auth.error;
  const db = createServerClient();
  const { data, error } = await db
    .from('judgment_history')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
