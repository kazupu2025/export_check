import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ role: null }, { status: 401 });
  }

  const db = createServerClient();
  const { data } = await db.from('profiles').select('role').eq('id', user.id).single();

  return NextResponse.json({ role: data?.role ?? 'user' });
}
