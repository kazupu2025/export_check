import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET() {
  try {
    const db = createServerClient();

    // law_items から取得。条ごとにグループ化しやすいよう article_num でソート
    const { data: items, error } = await db
      .from('law_items')
      .select('id, article_num, item_num, item_text, full_text, source_law, fetched_at')
      .order('article_num')
      .order('item_num');

    if (error) throw new Error(error.message);

    // 最終取得日時（最新レコードの fetched_at）
    const fetchedAt = items && items.length > 0
      ? items.reduce((latest, r) => r.fetched_at > latest ? r.fetched_at : latest, items[0].fetched_at)
      : null;

    return NextResponse.json({
      items: items ?? [],
      totalCount: items?.length ?? 0,
      fetchedAt,
      sourceLaw: items?.[0]?.source_law ?? null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
