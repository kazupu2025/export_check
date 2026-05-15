import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { extractThresholdsFromText } from '@/lib/regex-extractor';
import { requireAdmin } from '@/lib/require-admin';

// POST /api/extract-thresholds
// law_items の全レコードから正規表現で閾値を抽出して regulation_thresholds に保存（LLM不使用）
export async function POST() {
  const auth = await requireAdmin();
  if (auth.error) return auth.error;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        const db = createServerClient();

        // 既存の抽出結果をクリア
        await db.from('regulation_thresholds').delete().neq('id', '00000000-0000-0000-0000-000000000000');

        const { data: items, error } = await db
          .from('law_items')
          .select('id, article_num, item_num, full_text, law_id')
          .order('article_num')
          .order('item_num');

        if (error || !items) throw new Error(error?.message ?? 'law_items取得失敗');

        // 閾値キーワードを含む条文だけに絞り込む
        const targetItems = items.filter((i) =>
          /以上|以下|超える|超過|未満/.test(i.full_text)
        );

        send({
          type: 'start',
          message: `${items.length}件中 ${targetItems.length}件を正規表現で処理`,
          total: targetItems.length,
        });

        let totalThresholds = 0;
        let processedCount = 0;

        for (const item of targetItems) {
          const extracted = extractThresholdsFromText(item.full_text);

          if (extracted.length > 0) {
            const rows = extracted.map((t) => ({
              law_item_id: item.id,
              article_num: item.article_num,
              item_num: item.item_num,
              law_id: item.law_id,
              parameter_ja: t.parameter_ja,
              parameter_en: t.parameter_en ?? null,
              unit: t.unit,
              threshold_value: t.threshold_value,
              threshold_op: t.threshold_op,
              display_expr: t.display_expr,
              material_tags: t.material_tags ?? [],
              condition_group: t.condition_group ?? 0,
              condition_conjunction: t.condition_conjunction ?? 'OR',
              source_text: item.full_text,
            }));

            const { error: insertError } = await db.from('regulation_thresholds').insert(rows);
            if (insertError) {
              send({ type: 'warning', message: `${item.article_num} ${item.item_num}: ${insertError.message}` });
            } else {
              totalThresholds += extracted.length;
            }
          }

          processedCount++;
          send({
            type: 'progress',
            current: processedCount,
            total: targetItems.length,
            message: `${item.article_num} ${item.item_num}${extracted.length > 0 ? ` → ${extracted.length}閾値` : ''}`,
          });
        }

        send({
          type: 'complete',
          message: `完了: ${totalThresholds}件の閾値を抽出・保存しました（API使用なし）`,
          totalThresholds,
        });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : '不明なエラー' });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' },
  });
}
