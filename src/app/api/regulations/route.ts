import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  try {
    const db = createServerClient();
    const { data: rules, error } = await db
      .from('regulation_rules')
      .select('*')
      .order('regulation_item')
      .order('priority');

    if (error) throw new Error(error.message);
    return NextResponse.json({ rules: rules ?? [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
