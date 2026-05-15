import { NextResponse } from 'next/server';
import { fetchAndParseLaw, extractLawItemRecords } from '@/lib/egov-parser';
import { createServerClient } from '@/lib/supabase';
import { requireAdmin } from '@/lib/require-admin';

const LAW_ID = '403M50000400049';

// POST /api/fetch-law-items
// e-gov から直接取得・パースして law_items テーブルに保存（LLM不使用）
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
        send({ type: 'start', message: 'e-gov から法令XML を取得中…' });

        const { lawTitle, articles } = await fetchAndParseLaw();
        const db = createServerClient();

        // 再取得前に既存レコードを全削除（古い形式のデータを残さない）
        await db.from('law_items').delete().eq('law_id', LAW_ID);

        send({
          type: 'progress',
          message: `${articles.length}条文を処理します`,
          total: articles.length,
          current: 0,
        });

        let totalItems = 0;
        let processedCount = 0;

        for (const article of articles) {
          const records = extractLawItemRecords(article);

          if (records.length === 0) {
            send({ type: 'warning', message: `${article.articleNum}: テキストなし（スキップ）` });
          } else {
            const rows = records.map((r) => ({
              article_num: r.articleNum,
              item_num: r.itemNum,
              item_text: r.itemText,
              full_text: r.fullText,
              law_id: LAW_ID,
              source_law: lawTitle,
              fetched_at: new Date().toISOString(),
            }));

            const { error } = await db
              .from('law_items')
              .insert(rows);

            if (error) {
              send({ type: 'warning', message: `${article.articleNum}: DB保存エラー: ${error.message}` });
            } else {
              totalItems += records.length;
              send({
                type: 'article_done',
                articleNum: article.articleNum,
                itemsAdded: records.length,
                totalItems,
              });
            }
          }

          processedCount++;
          send({
            type: 'progress',
            message: `${article.articleNum} 完了`,
            total: articles.length,
            current: processedCount,
          });
        }

        send({
          type: 'complete',
          message: `完了: ${totalItems}件の条文を保存しました（${lawTitle}）`,
          totalItems,
          sourceLaw: lawTitle,
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
