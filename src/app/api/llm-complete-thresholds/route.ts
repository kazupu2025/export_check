import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import Anthropic from '@anthropic-ai/sdk';

// パラメータ名の推奨語彙（classifier.ts / regex-extractor.ts と一致させる）
const PARAMETER_VOCAB = [
  '比弾性率', '比強度', '比引張強さ', '引張強さ', '圧縮強度',
  '融点', '軟化点', '分解点', '昇華温度', '沸点', '温度', '使用温度', '母材使用温度',
  '含有量', '純度', '見掛け比重', '密度', '比重', '粒径', '熱伝導率',
  '外径', '内径', '厚さ', '幅',
  '磁束密度', '周波数', '出力', '電力', '電流', '電圧',
  '製造能力', '容量', '質量', '重量', '輝度', '速度', '加速度', '圧力',
  '透過率', '吸収線量', 'ほう素当量', '軸数', '繰り返し精度', '波長',
].join('、');

export async function POST() {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));

      try {
        const db = createServerClient();
        const anthropic = new Anthropic();

        // 未解決レコードを全件取得
        const { data: unresolved, error } = await db
          .from('regulation_thresholds')
          .select('id, law_item_id, article_num, item_num, threshold_value, unit, threshold_op, display_expr, source_text')
          .eq('parameter_ja', '（数値条件）');

        if (error) throw new Error(error.message);
        if (!unresolved || unresolved.length === 0) {
          send({ type: 'complete', message: '未解決の（数値条件）はありません', updated: 0 });
          controller.close();
          return;
        }

        // law_item_id でグループ化（同じ条文テキストの複数閾値を1回のLLM呼び出しで処理）
        const byItem = new Map<string, typeof unresolved>();
        for (const r of unresolved) {
          if (!byItem.has(r.law_item_id)) byItem.set(r.law_item_id, []);
          byItem.get(r.law_item_id)!.push(r);
        }

        send({
          type: 'start',
          message: `${unresolved.length}件 / ${byItem.size}条文をLLMで補完します`,
          total: byItem.size,
        });

        let processedItems = 0;
        let updatedCount = 0;

        for (const [, records] of byItem.entries()) {
          const sourceText = records[0].source_text as string;
          const articleNum = records[0].article_num as string;
          const itemNum = records[0].item_num as string;

          const targets = records.map((r, i) => ({
            index: i + 1,
            id: r.id as string,
            display_expr: r.display_expr as string,
            threshold_value: r.threshold_value,
            unit: r.unit as string,
          }));

          const prompt = `以下は日本の外国為替及び外国貿易法に基づく貨物等省令の条文テキストです。

【条文テキスト】
${sourceText}

【パラメータ名を特定すべき閾値】
${targets.map((t) => `${t.index}. 「${t.display_expr}」（値: ${t.threshold_value}${t.unit}）`).join('\n')}

各閾値が「何のパラメータ（物理量・特性）」に対する条件かを条文の文脈から特定し、JSON配列で返してください。

【推奨パラメータ語彙（できるだけここから選ぶ）】
${PARAMETER_VOCAB}

【出力形式（JSONのみ、他の説明不要）】
[
  {"index": 1, "parameter_ja": "パラメータ名（日本語）", "parameter_en": "parameter_name_in_snake_case"},
  ...
]`;

          try {
            const response = await anthropic.messages.create({
              model: 'claude-haiku-4-5-20251001',
              max_tokens: 2048,
              messages: [{ role: 'user', content: prompt }],
            });

            const text = response.content[0].type === 'text' ? response.content[0].text : '';
            const jsonMatch = text.match(/\[[\s\S]*\]/);
            if (!jsonMatch) throw new Error('JSON応答なし');

            type LLMResult = { index: number; parameter_ja: string; parameter_en: string };
            const results = JSON.parse(jsonMatch[0]) as LLMResult[];

            for (const r of results) {
              const target = targets[r.index - 1];
              if (!target || !r.parameter_ja) continue;
              await db
                .from('regulation_thresholds')
                .update({ parameter_ja: r.parameter_ja, parameter_en: r.parameter_en ?? null })
                .eq('id', target.id);
              updatedCount++;
            }

            processedItems++;
            send({
              type: 'progress',
              current: processedItems,
              total: byItem.size,
              message: `${articleNum} ${itemNum}: ${records.length}件補完`,
            });
          } catch (e) {
            processedItems++;
            send({
              type: 'warning',
              message: `${articleNum} ${itemNum}: ${e instanceof Error ? e.message : 'エラー'}`,
            });
            send({ type: 'progress', current: processedItems, total: byItem.size, message: `${articleNum} スキップ` });
          }
        }

        send({
          type: 'complete',
          message: `完了: ${updatedCount}件のパラメータ名をLLMで補完しました`,
          updated: updatedCount,
        });
      } catch (e) {
        send({ type: 'error', message: e instanceof Error ? e.message : '不明なエラー' });
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
